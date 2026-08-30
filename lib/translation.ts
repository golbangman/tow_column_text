// 서버 전용. headless 브라우저로 translate.google.com을 조작해 영어 문장을
// 하나씩 한국어로 옮긴다. 클라이언트에서 import 하지 말 것.
// 참조 구현: youtube_caption/lib/browser-translate.ts

import { chromium, type Page } from "playwright";

const NAV_TIMEOUT_MS = 20_000;
const RESULT_TIMEOUT_MS = 20_000;

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

/**
 * 문장을 순서대로 하나씩 번역해 결과를 흘려보낸다. 한 문장이 실패하면 그 문장은
 * failed로 표시하고 다음 문장으로 넘어간다. signal이 중단되면 즉시 멈추고 브라우저를
 * 닫는다. 브라우저는 이 실행 하나에만 묶여 있다.
 */
export async function* translateSentences(
  items: TranslationItem[],
  signal?: AbortSignal,
): AsyncGenerator<TranslationEvent> {
  if (items.length === 0) return;

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    for (const { index, text } of items) {
      if (signal?.aborted) return;

      const trimmed = text.trim();
      if (!trimmed) {
        yield { index, korean: "" };
        continue;
      }

      try {
        const korean = await translateOne(page, trimmed);
        yield { index, korean };
      } catch {
        yield { index, failed: true };
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }
}
