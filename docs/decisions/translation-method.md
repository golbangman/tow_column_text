# 번역 수행 방식

## Decisions

- 영어를 한국어로 옮길 때 서버에서 headless 브라우저로 `translate.google.com` 웹 UI를
  조작해 번역한다. `youtube_caption`의 `lib/browser-translate.ts`가 참조 구현이다.
- 문장 단위로 하나씩 번역한다. 좌측 영어 문장 i가 우측 번역 i와 짝이 된다.
- 한 문장 번역이 실패하면 그 문장은 영어만 남기고 넘어간다. 나중에 "이어서 번역"으로
  빈 칸만 다시 시도한다.

## Boundaries

- 여러 문장을 구분자로 묶어 한 번에 번역하지 않는다. 좌우 1:1 정렬이 깨질 수 있다.
- 번역 실행은 열린 페이지에 묶인다. 서버 백그라운드 작업 큐를 두지 않는다.

## Why

무료 번역 API(`translate.googleapis.com/translate_a/single`, MyMemory)는 이 환경의
발신 IP에서 429(자동화 차단·일일 한도)에 걸린다. 구글 공식 "Website Translator"
위젯은 2019년 이후 개인·상업 사이트에서 번역 백엔드가 동작하지 않는다. 두 사실 모두
`youtube_caption/docs/follow-ups/`에 실증돼 있다. 남은 실용적 경로가 브라우저로
번역 웹 UI를 직접 조작하는 것이다. 문장 단위 1:1은 "어긋난 짝을 보이지 않는다"는
제품 원칙을 지키는 유일한 방법이다.

## Reconsider when

- API 키 기반 번역 서비스(Google Cloud Translation 등)를 쓸 수 있게 되어 차단
  걱정 없이 호출할 수 있을 때. 그때는 문장 배열을 배치로 보내되 응답이 1:1로
  돌아오는지 검증한다.
- `translate.google.com`의 구조나 정책이 바뀌어 브라우저 조작으로도 번역이 막힐 때.

## Still-rejected alternatives

- 무료 번역 API 직접 호출 — 429로 막힘(`youtube_caption` follow-up); API 키 기반
  서비스로 바꾸면 재검토.
- 구글 공식 번역 위젯 embed — 구글 정책상 번역 백엔드가 개인 사이트에서 동작 안 함
  (`youtube_caption` follow-up); 코드로 우회 불가.
- 구분자로 여러 문장 묶어 번역 — 구글이 구분자·문장 경계를 보존한다는 보장이 없어
  1:1 정렬이 깨질 위험; API 키 기반 배치 번역이 가능해지면 재검토.

## Evidence worth preserving

- `youtube_caption/docs/follow-ups/translate-provider-rate-limit.md`,
  `youtube_caption/docs/follow-ups/google-translate-widget-embed-failed.md`.
- `youtube_caption/lib/browser-translate.ts` (참조 구현).
