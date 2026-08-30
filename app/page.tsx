"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Captions, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";

type Doc = {
  id: string;
  videoId: string;
  title: string;
  url: string;
  sentences: string[];
  translations: (string | null)[];
};

type View =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; key: number; doc: Doc };

type RecordSummary = {
  id: string;
  url: string;
  title: string | null;
  hasCaptions: boolean;
  sentenceCount: number;
  translatedCount: number;
  createdAt: string;
};

function formatYmd(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}.${mm}.${dd}`;
}

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

export default function Home() {
  const [view, setView] = useState<View>({ status: "idle" });
  const [records, setRecords] = useState<RecordSummary[]>([]);
  const loadCount = useRef(0);

  useEffect(() => {
    if (view.status !== "idle") return;
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/records");
        const data = (await res.json()) as { records: RecordSummary[] };
        if (active) setRecords(data.records);
      } catch {
        // 목록을 못 불러오면 빈 채로 둔다.
      }
    })();
    return () => {
      active = false;
    };
  }, [view.status]);

  function openDoc(doc: Doc) {
    loadCount.current += 1;
    setView({ status: "ready", key: loadCount.current, doc });
  }

  async function removeRecord(id: string) {
    if (!window.confirm("이 영상을 목록에서 지울까요? 저장된 번역도 함께 사라집니다.")) {
      return;
    }
    setRecords((prev) => prev.filter((record) => record.id !== id));
    try {
      await fetch(`/api/records/${encodeURIComponent(id)}`, { method: "DELETE" });
    } catch {
      // 실패해도 화면 목록에서는 이미 뺐다. 새로고침하면 실제 상태가 보인다.
    }
  }

  async function loadCaptions(url: string) {
    setView({ status: "loading" });
    try {
      const res = await fetch("/api/captions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = (await res.json()) as CaptionsResponse;
      if (!data.ok) {
        setView({ status: "error", message: data.error });
        return;
      }
      openDoc({
        id: data.id,
        videoId: data.videoId,
        title: data.title,
        url,
        sentences: data.sentences,
        translations: data.translations,
      });
    } catch {
      setView({ status: "error", message: "자막을 가져오지 못했습니다." });
    }
  }

  async function loadRecord(id: string) {
    setView({ status: "loading" });
    try {
      const res = await fetch(`/api/records/${encodeURIComponent(id)}`);
      if (!res.ok) {
        setView({ status: "error", message: "문서를 열지 못했습니다." });
        return;
      }
      const { record } = (await res.json()) as {
        record: {
          id: string;
          url: string;
          title: string | null;
          sentences: string[] | null;
          translations: (string | null)[] | null;
        };
      };
      if (!record.sentences) {
        // 자막이 아직 없는 기록이면 다시 시도한다.
        loadCaptions(record.url);
        return;
      }
      openDoc({
        id: record.id,
        // 자막이 있는 기록은 id가 곧 영상 ID다(store의 upsertOnSubmit 참고).
        videoId: record.id,
        title: record.title ?? record.url,
        url: record.url,
        sentences: record.sentences,
        translations:
          record.translations ?? record.sentences.map(() => null),
      });
    } catch {
      setView({ status: "error", message: "문서를 열지 못했습니다." });
    }
  }

  if (view.status === "ready") {
    return (
      <TranslationView
        key={view.key}
        doc={view.doc}
        onBack={() => setView({ status: "idle" })}
      />
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">영상 대역 번역</h1>
        <p className="text-sm text-muted-foreground">
          YouTube 링크를 넣으면 영어 자막을 문장 단위로 한국어로 번역하고, 영상과 함께
          봅니다.
        </p>
      </header>

      <form
        className="flex flex-col gap-3 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          const url = new FormData(event.currentTarget).get("url");
          if (typeof url === "string" && url.trim()) loadCaptions(url.trim());
        }}
      >
        <input
          name="url"
          type="url"
          required
          placeholder="https://www.youtube.com/watch?v=..."
          disabled={view.status === "loading"}
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring"
        />
        <Button type="submit" disabled={view.status === "loading"}>
          {view.status === "loading" ? "가져오는 중…" : "자막 가져오기"}
        </Button>
      </form>

      {view.status === "error" && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {view.message}
        </p>
      )}

      {records.length > 0 && (
        <ul className="flex flex-col divide-y rounded-md border">
          {records.map((record, index) => (
            <li key={record.id} className="flex items-center hover:bg-muted">
              <button
                type="button"
                onClick={() => loadRecord(record.id)}
                className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left"
              >
                <span className="w-6 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                  {index + 1}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {formatYmd(record.createdAt)}
                </span>
                {record.hasCaptions && (
                  <Captions
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-label="자막 생성됨"
                  />
                )}
                <span className="min-w-0 flex-1 truncate text-sm">
                  {record.title ?? record.url}
                </span>
                {record.hasCaptions && (
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {record.translatedCount} / {record.sentenceCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => removeRecord(record.id)}
                aria-label="삭제"
                className="shrink-0 p-3 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

type Cell = { text: string } | { failed: true } | null;
type Phase = "before" | "running" | "stopped" | "done";
type Fmt = "both" | "ko" | "en";

const FMT_OPTIONS: Array<{ value: Fmt; label: string }> = [
  { value: "both", label: "영어+한국어" },
  { value: "ko", label: "한국어만" },
  { value: "en", label: "영어만" },
];

function FmtSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Fmt;
  onChange: (fmt: Fmt) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as Fmt)}
        className="rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground"
      >
        {FMT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

type TranslationEvent =
  | { index: number; korean: string }
  | { index: number; failed: true };

function cellsFrom(translations: (string | null)[]): Cell[] {
  return translations.map((value) => (value === null ? null : { text: value }));
}

function TranslationView({ doc, onBack }: { doc: Doc; onBack: () => void }) {
  const [cells, setCells] = useState<Cell[]>(() =>
    cellsFrom(doc.translations),
  );
  const [phase, setPhase] = useState<Phase>("before");
  const [retrying, setRetrying] = useState<ReadonlySet<number>>(
    () => new Set(),
  );
  const [screenFmt, setScreenFmt] = useState<Fmt>("both");
  const [printFmt, setPrintFmt] = useState<Fmt>("both");
  const abortRef = useRef<AbortController | null>(null);

  const doneCount = useMemo(
    () => cells.filter((cell) => cell !== null && "text" in cell).length,
    [cells],
  );

  function applyEvent(event: TranslationEvent) {
    setCells((prev) => {
      const next = prev.slice();
      next[event.index] =
        "korean" in event ? { text: event.korean } : { failed: true };
      return next;
    });
  }

  function applyNdjson(text: string) {
    for (const line of text.split("\n")) {
      if (line.trim()) applyEvent(JSON.parse(line) as TranslationEvent);
    }
  }

  async function start() {
    const items = doc.sentences
      .map((text, index) => ({ index, text }))
      .filter(({ index }) => {
        const cell = cells[index];
        return cell === null || !("text" in cell);
      });
    if (items.length === 0) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setPhase("running");

    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items, recordId: doc.id }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        setPhase("stopped");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        applyNdjson(lines.join("\n"));
      }
      applyNdjson(buffer + decoder.decode());
      setPhase("done");
    } catch {
      setPhase("stopped");
    } finally {
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  async function retry(index: number) {
    setRetrying((prev) => new Set(prev).add(index));
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          items: [{ index, text: doc.sentences[index] }],
          recordId: doc.id,
        }),
      });
      if (res.ok) applyNdjson(await res.text());
    } catch {
      // 실패하면 그대로 둔다.
    } finally {
      setRetrying((prev) => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
    }
  }

  return (
    <main
      data-screen={screenFmt}
      data-print={printFmt}
      className="flex h-[100dvh] overflow-hidden print:block print:h-auto print:overflow-visible"
    >
      <aside className="no-print flex w-[48%] min-w-[400px] max-w-[760px] shrink-0 flex-col gap-4 overflow-y-auto border-r p-5">
        <button
          type="button"
          onClick={onBack}
          className="w-fit text-sm text-muted-foreground hover:underline"
        >
          ← 목록
        </button>

        <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
          <iframe
            src={`https://www.youtube.com/embed/${doc.videoId}`}
            title={doc.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="h-full w-full"
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">{doc.title}</span>
          <span className="text-xs break-all text-muted-foreground">
            {doc.url}
          </span>
        </div>

        <span className="text-sm tabular-nums text-muted-foreground">
          {doneCount} / {doc.sentences.length}
        </span>

        <div className="flex flex-wrap items-center gap-2">
          {phase === "running" ? (
            <Button variant="outline" onClick={stop}>
              정지
            </Button>
          ) : (
            <Button onClick={start} disabled={doneCount === doc.sentences.length}>
              {doneCount === 0 ? "번역 시작" : "이어서 번역"}
            </Button>
          )}
          <FmtSelect label="표시 형식" value={screenFmt} onChange={setScreenFmt} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => window.print()}>
            인쇄
          </Button>
          <Button
            variant="outline"
            onClick={() => window.print()}
            title="인쇄 대화상자에서 대상을 'PDF로 저장'으로 고르세요"
          >
            PDF 저장
          </Button>
          <FmtSelect label="저장 형식" value={printFmt} onChange={setPrintFmt} />
        </div>
      </aside>

      <div className="tc-scroll min-h-0 flex-1 overflow-y-auto print:overflow-visible">
        <div className="w-full px-6 py-4 print:px-0">
          <table className="tc-doc rep rep-both">
            <colgroup>
              <col className="tc-col-num" />
              <col className="tc-col-en" />
              <col className="tc-col-ko" />
              <col className="tc-col-action" />
            </colgroup>
            <thead className="tc-running-header">
              <tr>
                <th scope="col" colSpan={4}>
                  <span className="tc-running-title">{doc.title}</span>
                  <span className="tc-running-url">{doc.url}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {doc.sentences.map((sentence, index) => {
                const cell = cells[index];
                return (
                  <tr key={index} className="tc-row">
                    <td className="tc-num">{index + 1}</td>
                    <td className="tc-cell" lang="en">
                      {sentence}
                    </td>
                    <td className="tc-cell" lang="ko">
                      {cell && "text" in cell ? cell.text : ""}
                    </td>
                    <td className="tc-action no-print">
                      {retrying.has(index) ? (
                        <span className="text-xs text-muted-foreground">
                          번역 중…
                        </span>
                      ) : cell !== null || phase !== "running" ? (
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => retry(index)}
                        >
                          번역
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="tc-flow rep rep-ko">
            <h2>
              {doc.title} — {doc.url}
            </h2>
            {doc.sentences.map((sentence, index) => {
              const cell = cells[index];
              return (
                <p key={index}>
                  <span className="tc-flow-num">{index + 1}</span>
                  {cell && "text" in cell ? cell.text : sentence}
                </p>
              );
            })}
          </div>

          <div className="tc-flow rep rep-en">
            <h2>
              {doc.title} — {doc.url}
            </h2>
            {doc.sentences.map((sentence, index) => (
              <p key={index}>
                <span className="tc-flow-num">{index + 1}</span>
                {sentence}
              </p>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
