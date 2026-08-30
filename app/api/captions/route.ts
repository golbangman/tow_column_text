import {
  CaptionError,
  fetchEnglishSentences,
  isYoutubeUrl,
} from "@/lib/youtube";
import { upsertOnSubmit } from "@/lib/store";

export const runtime = "nodejs";

type CaptionsResponse =
  | {
      ok: true;
      id: string;
      videoId: string;
      title: string;
      sentences: string[];
      translations: (string | null)[];
    }
  | { ok: false; error: string };

// { url } → 영어 자막을 받아 문장 목록으로. 결과와 무관하게 기록을 남긴다.
export async function POST(request: Request): Promise<Response> {
  let url: unknown;
  try {
    ({ url } = await request.json());
  } catch {
    return Response.json({
      ok: false,
      error: "요청을 읽을 수 없습니다.",
    } satisfies CaptionsResponse);
  }

  if (typeof url !== "string" || !isYoutubeUrl(url)) {
    return Response.json({
      ok: false,
      error: "YouTube 영상 링크를 입력해 주세요.",
    } satisfies CaptionsResponse);
  }

  try {
    const { videoId, title, sentences } = await fetchEnglishSentences(url);
    const record = await upsertOnSubmit({ url, videoId, title, sentences });
    return Response.json({
      ok: true,
      id: record.id,
      videoId,
      title: record.title ?? title,
      sentences: record.sentences ?? sentences,
      translations:
        record.translations ?? (record.sentences ?? sentences).map(() => null),
    } satisfies CaptionsResponse);
  } catch (err) {
    await upsertOnSubmit({ url, videoId: null, title: null, sentences: null });
    const error =
      err instanceof CaptionError ? err.message : "자막을 가져오지 못했습니다.";
    return Response.json({ ok: false, error } satisfies CaptionsResponse);
  }
}
