// @vitest-environment node
// 순수 함수 테스트라 DOM이 필요 없다. 이 Node 빌드에서 jsdom 환경이
// 시작되지 않는 문제(docs/follow-ups/vitest-jsdom-undici-node.md)도 피한다.
import { describe, expect, it } from "vitest";

import { cn } from "@/lib/utils";

describe("cn", () => {
  it("조건부 클래스 중 참인 값만 남긴다", () => {
    expect(cn("px-2", false && "hidden", "text-sm")).toBe("px-2 text-sm");
  });

  it("충돌하는 Tailwind 유틸리티는 뒤에 온 값으로 병합한다", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });
});
