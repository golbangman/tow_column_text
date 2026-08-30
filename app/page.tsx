"use client";

import { useMemo, useRef, useState } from "react";

import { parseSourceFile, type ParsedDocument } from "@/lib/source-file";
import { Button } from "@/components/ui/button";

type View =
  | { status: "idle" }
  | { status: "error" }
  | { status: "ready"; key: number; doc: ParsedDocument };

const FORMAT_HINT = [
  "첫 줄에 제목, 둘째 줄에 URL",
  "그다음 === 영어 원문 === 줄과 영어 본문",
  "한국어 섹션은 있어도 무시합니다",
];

export default function Home() {
  const [view, setView] = useState<View>({ status: "idle" });
  const uploadCount = useRef(0);

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const result = parseSourceFile(await file.text());
    if (!result.ok) {
      setView({ status: "error" });
      return;
    }
    uploadCount.current += 1;
    setView({ status: "ready", key: uploadCount.current, doc: result.document });
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-6 py-10">
      <header className="no-print flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">대역 2단 문서 만들기</h1>
        <p className="text-sm text-muted-foreground">
          영어 자막 텍스트 파일을 문장 단위로 쪼개 한 문장씩 한국어로 번역합니다.
        </p>
      </header>

      <section className="no-print flex flex-col gap-3">
        <label
          htmlFor="source-file"
          className="inline-flex w-fit cursor-pointer items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/80"
        >
          텍스트 파일 열기
        </label>
        <input
          id="source-file"
          type="file"
          accept=".txt,text/plain"
          className="sr-only"
          onChange={handleFile}
        />
        <ul className="list-disc pl-5 text-sm text-muted-foreground">
          {FORMAT_HINT.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>

      {view.status === "error" && (
        <p
          role="alert"
          className="no-print rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          파일 형식을 확인해 주세요. <code>=== 영어 원문 ===</code> 줄이 있어야 하고,
          그 앞에 제목과 URL 두 줄, 그 뒤에 영어 본문이 있어야 합니다.
        </p>
      )}

      {view.status === "ready" && (
        <TranslationDoc key={view.key} doc={view.doc} />
      )}
    </main>
  );
}

type Cell = { text: string } | { failed: true } | null;
type Phase = "before" | "running" | "stopped" | "done";

function TranslationDoc({ doc }: { doc: ParsedDocument }) {
  const [cells, setCells] = useState<Cell[]>(() =>
    doc.sentences.map(() => null),
  );
  const [phase, setPhase] = useState<Phase>("before");
  const [retrying, setRetrying] = useState<ReadonlySet<number>>(
    () => new Set(),
  );
  const abortRef = useRef<AbortController | null>(null);

  const doneCount = useMemo(
    () => cells.filter((cell) => cell !== null && "text" in cell).length,
    [cells],
  );

  type TranslationEvent =
    | { index: number; korean: string }
    | { index: number; failed: true };

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
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase("running");

    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          items: doc.sentences.map((text, index) => ({ index, text })),
        }),
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
      // AbortError를 포함한 모든 중단은 "멈춤"으로 본다. 채워진 칸은 그대로 둔다.
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
        }),
      });
      if (res.ok) applyNdjson(await res.text());
    } catch {
      // 실패하면 그대로 둔다. "재시도"를 다시 누를 수 있다.
    } finally {
      setRetrying((prev) => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
    }
  }

  return (
    <>
      <div className="no-print flex flex-wrap items-center gap-3 border-y py-3">
        <div className="mr-auto flex flex-col">
          <span className="text-sm font-medium">{doc.title}</span>
          <span className="text-xs break-all text-muted-foreground">{doc.url}</span>
        </div>

        <span className="text-sm tabular-nums text-muted-foreground">
          {doneCount} / {doc.sentences.length}
        </span>

        {phase === "running" ? (
          <Button variant="outline" onClick={stop}>
            정지
          </Button>
        ) : (
          <Button onClick={start}>
            {phase === "before" ? "번역 시작" : "번역 다시"}
          </Button>
        )}

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
      </div>

      <table className="tc-doc">
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
                    <span className="text-xs text-muted-foreground">번역 중…</span>
                  ) : cell !== null || phase !== "running" ? (
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => retry(index)}
                    >
                      다시번역
                    </Button>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
