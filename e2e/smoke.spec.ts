import { expect, test, type Page, type Route } from "@playwright/test";

const wellFormed = [
  "리서치 영상 제목",
  "https://youtu.be/abc123",
  "=== 영어 원문 ===",
  "First sentence. Second sentence. Third sentence.",
  "=== 한국어 번역 ===",
  "이 섹션은 무시된다.",
].join("\n");

const malformed = ["제목", "마커가 없는 본문일 뿐이다."].join("\n");

type Item = { index: number; text: string };
type Event = { index: number; korean: string } | { index: number; failed: true };

async function upload(page: Page, name: string, content: string) {
  await page.setInputFiles("#source-file", {
    name,
    mimeType: "text/plain",
    buffer: Buffer.from(content, "utf-8"),
  });
}

async function mockTranslate(page: Page, toEvent: (item: Item) => Event) {
  await page.route("**/api/translate", async (route: Route) => {
    const body = route.request().postDataJSON() as { items: Item[] };
    const ndjson =
      body.items.map((item) => JSON.stringify(toEvent(item))).join("\n") + "\n";
    await route.fulfill({
      status: 200,
      contentType: "application/x-ndjson",
      body: ndjson,
    });
  });
}

test("홈 화면이 열리고 안내 제목이 보인다", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("대역 2단 문서 만들기");
  await expect(
    page.getByRole("heading", { level: 1, name: "대역 2단 문서 만들기" }),
  ).toBeVisible();
});

test("파일을 올리면 좌측에 영어 문장이 한 행씩, 우측은 빈 2단 문서가 나온다", async ({
  page,
}) => {
  await page.goto("/");
  await upload(page, "well-formed.txt", wellFormed);

  const rows = page.locator(".tc-row");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0).locator(".tc-num")).toHaveText("1");
  await expect(rows.nth(2).locator(".tc-num")).toHaveText("3");
  await expect(rows.nth(0).locator(".tc-cell").nth(0)).toHaveText("First sentence.");
  await expect(rows.nth(0).locator(".tc-cell").nth(1)).toHaveText("");
  await expect(page.getByText("0 / 3")).toBeVisible();
});

test("번역 시작을 누르면 우측이 채워지고 진행률이 오른다", async ({ page }) => {
  await mockTranslate(page, ({ index, text }) => ({
    index,
    korean: `[KO] ${text}`,
  }));
  await page.goto("/");
  await upload(page, "well-formed.txt", wellFormed);
  await page.getByRole("button", { name: "번역 시작" }).click();

  const rows = page.locator(".tc-row");
  await expect(rows.nth(0).locator(".tc-cell").nth(1)).toHaveText("[KO] First sentence.");
  await expect(rows.nth(2).locator(".tc-cell").nth(1)).toHaveText("[KO] Third sentence.");
  await expect(page.getByText("3 / 3")).toBeVisible();
});

test("번역 실패한 문장은 우측이 비고 영어만 남으며 나머지는 번역된다", async ({
  page,
}) => {
  await mockTranslate(page, ({ index, text }) =>
    index === 1 ? { index, failed: true } : { index, korean: `[KO] ${text}` },
  );
  await page.goto("/");
  await upload(page, "well-formed.txt", wellFormed);
  await page.getByRole("button", { name: "번역 시작" }).click();

  const rows = page.locator(".tc-row");
  await expect(rows.nth(1).locator(".tc-cell").nth(0)).toHaveText("Second sentence.");
  await expect(
    rows.nth(1).locator(".tc-cell").nth(1).getByText("[KO]"),
  ).toHaveCount(0);
  await expect(rows.nth(0).locator(".tc-cell").nth(1)).toHaveText("[KO] First sentence.");
  await expect(page.getByText("2 / 3")).toBeVisible();
});

test("실패한 행의 다시번역을 누르면 그 문장만 번역돼 채워진다", async ({
  page,
}) => {
  let call = 0;
  await page.route("**/api/translate", async (route: Route) => {
    call += 1;
    const body = route.request().postDataJSON() as { items: Item[] };
    const ndjson =
      body.items
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
  await upload(page, "well-formed.txt", wellFormed);
  await page.getByRole("button", { name: "번역 시작" }).click();
  await expect(page.getByText("2 / 3")).toBeVisible();

  const failedRow = page.locator(".tc-row").nth(1);
  await expect(failedRow.locator(".tc-cell").nth(1)).toHaveText("");
  await failedRow.getByRole("button", { name: "다시번역" }).click();

  await expect(failedRow.locator(".tc-cell").nth(1)).toHaveText(
    "[KO] Second sentence.",
  );
  await expect(page.getByText("3 / 3")).toBeVisible();
});

test("이미 번역된 행의 다시번역은 그 문장의 번역을 덮어쓴다", async ({ page }) => {
  let call = 0;
  await page.route("**/api/translate", async (route: Route) => {
    call += 1;
    const label = call === 1 ? "일차" : "이차";
    const body = route.request().postDataJSON() as { items: Item[] };
    const ndjson =
      body.items
        .map((item) => JSON.stringify({ index: item.index, korean: `[${label}] ${item.text}` }))
        .join("\n") + "\n";
    await route.fulfill({
      status: 200,
      contentType: "application/x-ndjson",
      body: ndjson,
    });
  });
  await page.goto("/");
  await upload(page, "well-formed.txt", wellFormed);
  await page.getByRole("button", { name: "번역 시작" }).click();

  const firstRow = page.locator(".tc-row").nth(0);
  await expect(firstRow.locator(".tc-cell").nth(1)).toHaveText("[일차] First sentence.");

  await firstRow.getByRole("button", { name: "다시번역" }).click();

  await expect(firstRow.locator(".tc-cell").nth(1)).toHaveText("[이차] First sentence.");
  await expect(page.locator(".tc-row").nth(1).locator(".tc-cell").nth(1)).toHaveText(
    "[일차] Second sentence.",
  );
  await expect(page.getByText("3 / 3")).toBeVisible();
});

test("정지를 누르면 번역이 멈추고 그때까지가 화면에 남는다", async ({ page }) => {
  await page.route("**/api/translate", async () => {
    await new Promise((resolve) => setTimeout(resolve, 60_000));
  });
  await page.goto("/");
  await upload(page, "well-formed.txt", wellFormed);
  await page.getByRole("button", { name: "번역 시작" }).click();
  await expect(page.getByRole("button", { name: "정지" })).toBeVisible();

  await page.getByRole("button", { name: "정지" }).click();

  await expect(page.getByRole("button", { name: "번역 다시" })).toBeVisible();
  await expect(page.locator(".tc-row").nth(0).locator(".tc-cell").nth(1)).toHaveText("");
  await expect(page.getByText("0 / 3")).toBeVisible();
});

test("형식이 어긋난 파일은 문서를 만들지 않고 안내문을 보여준다", async ({
  page,
}) => {
  await page.goto("/");
  await upload(page, "malformed.txt", malformed);

  await expect(page.getByText("파일 형식을 확인해 주세요")).toBeVisible();
  await expect(page.locator(".tc-row")).toHaveCount(0);
});

test("칸은 편집할 수 없고 인쇄 동작이 호출된다", async ({ page }) => {
  await mockTranslate(page, ({ index, text }) => ({ index, korean: `[KO] ${text}` }));
  await page.addInitScript(() => {
    (window as unknown as { __printCount: number }).__printCount = 0;
    window.print = () => {
      (window as unknown as { __printCount: number }).__printCount += 1;
    };
  });
  await page.goto("/");
  await upload(page, "well-formed.txt", wellFormed);

  const anyCell = page.locator(".tc-cell").first();
  await expect(anyCell).not.toHaveAttribute("contenteditable", /.*/);

  await page.getByRole("button", { name: "인쇄" }).click();
  await page.getByRole("button", { name: "PDF 저장" }).click();
  const printCount = await page.evaluate(
    () => (window as unknown as { __printCount: number }).__printCount,
  );
  expect(printCount).toBe(2);
});
