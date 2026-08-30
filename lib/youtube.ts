// 서버 전용. YouTube 링크에서 영어 자막을 받아 문장 목록으로 만든다.
// 참조 구현: youtube_caption/lib/youtube.ts

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// YouTube 자막 추출에는 JS 챌린지 해결기가 필요하다. deno가 PATH에 없을 수도 있어
// 흔한 설치 위치를 직접 넘긴다.
function jsRuntimeArgs(): string[] {
  const denoPath = path.join(homedir(), ".deno", "bin", "deno");
  return existsSync(denoPath) ? ["--js-runtimes", `deno:${denoPath}`] : [];
}

type YtDlpSubtitleFormat = { ext: string; url: string };

type YtDlpInfo = {
  id: string;
  title?: string;
  subtitles?: Record<string, YtDlpSubtitleFormat[]>;
  automatic_captions?: Record<string, YtDlpSubtitleFormat[]>;
};

type CaptionEvent = { segs?: Array<{ utf8?: string }> };

export type CaptionErrorReason =
  | "yt-dlp-missing"
  | "info-failed"
  | "no-captions"
  | "fetch-failed";

export class CaptionError extends Error {
  reason: CaptionErrorReason;
  constructor(reason: CaptionErrorReason, message: string) {
    super(message);
    this.reason = reason;
  }
}

export function isYoutubeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === "youtu.be" || parsed.hostname.endsWith("youtube.com")
    );
  } catch {
    return false;
  }
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&"); // 이중 인코딩(&amp;lt;)이 풀리도록 마지막에
}

/**
 * 본문 덩이를 문장 목록으로 자른다. 줄바꿈을 공백으로 바꾸고 연속 공백을 하나로
 * 접은 뒤, 종결 부호(. ! ?) 뒤에 공백이나 문자열 끝이 오는 지점에서만 끊는다.
 */
export function splitIntoSentences(block: string): string[] {
  const normalized = block.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  return normalized
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

/** json3 자막 이벤트들을 한 덩어리 텍스트로 이어붙인다. */
export function captionEventsToText(events: CaptionEvent[]): string {
  return decodeEntities(
    events
      .map((event) => (event.segs ?? []).map((seg) => seg.utf8 ?? "").join(""))
      .join(" ")
      .replace(/\n/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function pickJson3Url(formats: YtDlpSubtitleFormat[] | undefined): string | null {
  return formats?.find((format) => format.ext === "json3")?.url ?? null;
}

// 업로드 자막과 자동 생성 자막에서 영어(en, en-*) json3 URL을 모두 모은다.
// 업로드 자막이 항상 낫지는 않다(구두점 없는 원시 전사본을 올린 영상이 있다).
function englishJson3Urls(info: YtDlpInfo): string[] {
  const urls: string[] = [];
  for (const group of [info.subtitles, info.automatic_captions]) {
    if (!group) continue;
    for (const key of Object.keys(group)) {
      if (key !== "en" && !key.startsWith("en-")) continue;
      const j3 = pickJson3Url(group[key]);
      if (j3) urls.push(j3);
    }
  }
  return [...new Set(urls)];
}

async function fetchCaptionSentences(url: string): Promise<string[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(String(res.status));
  const body = (await res.json()) as { events?: CaptionEvent[] };
  return splitIntoSentences(captionEventsToText(body.events ?? []));
}

async function fetchVideoInfo(url: string): Promise<YtDlpInfo> {
  try {
    const { stdout } = await execFileAsync(
      "yt-dlp",
      [
        "--skip-download",
        "--dump-json",
        "--no-warnings",
        // YouTube가 요구하는 JS 챌린지 해결기(GitHub에서 1회 내려받아 캐시)
        "--remote-components",
        "ejs:github",
        ...jsRuntimeArgs(),
        url,
      ],
      { maxBuffer: 1024 * 1024 * 20, timeout: 90_000 },
    );
    return JSON.parse(stdout) as YtDlpInfo;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new CaptionError(
        "yt-dlp-missing",
        "yt-dlp가 설치되어 있지 않습니다.",
      );
    }
    throw new CaptionError(
      "info-failed",
      "영상 정보를 가져오지 못했습니다. 링크를 확인해 주세요.",
    );
  }
}

/**
 * YouTube 링크의 영어 자막을 받아 문장 목록으로 돌려준다.
 * 영어 자막 트랙(업로드·자동)을 모두 받아 문장이 가장 많이 나오는 트랙을 쓴다.
 * 영어 자막이 아예 없으면 reason "no-captions"로 실패한다.
 */
export async function fetchEnglishSentences(url: string): Promise<{
  videoId: string;
  title: string;
  sentences: string[];
}> {
  const info = await fetchVideoInfo(url);

  const candidateUrls = englishJson3Urls(info);
  if (candidateUrls.length === 0) {
    throw new CaptionError("no-captions", "이 영상에는 영어 자막이 없습니다.");
  }

  let best: string[] = [];
  let anyFetched = false;
  for (const captionUrl of candidateUrls) {
    try {
      const sentences = await fetchCaptionSentences(captionUrl);
      anyFetched = true;
      if (sentences.length > best.length) best = sentences;
    } catch {
      // 이 트랙만 건너뛴다.
    }
  }

  if (!anyFetched) {
    throw new CaptionError("fetch-failed", "자막을 불러오지 못했습니다.");
  }
  if (best.length === 0) {
    throw new CaptionError("no-captions", "이 영상에는 영어 자막이 없습니다.");
  }

  return {
    videoId: info.id,
    title: info.title?.trim() || info.id,
    sentences: best,
  };
}
