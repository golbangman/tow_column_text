import { deleteRecord, getRecord } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params; // Next.js가 이미 디코딩해 준다
  const record = await getRecord(id);
  if (!record) {
    return Response.json({ error: "문서를 찾을 수 없습니다." }, { status: 404 });
  }
  return Response.json({ record });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  await deleteRecord(id);
  return Response.json({ ok: true });
}
