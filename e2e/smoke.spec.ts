import { expect, test, type Page, type Route } from "@playwright/test";

const VIDEO_ID = "dQw4w9WgXcQ";
const URL = `https://www.youtube.com/watch?v=${VIDEO_ID}`;
const SENTENCES = ["First sentence.", "Second sentence.", "Third sentence."];

type Item = { index: number; text: string };
type Event = { index: number; korean: string } | { index: number; failed: true };

async function mockRecords(page: Page, records: unknown[] = []) {
  await page.route("**/api/records", async (route: Route) => {
    await route.fulfill({ status: 200, json: { records } });
  });
}

async function mockCaptions(
  page: Page,
  body:
    | {
        ok: true;
        id: string;
        videoId: string;
        title: string;
        sentences: string[];
        translations: (string | null)[];
      }
    | { ok: false; error: string },
) {
  await page.route("**/api/captions", async (route: Route) => {
    await route.fulfill({ status: 200, json: body });
  });
}

async function mockTranslate(page: Page, toEvent: (item: Item) => Event) {
  await page.route("**/api/translate", async (route: Route) => {
    const req = route.request().postDataJSON() as { items: Item[] };
    const ndjson =
      req.items.map((item) => JSON.stringify(toEvent(item))).join("\n") + "\n";
    await route.fulfill({
      status: 200,
      contentType: "application/x-ndjson",
      body: ndjson,
    });
  });
}

const okCaptions = {
  ok: true as const,
  id: VIDEO_ID,
  videoId: VIDEO_ID,
  title: "리서치 영상",
  sentences: SENTENCES,
  translations: [null, null, null],
};

async function submitUrl(page: Page, url = URL) {
  await page.getByPlaceholder("https://www.youtube.com/watch?v=...").fill(url);
  await page.getByRole("button", { name: "자막 가져오기" }).click();
}

test("홈에 링크 입력 폼이 보인다", async ({ page }) => {
  await mockRecords(page);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1, name: "영상 대역 번역" }),
  ).toBeVisible();
  await expect(
    page.getByPlaceholder("https://www.youtube.com/watch?v=..."),
  ).toBeVisible();
});

test("URL 입력부 아래에 영상 목록이 뜨고 자막 아이콘은 완료된 것만 보인다", async ({
  page,
}) => {
  await mockRecords(page, [
    {
      id: VIDEO_ID,
      url: URL,
      title: "자막 있는 영상",
      hasCaptions: true,
      sentenceCount: 10,
      translatedCount: 4,
      createdAt: "2026-08-30T12:00:00.000Z",
    },
    {
      id: "https://youtu.be/pending",
      url: "https://youtu.be/pending",
      title: null,
      hasCaptions: false,
      sentenceCount: 0,
      translatedCount: 0,
      createdAt: "2026-08-29T12:00:00.000Z",
    },
  ]);
  await page.goto("/");

  const items = page.locator("main ul > li");
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toContainText("자막 있는 영상");
  await expect(items.nth(0)).toContainText("4 / 10");
  await expect(items.nth(0).getByLabel("자막 생성됨")).toHaveCount(1);
  await expect(items.nth(1).getByLabel("자막 생성됨")).toHaveCount(0);
  await expect(items.nth(0)).toContainText("26.08.30");
});

test("목록 항목을 클릭하면 저장된 번역 상태로 그 영상이 열린다", async ({ page }) => {
  await mockRecords(page, [
    {
      id: VIDEO_ID,
      url: URL,
      title: "저장된 영상",
      hasCaptions: true,
      sentenceCount: 3,
      translatedCount: 1,
    },
  ]);
  await page.route(`**/api/records/${VIDEO_ID}`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      json: {
        record: {
          id: VIDEO_ID,
          url: URL,
          title: "저장된 영상",
          sentences: SENTENCES,
          translations: ["[저장] 첫 문장", null, null],
        },
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: /저장된 영상/ }).click();

  const rows = page.locator(".tc-row");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0).locator(".tc-cell").nth(1)).toHaveText("[저장] 첫 문장");
  await expect(page.getByText("1 / 3")).toBeVisible();
  await expect(page.getByRole("button", { name: "이어서 번역" })).toBeVisible();
});

test("링크를 제출하면 영상과 문장별 2단 문서가 나온다", async ({ page }) => {
  await mockRecords(page);
  await mockCaptions(page, okCaptions);
  await page.goto("/");
  await submitUrl(page);

  await expect(page.locator("iframe")).toHaveAttribute(
    "src",
    `https://www.youtube.com/embed/${VIDEO_ID}`,
  );
  const rows = page.locator(".tc-row");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0).locator(".tc-num")).toHaveText("1");
  await expect(rows.nth(0).locator(".tc-cell").nth(0)).toHaveText("First sentence.");
  await expect(page.getByText("0 / 3")).toBeVisible();
});

test("자막을 못 받으면 문서를 만들지 않고 안내문을 보여준다", async ({ page }) => {
  await mockRecords(page);
  await mockCaptions(page, {
    ok: false,
    error: "이 영상에는 영어 자막이 없습니다.",
  });
  await page.goto("/");
  await submitUrl(page);

  await expect(page.getByText("이 영상에는 영어 자막이 없습니다.")).toBeVisible();
  await expect(page.locator(".tc-row")).toHaveCount(0);
});

test("번역 시작을 누르면 우측이 채워지고 진행률이 오른다", async ({ page }) => {
  await mockRecords(page);
  await mockCaptions(page, okCaptions);
  await mockTranslate(page, ({ index, text }) => ({
    index,
    korean: `[KO] ${text}`,
  }));
  await page.goto("/");
  await submitUrl(page);
  await page.getByRole("button", { name: "번역 시작" }).click();

  const rows = page.locator(".tc-row");
  await expect(rows.nth(0).locator(".tc-cell").nth(1)).toHaveText("[KO] First sentence.");
  await expect(rows.nth(2).locator(".tc-cell").nth(1)).toHaveText("[KO] Third sentence.");
  await expect(page.getByText("3 / 3")).toBeVisible();
});

test("실패한 행의 번역 버튼을 누르면 그 문장만 번역돼 채워진다", async ({ page }) => {
  await mockRecords(page);
  await mockCaptions(page, okCaptions);
  let call = 0;
  await page.route("**/api/translate", async (route: Route) => {
    call += 1;
    const req = route.request().postDataJSON() as { items: Item[] };
    const ndjson =
      req.items
        .map((item) =>
          JSON.stringify(
            call === 1 && item.index === 1
              ? { index: item.index, failed: true }
              : { index: item.index, korean: `[KO] ${item.text}` },
          ),
        )
        .join("\n") + "\n";
    await route.fulfill({
      status: 200,
      contentType: "application/x-ndjson",
      body: ndjson,
    });
  });
  await page.goto("/");
  await submitUrl(page);
  await page.getByRole("button", { name: "번역 시작" }).click();
  await expect(page.getByText("2 / 3")).toBeVisible();

  const failedRow = page.locator(".tc-row").nth(1);
  await failedRow.getByRole("button", { name: "번역", exact: true }).click();

  await expect(failedRow.locator(".tc-cell").nth(1)).toHaveText(
    "[KO] Second sentence.",
  );
  await expect(page.getByText("3 / 3")).toBeVisible();
});

test("정지를 누르면 번역이 멈추고 그때까지가 화면에 남는다", async ({ page }) => {
  await mockRecords(page);
  await mockCaptions(page, okCaptions);
  await page.route("**/api/translate", async () => {
    await new Promise((resolve) => setTimeout(resolve, 60_000));
  });
  await page.goto("/");
  await submitUrl(page);
  await page.getByRole("button", { name: "번역 시작" }).click();
  await expect(page.getByRole("button", { name: "정지" })).toBeVisible();

  await page.getByRole("button", { name: "정지" }).click();

  await expect(page.getByRole("button", { name: "번역 시작" })).toBeVisible();
  await expect(page.getByText("0 / 3")).toBeVisible();
});

test("영상은 고정되고 번역 영역만 스크롤한다", async ({ page }) => {
  await mockRecords(page);
  await mockCaptions(page, {
    ...okCaptions,
    sentences: Array.from({ length: 60 }, (_, i) => `Sentence number ${i + 1}.`),
    translations: Array.from({ length: 60 }, () => null),
  });
  await page.goto("/");
  await submitUrl(page);

  const overflow = await page
    .locator(".tc-scroll")
    .evaluate((el) => getComputedStyle(el).overflowY);
  expect(overflow).toBe("auto");

  const pageScrolls = await page.evaluate(
    () =>
      document.documentElement.scrollHeight >
      document.documentElement.clientHeight + 1,
  );
  expect(pageScrolls).toBe(false);
});

test("칸은 편집할 수 없고 인쇄 동작이 호출된다", async ({ page }) => {
  await mockRecords(page);
  await mockCaptions(page, okCaptions);
  await page.addInitScript(() => {
    (window as unknown as { __printCount: number }).__printCount = 0;
    window.print = () => {
      (window as unknown as { __printCount: number }).__printCount += 1;
    };
  });
  await page.goto("/");
  await submitUrl(page);

  await expect(page.locator(".tc-cell").first()).not.toHaveAttribute(
    "contenteditable",
    /.*/,
  );

  await page.getByRole("button", { name: "인쇄" }).click();
  await page.getByRole("button", { name: "PDF 저장" }).click();
  const printCount = await page.evaluate(
    () => (window as unknown as { __printCount: number }).__printCount,
  );
  expect(printCount).toBe(2);
});

test("표시 형식은 화면 오른쪽을, 저장 형식은 인쇄를 따로 바꾼다", async ({ page }) => {
  await mockRecords(page);
  await mockCaptions(page, okCaptions);
  await mockTranslate(page, ({ index, text }) => ({
    index,
    korean: `[KO] ${text}`,
  }));
  await page.goto("/");
  await submitUrl(page);
  await page.getByRole("button", { name: "번역 시작" }).click();
  await expect(page.getByText("3 / 3")).toBeVisible();

  // 기본(영어+한국어): 표만 보인다
  await expect(page.locator(".rep-both")).toBeVisible();
  await expect(page.locator(".rep-ko")).toBeHidden();
  await expect(page.locator(".rep-en")).toBeHidden();

  // 표시 형식 = 한국어만
  await page.getByLabel("표시 형식").selectOption("ko");
  await expect(page.locator(".rep-both")).toBeHidden();
  await expect(page.locator(".rep-ko")).toBeVisible();
  await expect(page.locator(".rep-ko p")).toHaveCount(3);
  await expect(page.locator(".rep-ko p").first()).toContainText("[KO] First sentence.");

  // 표시 형식 = 영어만
  await page.getByLabel("표시 형식").selectOption("en");
  await expect(page.locator(".rep-en")).toBeVisible();
  await expect(page.locator(".rep-en p").first()).toContainText("First sentence.");
  await expect(page.locator(".rep-ko")).toBeHidden();

  // 저장 형식은 화면과 독립: 화면은 영어만이어도 인쇄는 저장 형식을 따른다
  await page.getByLabel("저장 형식").selectOption("ko");
  await page.emulateMedia({ media: "print" });
  const bothDisplay = await page
    .locator(".rep-both")
    .evaluate((el) => getComputedStyle(el).display);
  const koDisplay = await page
    .locator(".rep-ko")
    .evaluate((el) => getComputedStyle(el).display);
  expect(bothDisplay).toBe("none");
  expect(koDisplay).toBe("block");
});

test("목록 항목을 삭제할 수 있다", async ({ page }) => {
  await mockRecords(page, [
    {
      id: VIDEO_ID,
      url: URL,
      title: "지울 영상",
      hasCaptions: true,
      sentenceCount: 3,
      translatedCount: 0,
    },
  ]);
  let deleted: string | null = null;
  await page.route(`**/api/records/${VIDEO_ID}`, async (route: Route) => {
    if (route.request().method() === "DELETE") {
      deleted = VIDEO_ID;
      await route.fulfill({ status: 200, json: { ok: true } });
    } else {
      await route.fallback();
    }
  });
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto("/");

  const item = page.locator("main ul > li", { hasText: "지울 영상" });
  await expect(item).toHaveCount(1);
  await item.getByRole("button", { name: "삭제" }).click();

  await expect(page.locator("main ul > li")).toHaveCount(0);
  expect(deleted).toBe(VIDEO_ID);
});

test("목록으로 돌아갈 수 있다", async ({ page }) => {
  await mockRecords(page);
  await mockCaptions(page, okCaptions);
  await page.goto("/");
  await submitUrl(page);
  await expect(page.locator(".tc-row")).toHaveCount(3);

  await page.getByRole("button", { name: "← 목록" }).click();
  await expect(
    page.getByPlaceholder("https://www.youtube.com/watch?v=..."),
  ).toBeVisible();
});
