import { translateSentences, type TranslationItem } from "@/lib/translation";

export const runtime = "nodejs";

function isItem(value: unknown): value is TranslationItem {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as TranslationItem).index === "number" &&
    typeof (value as TranslationItem).text === "string"
  );
}

// { items: {index, text}[] }를 받아 번역 결과를 한 줄에 하나씩(JSON) 흘려보낸다.
// 클라이언트가 fetch를 abort하면 request.signal이 끊기고 번역도 멈춘다.
export async function POST(request: Request): Promise<Response> {
  let items: unknown;
  try {
    ({ items } = await request.json());
  } catch {
    return new Response("본문을 읽을 수 없습니다.", { status: 400 });
  }

  if (!Array.isArray(items) || !items.every(isItem)) {
    return new Response("items는 {index, text} 배열이어야 합니다.", {
      status: 400,
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of translateSentences(
          items as TranslationItem[],
          request.signal,
        )) {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        }
      } catch {
        // 스트림이 이미 닫혔거나 번역 도중 예외가 나면 조용히 종료한다.
      } finally {
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
