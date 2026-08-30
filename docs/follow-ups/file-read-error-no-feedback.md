# 파일 읽기가 실패하면 아무 안내 없이 조용히 끝난다

**Symptom**: `app/page.tsx:28`의 `await file.text()`가 실패하면 async 핸들러에서
unhandled rejection이 되고, 사용자에게 오류 안내문조차 뜨지 않는다.

**Observed evidence**: `code-review low` (이 세션). `handleFile`에 try/catch 없음.

**Suspected cause**: 파일이 선택 직후 사라지거나 권한 문제로 읽기가 실패하는 경우를
가정하지 않았다. 스펙 "범위 밖"의 오류 복구에 해당한다.

**What was tried**: 이번 범위에서는 건드리지 않았다.

**Proposed next step**: `file.text()`를 try/catch로 감싸고 실패 시 형식 오류와
같은 안내 영역에 읽기 실패 메시지를 표시한다.
