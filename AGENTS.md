# AGENTS

현재 방향: AI_Civilization_3D_Direction.md
목표: 작은 실제 3D 세계. 인물/도시/날씨/전투 효과를 점으로 대체하지 않는다.
렌더러: Babylon.js. UI는 React. 기존 엔진/SQLite는 보존한다 (이 저장소에는 아직 없음).
순서: G0→G1→G2→G3 시각 검증, 이후 G4 실제 연결, G5 규칙 확장, G6 마무리.
이번 요청 범위와 STATUS.md를 우선 확인한다.
showcase/replay는 실제 세계·예산을 변경하지 않는다.
화면 프레임과 연출 콜백은 경제/피해/AI 호출을 실행하지 않는다.
소스·에셋 출처, 실행 결과, 실제 캡처, 미검증 항목을 기록한다.

구조 (설계문서 4.3의 client/src 대신 저장소 루트 src/ 사용):
- src/shared/render-contracts.ts — RenderBundle/VisualEvent 계약
- src/fixtures/showcase/ — 고정 seed fixture (마을·건물·주민·분대·자연물)
- src/world3d/{terrain,settlements,residents,presentation,effects,sources,assets,quality} — 책임별 모듈
- tests/unit (Vitest), tests/e2e (Playwright), scripts/ (Node 스크립트, Windows 호환)
