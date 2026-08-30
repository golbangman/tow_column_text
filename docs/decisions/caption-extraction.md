# 영어 자막 추출

## Decisions

- 영상의 영어 자막은 `yt-dlp --skip-download --dump-json`으로 영상 정보를 받은 뒤,
  `subtitles`와 `automatic_captions`의 영어 트랙(`en`·`en-*`)을 모두 받아 각각
  문장으로 쪼갠 뒤 문장이 가장 많이 나오는 트랙을 쓴다. 업로드 자막이 구두점 없는
  원시 전사본이라 자동 자막보다 나쁜 영상이 있어서다.
- `json3` 형식 자막을 받아 세그먼트(`events[].segs[].utf8`)를 순서대로 이어붙이고,
  줄바꿈·연속 공백을 정리하고 HTML 엔티티를 복원해 하나의 영어 텍스트로 만든다.
- 세그먼트별 타임스탬프는 보관하지 않는다.
- 참조 구현은 `youtube_caption/lib/youtube.ts`다.

## Boundaries

- 자막 fetch는 서버 `fetch`로 한다. 번역과 달리 헤드리스 브라우저를 쓰지 않는다.
- 영어 자막이 없는 영상은 처리하지 않고 안내한다.

## Why

`youtube_caption`이 같은 목적으로 이미 검증한 방식이다. 사용자가 재생 위치를 스스로
스크롤해 따라가므로 문장별 시간 정보가 필요 없고, 타임스탬프를 버리면 기존 문장
분리·번역 파이프라인을 그대로 쓸 수 있다.

## Reconsider when

- 재생 위치에 맞춘 자막 자동 스크롤을 넣을 때. 그때는 세그먼트 경계와 시작 시각을
  보관하고, 문장마다 시작 세그먼트의 시각을 근사로 붙여야 한다.
  (`docs/follow-ups/playback-synced-auto-scroll.md`)
- `yt-dlp`의 JSON 구조나 `json3` 자막 형식이 바뀔 때.

## Still-rejected alternatives

- YouTube 페이지에서 직접 자막을 긁기 — `yt-dlp`가 형식 변화와 서명된 URL을
  대신 처리해 준다; `yt-dlp` 자체가 막히면 재검토.
- 자막 세그먼트를 번역·표시 단위로 쓰기 — 세그먼트는 시간으로 잘려 문장 경계와
  맞지 않는다; 자동 스크롤을 넣을 때 세그먼트 시각만 별도로 보관하는 편이 낫다.

## Evidence worth preserving

- `youtube_caption/lib/youtube.ts` (`fetchEnglishTranscript`, `pickJson3Url`,
  `findEnglishFormats`).
