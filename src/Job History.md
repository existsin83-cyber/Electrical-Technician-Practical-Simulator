# Job History — 전기기능사 실기 시퀀스 제어 시뮬레이터

## 프로젝트 개요
Vite + React 19 + pdfjs-dist 기반. PDF 회로도(페이지7)를 캔버스에 렌더하고 SVG 오버레이로 전류 흐름/조작을 시각화.

핵심 파일
- `src/App.jsx` — 통합 상태 관리
- `src/components/PdfCanvas.jsx` — PDF 렌더 + SVG 오버레이
- `src/simulation/engine.js` — 시퀀스 시뮬레이션 엔진
- `src/simulation/tasks/task01.js` — 1번 과제 좌표·결선 데이터

좌표계: PDF 원본 포인트 841×595, 좌상단 원점.

---

## 완료한 작업

### 1. CLAUDE.md 생성
빌드 명령(`npm run dev/build/preview`), 아키텍처, 좌표계, 컴포넌트 타입/상태 규칙, 신규 과제 추가법 문서화.

### 2. 결함 B — 시뮬레이션 엔진 전면 재설계 (`engine.js`)
- 기존 결함: "X(릴레이) 꺼짐인데 MC1 켜짐" 모순.
- 원인: ① BFS가 코일을 도체처럼 통과 ② 접점이 직전 프레임 코일상태로 갱신돼 한 프레임 모순 ③ 코일→접점 매핑이 엔진/데이터 이중 소스.
- 재설계(v2 결정론적 고정점 모델):
  - 부하(coil/lamp/buzzer)를 **종단**으로 처리(BFS 비통과).
  - **단일 호출 내 고정점 수렴**으로 한 프레임 내부 일관성 확보(자기유지는 호출 간 래치 시드).
  - 코일→접점 의존성을 task 데이터의 `controls`/`gate`/`trigger`로 **단일 소스화**.
- `task01.js` 선언 필드 추가: EOCR(trigger:always), FR(alarm), FLS(auto+reach, controls FLS_A), X/T/MC1/MC2(controls), 접점 gate(T_A:tElapsed, FLS_A:water).
- 검증(Playwright headless): 수동 기동→EOCR·X·T·MC1·RL ON / 떼면 X 자기유지 / 자동+수위→X·MC1 일관 ON(모순 해소) / EOCR 트립→메인 차단+BUZZER. 빌드 통과.

### 3. 결함 A — 오버레이 정렬 (`PdfCanvas.jsx`)
- 박스 스케일 버그 수정: 패딩 없는 stage에 canvas/SVG를 동일 박스로 겹치고 `viewBox=원본포인트`+`width/height:100%`로 배율 무관 정렬, DPR 반영.
- 추가 원인 발견: `task01.js` 좌표가 실제 도면과 무관한 임의값이었음(페이지7 회로는 **비트맵**이라 자동 추출 불가).

### 4. task01.js 좌표 재실측
- 페이지7 렌더 비트맵을 numpy 투영분석/원검출로 측정.
- 앵커: 상단버스 y=140, 하단 L2버스 y=394, 가로레벨 y≈238/297.
- 부하 원 x중심: EOCR284 FR324 YL362 BZ402 FLS470 X519 T557 MC1 636 MC2 674 RL714 GL752 (원 정중앙 정렬 확인).
- 접점(SS/PB0/PB1/FLS_A/X_A1/X_A2/MC1_A/MC2_A) 그리드 실측 재배치. 시뮬레이션 위상(from/to)은 유지, 좌표·배선만 교체.
- 대조 이미지: `Image/overlay_on_clean2.png`, `Image/final_app_running.png`.

### 남은 이슈(데이터)
- `T_POWER` 결선: 실제론 PB1에만 연결돼 자기유지 경로 없음 → 버튼 떼면 T 소자. 실제 단선도 대조 보정 필요.
- 일부 접점 ±10~40pt 잔차. 좌측 주회로(M1/M2/TB) 좌표 미작성(제어 시뮬과 무관).
- 앱 캔버스에서 PDF가 다소 흐리게 렌더되는 표시 이슈.

---

## 향후 계획 (전문): 인앱 회로 편집기

### 목적
비트맵 도면은 자동 좌표추출이 불가하고 AI 눈대중은 잔차가 남는다. **사용자가 도면 위에서 직접 드래그로 릴레이·버튼·접점·전선 경로를 배치**하고 `task01.js`에 바로 저장하는 편집 모드를 추가한다. 1번 정렬을 손으로 정확히 맞추고 2~18번 과제도 같은 도구로 작성.

확정 범위: **부품/전선점 이동 + 전선 꺾임점 추가·삭제**, 저장은 **Vite 개발서버 엔드포인트로 task01.js 자동 기록**.

### 재사용 자산
- 좌표 변환: `PdfCanvas.jsx` 클릭 핸들러(clientX/Y→PDF 포인트) → `clientToPoint(e)` 헬퍼로 추출, 클릭·드래그 공용.
- 오버레이 정렬 구조(viewBox+preserveAspectRatio) 그대로 → 드래그 좌표=저장 좌표 1:1.
- 렌더 루프(wires.map/components.map) 확장. 부품 전체 필드는 App task 객체에 보존.

### 구현
1. **`vite.config.js` 저장 엔드포인트**: dev 미들웨어 `POST /__save-task` → body의 task(meta+components+wires)를 `src/simulation/tasks/task01.js`로 재생성 기록. 출력 `export const task01 = ${JSON.stringify(task,null,2)};`(좌표 정수). dev 전용, 빌드 영향 없음.
2. **`PdfCanvas.jsx` 편집 렌더+드래그**: props(editMode/selected/onSelect/onMoveComponent/onMoveWirePoint/onInsertWirePoint/onDeleteWirePoint/showGrid/snap). `clientToPoint` 스냅(정수/격자). drag ref(kind:comp|point). 편집 모드 시 SVG pointerEvents:auto, 배경 rect로 mousemove/up 추적. 모든 부품을 드래그 핸들(원+id)로 렌더. 전선 클릭→선택, point 사각핸들 드래그, 세그먼트 더블클릭=점추가, 우클릭/Delete=점삭제. showGrid 격자+커서 좌표. 비편집 동작 회귀 없음.
3. **`App.jsx` 편집 상태/저장**: editMode, editTask(깊은복사), selected, snap(기본1pt/옵션5pt), showGrid, saveStatus. 오버레이/시뮬은 editMode?editTask:currentTask. 핸들러 moveComponent/moveWirePoint/insertWirePoint/deleteWirePoint(불변 업데이트). 저장=POST /__save-task→성공시 currentTask 반영+표시.
4. **`src/components/EditorToolbar.jsx`(신규)**: 편집 토글, 스냅/격자, 선택 정보(id·좌표), 점 추가/삭제 안내, 저장 버튼, 커서 좌표.

### 상호작용(사용자)
- 편집 ON → 모든 부품 드래그 핸들 → 심볼 위로 이동.
- 전선 클릭 → 꺾임점 핸들 드래그. 세그먼트 더블클릭=점 추가, 점 우클릭/Delete=점 삭제.
- 저장 → task01.js 즉시 기록(새로고침해도 유지).

### 검증
- `npm run dev` → 편집 진입, X 핸들을 X원 위로 드래그 → 좌표 갱신. 전선 점 이동/추가/삭제. 저장 → task01.js 디스크 변경(diff) 확인, 새로고침 반영. 편집 OFF에서 기존 시뮬(수동/자동/트립) 회귀 없음. `npm run build` 통과.
