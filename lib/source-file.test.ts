// @vitest-environment node
// 순수 로직 테스트라 DOM이 필요 없다. 이 Node 빌드에서 jsdom 환경이
// 시작되지 않는 문제(docs/follow-ups/vitest-jsdom-undici-node.md)도 피한다.
import { describe, expect, it } from "vitest";

import { parseSourceFile, splitIntoSentences } from "@/lib/source-file";

describe("splitIntoSentences", () => {
  it("종결 부호 뒤 공백에서만 문장을 끊고 부호는 앞 문장에 붙인다", () => {
    expect(splitIntoSentences("Hello world. How are you? Fine!")).toEqual([
      "Hello world.",
      "How are you?",
      "Fine!",
    ]);
  });

  it("본문 안의 줄바꿈은 문장을 끊지 않는다", () => {
    const block = "This is one\nsentence that wraps.\nAnd here is another.";
    expect(splitIntoSentences(block)).toEqual([
      "This is one sentence that wraps.",
      "And here is another.",
    ]);
  });

  it("연속된 종결 부호는 한 문장으로 둔다", () => {
    expect(splitIntoSentences("Really?!? Yes... done")).toEqual([
      "Really?!?",
      "Yes...",
      "done",
    ]);
  });

  it("종결 부호 뒤에 공백이 없으면 끊지 않는다", () => {
    expect(splitIntoSentences("cost is 3.5 dollars")).toEqual([
      "cost is 3.5 dollars",
    ]);
  });

  it("빈 덩이는 빈 목록이 된다", () => {
    expect(splitIntoSentences("   \n  \n")).toEqual([]);
  });
});

describe("parseSourceFile", () => {
  const wellFormed = [
    "리서치 영상 제목",
    "https://youtu.be/abc123",
    "=== 영어 원문 ===",
    "First sentence. Second sentence.",
    "=== 한국어 번역 ===",
    "이 섹션은 무시된다.",
  ].join("\n");

  it("제목·URL과 영어 문장 목록을 뽑고 한국어 섹션은 무시한다", () => {
    expect(parseSourceFile(wellFormed)).toEqual({
      ok: true,
      document: {
        title: "리서치 영상 제목",
        url: "https://youtu.be/abc123",
        sentences: ["First sentence.", "Second sentence."],
      },
    });
  });

  it("한국어 마커가 없으면 영어 본문을 파일 끝까지로 본다", () => {
    const raw = [
      "제목",
      "url",
      "==영어원문==",
      "Only English here. Two sentences.",
    ].join("\n");

    const result = parseSourceFile(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.sentences).toEqual([
      "Only English here.",
      "Two sentences.",
    ]);
  });

  it("마커의 공백과 등호 개수는 무시하고 인식한다", () => {
    const raw = [
      "제목",
      "url",
      "===   영어   원문   ===",
      "First.",
    ].join("\n");

    const result = parseSourceFile(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.sentences).toEqual(["First."]);
  });

  it("영어 마커가 없으면 format 실패를 돌려준다", () => {
    const raw = ["제목", "url", "First sentence.", "=== 한국어 번역 ===", "첫째."].join(
      "\n",
    );
    expect(parseSourceFile(raw)).toEqual({ ok: false, reason: "format" });
  });

  it("영어 본문에 문장이 없으면 format 실패를 돌려준다", () => {
    const raw = ["제목", "url", "=== 영어 원문 ===", "   ", "=== 한국어 번역 ===", "첫째."].join(
      "\n",
    );
    expect(parseSourceFile(raw)).toEqual({ ok: false, reason: "format" });
  });

  it("제목·URL 두 줄이 없으면 format 실패를 돌려준다", () => {
    const raw = ["제목만 있음", "=== 영어 원문 ===", "First."].join("\n");
    expect(parseSourceFile(raw)).toEqual({ ok: false, reason: "format" });
  });
});
