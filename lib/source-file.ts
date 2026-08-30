// 원문 파일에서 제목·URL과 영어 문장 목록을 뽑아낸다.
// 한국어 섹션은 무시한다. 번역은 이 모듈 밖에서 문장별로 수행한다.

// 공백과 등호 개수는 무시한다. "== 영어 원문 =="도 "=== 영어 원문 ==="도 마커로 본다.
const ENGLISH_MARKER = /^=+영어원문=+$/;
const KOREAN_MARKER = /^=+한국어번역=+$/;

function isMarker(line: string, marker: RegExp): boolean {
  return marker.test(line.replace(/\s/g, ""));
}

export type ParsedDocument = {
  title: string;
  url: string;
  sentences: string[];
};

export type ParseResult =
  | { ok: true; document: ParsedDocument }
  | { ok: false; reason: "format" };

/**
 * 본문 덩이를 문장 목록으로 자른다.
 * 줄바꿈을 공백으로 바꾸고 연속 공백을 하나로 접은 뒤, 종결 부호(. ! ?) 뒤에
 * 공백이나 문자열 끝이 오는 지점에서만 끊는다. 종결 부호는 앞 문장에 붙여 둔다.
 */
export function splitIntoSentences(block: string): string[] {
  const normalized = block.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  return normalized
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

function firstTwoNonEmptyLines(lines: string[]): [string, string] | null {
  const nonEmpty = lines
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (nonEmpty.length < 2) return null;
  return [nonEmpty[0], nonEmpty[1]];
}

/**
 * 원문 파일 텍스트에서 제목·URL과 영어 문장 목록을 뽑는다.
 * 영어 마커가 있어야 하고, 그 앞에 제목·URL 두 줄이 있어야 하며, 영어 본문에서
 * 문장이 하나 이상 나와야 한다. 그렇지 않으면 reason "format"을 돌려준다.
 * 한국어 마커가 있으면 영어 본문은 두 마커 사이로 한정하고, 없으면 파일 끝까지로 본다.
 */
export function parseSourceFile(raw: string): ParseResult {
  const lines = raw.split(/\r\n|\r|\n/);

  const englishMarkerIndex = lines.findIndex((line) =>
    isMarker(line, ENGLISH_MARKER),
  );
  if (englishMarkerIndex === -1) {
    return { ok: false, reason: "format" };
  }

  const header = firstTwoNonEmptyLines(lines.slice(0, englishMarkerIndex));
  if (!header) {
    return { ok: false, reason: "format" };
  }
  const [title, url] = header;

  const koreanMarkerIndex = lines.findIndex(
    (line, index) => index > englishMarkerIndex && isMarker(line, KOREAN_MARKER),
  );
  const englishEnd = koreanMarkerIndex === -1 ? lines.length : koreanMarkerIndex;
  const englishBlock = lines.slice(englishMarkerIndex + 1, englishEnd).join("\n");

  const sentences = splitIntoSentences(englishBlock);
  if (sentences.length === 0) {
    return { ok: false, reason: "format" };
  }

  return { ok: true, document: { title, url, sentences } };
}
