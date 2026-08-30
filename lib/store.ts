// 서버 전용. 대역 문서를 data/records.json 파일에 보관한다.
// 참조 구현: youtube_caption/lib/store.ts

import { promises as fs } from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "records.json");

export type DocRecord = {
  id: string; // 영상 ID가 있으면 그것, 없으면 입력한 URL
  url: string;
  title: string | null;
  sentences: string[] | null; // null = 자막 미생성
  translations: (string | null)[] | null; // sentences와 같은 길이. null = 미번역(실패 포함)
  createdAt: string;
};

// 이 프로세스 안의 read-modify-write를 한 줄로 세워 파일이 겹쳐 쓰이지 않게 한다.
let writeQueue: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(fn, fn);
  writeQueue = run.catch(() => {});
  return run;
}

async function readAll(): Promise<DocRecord[]> {
  try {
    return JSON.parse(await fs.readFile(DATA_FILE, "utf-8")) as DocRecord[];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

async function writeAll(records: DocRecord[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${DATA_FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(records, null, 2), "utf-8");
  await fs.rename(tmp, DATA_FILE); // 원자적 교체 — 읽는 쪽이 반쪽 파일을 보지 않는다
}

/** 최신순 목록. */
export async function listRecords(): Promise<DocRecord[]> {
  const records = await readAll();
  return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getRecord(id: string): Promise<DocRecord | null> {
  return (await readAll()).find((record) => record.id === id) ?? null;
}

/**
 * URL 제출 시 기록을 만들거나 가져온다.
 * - 영상 ID나 URL로 이미 자막이 있는 기록을 찾으면 그대로 돌려준다(재열람).
 * - 이전에 실패해 자막이 없던 기록이면 이번 자막으로 채워 올린다.
 * - 없으면 새로 만든다.
 */
export function upsertOnSubmit(input: {
  url: string;
  videoId: string | null;
  title: string | null;
  sentences: string[] | null;
}): Promise<DocRecord> {
  return withLock(async () => {
    const records = await readAll();
    const id = input.videoId ?? input.url;

    const existing =
      (input.videoId
        ? records.find((record) => record.id === input.videoId)
        : undefined) ?? records.find((record) => record.url === input.url);

    if (existing) {
      if (existing.sentences || !input.sentences) return existing;
      // 실패 자리표시자를 이번 자막으로 승격
      existing.id = id;
      existing.title = input.title;
      existing.sentences = input.sentences;
      existing.translations = input.sentences.map(() => null);
      await writeAll(records);
      return existing;
    }

    const record: DocRecord = {
      id,
      url: input.url,
      title: input.title,
      sentences: input.sentences,
      translations: input.sentences ? input.sentences.map(() => null) : null,
      createdAt: new Date().toISOString(),
    };
    records.push(record);
    await writeAll(records);
    return record;
  });
}

/** 기록을 지운다. 없으면 조용히 넘어간다. */
export function deleteRecord(id: string): Promise<void> {
  return withLock(async () => {
    const records = await readAll();
    const next = records.filter((record) => record.id !== id);
    if (next.length !== records.length) await writeAll(next);
  });
}

/** 번역 결과 여러 개를 한 번에 기록한다. */
export function saveTranslations(
  id: string,
  entries: Array<{ index: number; korean: string }>,
): Promise<void> {
  if (entries.length === 0) return Promise.resolve();
  return withLock(async () => {
    const records = await readAll();
    const record = records.find((item) => item.id === id);
    if (!record || !record.sentences) return;

    const translations = record.translations ?? record.sentences.map(() => null);
    for (const { index, korean } of entries) {
      if (index >= 0 && index < translations.length) {
        translations[index] = korean;
      }
    }
    record.translations = translations;
    await writeAll(records);
  });
}
