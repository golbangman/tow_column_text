# 번역 오류가 사용자의 "정지"와 구분되지 않는다

**Symptom**: `app/page.tsx`의 `start()`에서 서버 5xx·빈 본문 응답, 스트림 오류,
깨진 NDJSON 줄(`JSON.parse` 실패), 네트워크 오류가 모두 `phase="stopped"`로
삼켜진다. 사용자는 번역이 실패한 것인지 자기가 멈춘 것인지 알 수 없고, 원인 표시도
없다.

**Observed evidence**: `code-review low` (sentence-by-sentence-translation 01
세션). `app/page.tsx`의 `if (!res.ok || !res.body) { setPhase("stopped") }`와
넓은 `catch { setPhase("stopped") }`.

**Suspected cause**: 01 태스크는 "정지" 동작만 요구하고 오류 피드백은 스펙 범위 밖.
대량 실패 시 안내·재시도 상세는 `PRODUCT.md`의 미결 항목이다.

**What was tried**: 이번 태스크에서는 건드리지 않았다. AbortError는 정상 정지로
두고 나머지는 최선 노력으로 "stopped" 처리.

**Proposed next step**: `phase`에 `"error"`를 추가해 AbortError만 "stopped",
그 외(응답 실패, 스트림 오류, 파싱 실패)는 "error"로 구분하고 안내 문구를 띄운다.
`PRODUCT.md`의 "대량 실패 시 알림·재시도" 미결과 함께 설계한다.
