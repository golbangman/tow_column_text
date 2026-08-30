// 서버 전용. headless 브라우저로 translate.google.com을 조작해 영어 문장을
// 한국어로 옮긴다. 문장당 페이지를 새로 열고, 여러 페이지를 병렬로 돌린다.
// 클라이언트에서 import 하지 말 것. 참조: youtube_caption/lib/browser-translate.ts

import { chromium, type Page } from "playwright";

const NAV_TIMEOUT_MS = 20_000;
const RESULT_TIMEOUT_MS = 20_000;
// 동시에 조작하는 페이지 수. 너무 크면 translate.google.com이 차단할 수 있어 2로 둔다.
const CONCURRENCY = 2;

export type TranslationItem = { index: number; text: string };

export type TranslationEvent =
  | { index: number; korean: string }
  | { index: number; failed: true };

async function translateOne(page: Page, text: string): Promise<string> {
  const url = `https://translate.google.com/?sl=en&tl=ko&text=${encodeURIComponent(
    text,
  )}&op=translate`;
  await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: NAV_TIMEOUT_MS,
  });
  await page.waitForFunction(
    () => {
      const el = document.querySelector('textarea[lang="ko"]');
      return el instanceof HTMLTextAreaElement && el.value.trim().length > 0;
    },
    { timeout: RESULT_TIMEOUT_MS },
  );
  const value = await page.locator('textarea[lang="ko"]').inputValue();
  return value.trim();
}

// 여러 워커가 밀어 넣고, 하나의 소비자가 순서대로 꺼내 쓰는 채널.
function createChannel<T>() {
  const buffer: T[] = [];
  const waiters: Array<(result: IteratorResult<T>) => void> = [];
  let closed = false;

  return {
    push(value: T) {
      const waiter = waiters.shift();
      if (waiter) waiter({ value, done: false });
      else buffer.push(value);
    },
    close() {
      closed = true;
      while (waiters.length) {
        waiters.shift()!({ value: undefined as never, done: true });
      }
    },
    async *drain(): AsyncGenerator<T> {
      for (;;) {
        if (buffer.length) {
          yield buffer.shift()!;
          continue;
        }
        if (closed) return;
        const result = await new Promise<IteratorResult<T>>((resolve) =>
          waiters.push(resolve),
        );
        if (result.done) return;
        yield result.value;
      }
    },
  };
}

/**
 * 문장을 번역해 결과를 흘려보낸다. 페이지 여러 개를 병렬로 돌리므로 결과 순서는
 * 입력 순서와 다를 수 있다(각 이벤트에 index가 있으니 문제없다). 한 문장이 실패하면
 * failed로 표시하고 넘어간다. signal이 중단되면 워커가 큐에서 그만 꺼내고 브라우저를
 * 닫는다. 브라우저는 이 실행 하나에만 묶여 있다.
 */
export async function* translateSentences(
  items: TranslationItem[],
  signal?: AbortSignal,
): AsyncGenerator<TranslationEvent> {
  if (items.length === 0) return;

  const browser = await chromium.launch({ headless: true });
  const channel = createChannel<TranslationEvent>();
  const queue = items.slice();
  const workerCount = Math.min(CONCURRENCY, items.length);

  const run = (async () => {
    const pages = await Promise.all(
      Array.from({ length: workerCount }, () => browser.newPage()),
    );
    await Promise.all(
      pages.map(async (page) => {
        for (;;) {
          if (signal?.aborted) return;
          const item = queue.shift();
          if (!item) return;

          const text = item.text.trim();
          if (!text) {
            channel.push({ index: item.index, korean: "" });
            continue;
          }
          try {
            const korean = await translateOne(page, text);
            channel.push({ index: item.index, korean });
          } catch {
            channel.push({ index: item.index, failed: true });
          }
        }
      }),
    );
  })().finally(() => channel.close());

  try {
    for await (const event of channel.drain()) yield event;
    await run;
  } finally {
    await browser.close().catch(() => {});
  }
}
