# 인쇄본에 매 쪽 쪽번호가 없다

**Symptom**: 인쇄·PDF 저장 결과에 자동 쪽번호가 찍히지 않는다. 여러 쪽 문서에서 순서를 잃기 쉽다.

**Observed evidence**: shape-idea 세션에서 확인. CSS `@page` 마진 박스의 `counter(page)`는 Chrome·Firefox의 `window.print()` 경로에서 렌더링되지 않는다. `position: fixed` 요소는 매 쪽 반복되지만 쪽 번호 값을 계산하지는 못한다.

**Suspected cause**: 브라우저가 CSS 페이지 마진 박스와 페이지 기반 카운터를 구현하지 않는다. 별도 페이지네이션 엔진 없이는 어렵다.

**What was tried**: 이번 슬라이스에서는 쪽번호를 범위에서 제외했다. 제목·URL 머리말만 `position: fixed`로 매 쪽 반복한다. 사용자는 필요 시 인쇄 대화상자의 머리말·바닥글 옵션으로 대체하기로 했다.

**Proposed next step**: Paged.js 같은 페이지네이션 라이브러리를 붙여 인쇄 전용 렌더에서만 쪽번호와 머리말을 CSS 카운터로 넣는 방안을 평가한다. `docs/decisions/output-delivery.md`의 재검토 조건과 함께 본다.
