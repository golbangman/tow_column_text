import { listRecords } from "@/lib/store";

export const runtime = "nodejs";

// 홈 목록용. 본문(sentences/translations)은 빼고 요약만 돌려준다.
export async function GET(): Promise<Response> {
  const records = await listRecords();
  return Response.json({
    records: records.map((record) => ({
      id: record.id,
      url: record.url,
      title: record.title,
      hasCaptions: !!record.sentences && record.sentences.length > 0,
      sentenceCount: record.sentences?.length ?? 0,
      translatedCount:
        record.translations?.filter((value) => value !== null).length ?? 0,
      createdAt: record.createdAt,
    })),
  });
}
