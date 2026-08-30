# jsdom 환경에서 Vitest 워커가 시작되지 않는다

**Symptom**: `bun run test`가 jsdom 환경 테스트 파일에서 워커를 띄우지 못하고
`TypeError: webidl.util.markAsUncloneable is not a function`으로 실패한다.

**Observed evidence**: 이 세션의 `bun run test` 실행. 스택은
`node_modules/undici/lib/web/cache/cachestorage.js:20` → `jsdom/lib/api.js:12`.
`node -e "console.log(typeof require('node:worker_threads').markAsUncloneable)"`가
`undefined`를 출력한다(Node v20.20.2).

**Suspected cause**: `jsdom@30`이 묶어 온 `undici@8.10.0`이
`worker_threads.markAsUncloneable`를 가드 없이 구조 분해한다. 이 Node 빌드에는
그 함수가 없어 `webidl.util.markAsUncloneable`가 `undefined`가 된다.

**What was tried**: 순수 테스트 두 개(`lib/two-column.test.ts`,
`lib/utils.test.ts`)에 `// @vitest-environment node` 도크블록을 달아 jsdom을
피했다. `vitest.polyfill.mjs`를 `poolOptions.forks.execArgv`의 `--import`로
넣어 보았으나 워커 시작 전에 오류가 나 효과가 없어 되돌렸다. 컴포넌트 렌더링
테스트는 지금 저장소에 없고, UI 동작은 Playwright(실제 Chromium)로 검증한다.

**Proposed next step**: Node를 `markAsUncloneable`가 있는 버전(v20.19+ 정식
릴리스 또는 v22 LTS)으로 올리거나, `jsdom`을 `undici@7`대를 쓰는 버전으로
내리거나, `happy-dom`으로 환경을 바꾼다. 셋 중 하나를 정해 컴포넌트 테스트를
다시 열 때 처리한다.
