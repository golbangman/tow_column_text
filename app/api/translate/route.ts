import { translateSentences, type TranslationItem } from "@/lib/translation";
import { saveTranslations } from "@/lib/store";

export const runtime = "nodejs";

const SAVE_EVERY = 10;

function isItem(value: unknown): value is TranslationItem {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as TranslationItem).index === "number" &&
    typeof (value as TranslationItem).text === "string"
  );
}

// { items: {index, text}[], recordId? }를 받아 번역 결과를 한 줄에 하나씩(JSON) 흘려보낸다.
// recordId가 있으면 결과를 스토어에 묶어서 저장한다.
// 클라이언트가 fetch를 abort하면 request.signal이 끊기고 번역도 멈춘다.
export async function POST(request: Request): Promise<Response> {
  let items: unknown;
  let recordId: unknown;
  try {
    ({ items, recordId } = (await request.json()) as {
      items?: unknown;
      recordId?: unknown;
    });
  } catch {
    return new Response("본문을 읽을 수 없습니다.", { status: 400 });
  }

  if (!Array.isArray(items) || !items.every(isItem)) {
    return new Response("items는 {index, text} 배열이어야 합니다.", {
      status: 400,
    });
  }
  const id = typeof recordId === "string" ? recordId : null;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let pending: Array<{ index: number; korean: string }> = [];
      const flush = async () => {
        if (id && pending.length > 0) {
          const batch = pending;
          pending = [];
          await saveTranslations(id, batch).catch(() => {});
        }
      };

      try {
        for await (const event of translateSentences(
          items as TranslationItem[],
          request.signal,
        )) {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          if ("korean" in event) {
            pending.push({ index: event.index, korean: event.korean });
            if (pending.length >= SAVE_EVERY) await flush();
          }
        }
      } catch {
        // 스트림이 닫혔거나 번역 도중 예외가 나면 조용히 종료한다.
      } finally {
        await flush();
        try {
          controller.close();
        } catch {
          // 이미 닫힌 경우
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
