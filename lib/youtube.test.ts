// @vitest-environment node
// 순수 로직 테스트. yt-dlp 호출과 fetch는 런타임 검증으로 확인한다.
// (jsdom 환경 이슈: docs/follow-ups/vitest-jsdom-undici-node.md)
import { describe, expect, it } from "vitest";

import {
  captionEventsToText,
  isYoutubeUrl,
  splitIntoSentences,
} from "@/lib/youtube";

describe("isYoutubeUrl", () => {
  it("youtube.com과 youtu.be를 받아들인다", () => {
    expect(isYoutubeUrl("https://www.youtube.com/watch?v=abc123")).toBe(true);
    expect(isYoutubeUrl("https://youtu.be/abc123?t=30")).toBe(true);
    expect(isYoutubeUrl("http://m.youtube.com/watch?v=abc")).toBe(true);
  });

  it("그 외 링크와 잘못된 문자열은 거른다", () => {
    expect(isYoutubeUrl("https://vimeo.com/123")).toBe(false);
    expect(isYoutubeUrl("그냥 텍스트")).toBe(false);
    expect(isYoutubeUrl("")).toBe(false);
  });
});

describe("captionEventsToText", () => {
  it("세그먼트를 이어붙이고 공백을 정리하며 엔티티를 복원한다", () => {
    const events = [
      { segs: [{ utf8: "Hello" }, { utf8: " world." }] },
      { segs: [{ utf8: "\n" }] },
      { segs: [{ utf8: "It&#39;s" }, { utf8: " fine &amp; good." }] },
    ];
    expect(captionEventsToText(events)).toBe(
      "Hello world. It's fine & good.",
    );
  });

  it("빈 이벤트는 빈 문자열이 된다", () => {
    expect(captionEventsToText([])).toBe("");
    expect(captionEventsToText([{ segs: [] }, {}])).toBe("");
  });

  it("이중 인코딩된 엔티티는 한 단계만 푼다", () => {
    expect(captionEventsToText([{ segs: [{ utf8: "a &amp;lt; b" }] }])).toBe(
      "a &lt; b",
    );
  });
});

describe("splitIntoSentences", () => {
  it("종결 부호 뒤 공백에서만 끊고 줄바꿈은 무시한다", () => {
    expect(
      splitIntoSentences("This is one\nsentence. And another one!"),
    ).toEqual(["This is one sentence.", "And another one!"]);
  });

  it("구두점이 없으면 통째로 한 문장이 된다", () => {
    expect(splitIntoSentences("no punctuation at all here")).toEqual([
      "no punctuation at all here",
    ]);
  });
});
