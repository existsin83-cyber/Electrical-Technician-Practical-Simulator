// 전기기능사 시퀀스 시뮬레이션 코어 엔진 (v2 - 결정론적 고정점 모델)
//
// 설계 원칙:
//  1. 부하(코일/램프/부저)는 "종단(terminal)"이다. BFS는 부하를 통과해 전파하지 않는다.
//     (이전 모델은 코일을 도체처럼 통과시켜 엉뚱한 코일이 여자되는 결함이 있었다.)
//  2. 한 번의 simulateCircuit 호출 안에서 코일↔접점을 고정점까지 수렴시켜
//     "표시되는 한 프레임"이 항상 내부적으로 일관되게 한다.
//     (이전 모델은 접점이 직전 프레임의 코일 상태로 갱신되어 'X는 꺼졌는데 MC1은 켜짐' 같은
//      한 프레임짜리 모순을 노출했다.)
//  3. 코일→접점 의존성은 엔진에 하드코딩하지 않고 task 데이터의 `controls`/`gate`/`trigger`
//     필드로 선언한다(단일 소스). 과제가 1~18번으로 늘어도 엔진 수정이 필요 없다.
//
//  자기유지(self-holding)는 물리적 래치이므로 호출 간 기억이 필요하다.
//  prevActiveCoils 로 직전 프레임의 여자 코일 집합을 받아 고정점의 시드로 사용한다.

const LOAD_TYPES = new Set(['coil', 'lamp', 'buzzer']);

export function simulateCircuit(originalComponents, wires, inputs, timerStates, flickerState, prevActiveCoils = new Set()) {
  const comps = originalComponents.map(c => ({ ...c }));
  const compMap = new Map(comps.map(c => [c.id, c]));

  // 1. 외부 입력으로 결정되는 1차 스위치/접점 상태 적용
  const ss = compMap.get('SS');
  if (ss) ss.mode = inputs.ssMode;

  const pb0 = compMap.get('PB0');
  if (pb0) pb0.state = inputs.pb0Pressed ? 'OPEN' : 'CLOSED'; // 적색 B접점

  const pb1 = compMap.get('PB1');
  if (pb1) pb1.state = inputs.pb1Pressed ? 'CLOSED' : 'OPEN'; // 녹색 A접점

  const flsE1 = compMap.get('FLS_E1');
  if (flsE1) flsE1.state = inputs.flsWaterDetected ? 'CLOSED' : 'OPEN';

  const eocrB = compMap.get('EOCR_B');
  if (eocrB) eocrB.state = inputs.eocrTest ? 'OPEN' : 'CLOSED';
  const eocrA = compMap.get('EOCR_A');
  if (eocrA) eocrA.state = inputs.eocrTest ? 'CLOSED' : 'OPEN';

  // 코일의 여자 상태로부터 그 코일이 제어하는 접점 상태를 데이터 기반으로 갱신
  const applyContacts = (energized) => {
    comps.forEach(coil => {
      if (coil.type !== 'coil' || !coil.controls) return;
      const on = energized.has(coil.id);
      coil.controls.forEach(cid => {
        const ct = compMap.get(cid);
        if (!ct) return;
        let closed = on;
        if (ct.gate === 'tElapsed') closed = on && !!timerStates.tElapsed;
        if (ct.gate === 'water') closed = on && !!inputs.flsWaterDetected;
        // b접점은 코일 여자 시 열림(반전)
        if (ct.type === 'contact_b') closed = !closed;
        ct.state = closed ? 'CLOSED' : 'OPEN';
      });
    });
  };

  // FUSE_L1(=L1 활선)에서 닫힌 접점만 통과하며 도달 가능한 노드 집합 계산.
  // 부하(코일/램프/부저)는 도달은 시키되 그 너머로는 전파하지 않는다(종단).
  const computeReached = () => {
    const reached = new Set(['FUSE_L1']);
    const queue = ['FUSE_L1'];
    while (queue.length > 0) {
      const curr = queue.shift();
      wires.forEach(w => {
        if (w.id === 'W_L2_COMMON') return; // L2 공통 리턴선은 전위 탐색에서 제외
        let target = null;
        if (w.from === curr) target = w.to;
        else if (w.to === curr) target = w.from;
        if (!target || reached.has(target)) return;

        // 셀렉터 스위치 모드 분기: 선택되지 않은 가지는 차단
        if (curr === 'SS') {
          const mode = compMap.get('SS').mode;
          if (mode === 'M' && w.id === 'W_SS_A') return;
          if (mode === 'A' && w.id === 'W_SS_M') return;
        }

        const node = compMap.get(target);
        if (node) {
          // 접점/스위치/센서는 닫혀 있어야 통과 가능
          if (node.type.startsWith('contact_') || node.type.startsWith('btn_') || node.type === 'sensor') {
            if (node.state !== 'CLOSED') return;
          }
          reached.add(target);
          // 부하는 종단: 도달만 표시하고 큐에 넣지 않음
          if (!LOAD_TYPES.has(node.type)) queue.push(target);
          return;
        }
        // 데이터에 없는 단순 분기 노드(접합점)는 통과
        reached.add(target);
        queue.push(target);
      });
    }
    return reached;
  };

  // 도달 집합으로부터 여자 코일 집합 계산. 코일별 `trigger`로 동작 조건을 선언.
  //  - 'always'       : 항상 여자 (예: EOCR 전원)
  //  - 'alarm'        : EOCR 트립 시 여자 (예: FR 플리커 릴레이)
  //  - 'auto+reach'   : 자동 모드 AND L1 도달 (예: FLS 전원)
  //  - 'reach'(기본)  : L1 도달 시 여자
  const computeEnergized = (reached) => {
    const next = new Set();
    comps.forEach(c => {
      if (c.type !== 'coil') return;
      const trigger = c.trigger || 'reach';
      let on = false;
      if (trigger === 'always') on = true;
      else if (trigger === 'alarm') on = !!inputs.eocrTest;
      else if (trigger === 'auto+reach') on = inputs.ssMode === 'A' && reached.has(c.id);
      else on = reached.has(c.id);
      if (on) next.add(c.id);
    });
    return next;
  };

  // 2. 고정점 반복: 직전 래치 상태를 시드로 코일/접점이 더 변하지 않을 때까지 수렴
  let energized = new Set(prevActiveCoils);
  const maxIterations = 12;
  for (let i = 0; i < maxIterations; i++) {
    applyContacts(energized);
    const reached = computeReached();
    const next = computeEnergized(reached);
    if (setEquals(next, energized)) break;
    energized = next;
  }
  applyContacts(energized); // 최종 프레임의 접점을 코일 상태와 일관되게 확정

  // 코일 컴포넌트의 표시 상태 확정
  comps.forEach(c => {
    if (c.type === 'coil') c.state = energized.has(c.id) ? 'ENERGIZED' : 'DEENERGIZED';
  });

  // 3. 출력 장치(램프/부저) 상태 확정
  const isOn = (id) => energized.has(id);
  comps.forEach(c => {
    if (c.id === 'RL') c.state = isOn('MC1_POWER') ? 'ON' : 'OFF';
    if (c.id === 'GL') c.state = isOn('MC2_POWER') ? 'ON' : 'OFF';
    if (c.id === 'YL') c.state = (isOn('FR_POWER') && !flickerState) ? 'ON' : 'OFF';
    if (c.id === 'BZ') c.state = (isOn('FR_POWER') && flickerState) ? 'ON' : 'OFF';
  });

  // 4. 통전 전선 하이라이트 수집 (시각화)
  const activeWires = new Set();
  const returnActiveWires = new Set();
  const eocrTripped = !!inputs.eocrTest;

  const anyLoadActive = comps.some(c =>
    (c.type === 'coil' && c.state === 'ENERGIZED') ||
    (c.type === 'lamp' && c.state === 'ON') ||
    (c.type === 'buzzer' && c.state === 'ON'));
  if (anyLoadActive) returnActiveWires.add('W_L2_COMMON');

  activeWires.add('W_L1_1'); // L1 인입 상시
  if (compMap.get('EOCR_B').state === 'CLOSED') activeWires.add('W_L1_2');

  if (eocrTripped) {
    activeWires.add('W_EOCR_A');
    activeWires.add('W_ALARM_1');
    if (!flickerState) { activeWires.add('W_ALARM_2'); activeWires.add('W_YL'); }
    if (flickerState) { activeWires.add('W_ALARM_3'); activeWires.add('W_BZ'); }
  }

  if (!eocrTripped && ss.mode === 'M') {
    activeWires.add('W_SS_M');
    if (compMap.get('PB0').state === 'CLOSED') {
      if (inputs.pb1Pressed) {
        activeWires.add('W_PB0_PB1');
        activeWires.add('W_PB1_JOIN');
        activeWires.add('W_T_COIL');
      }
      if (compMap.get('X_A1').state === 'CLOSED') {
        activeWires.add('W_PB1_PARALLEL');
        activeWires.add('W_XA1_JOIN');
        activeWires.add('W_T_COIL');
      }
    }
  } else if (!eocrTripped && ss.mode === 'A') {
    activeWires.add('W_SS_A');
    activeWires.add('W_FLS_A_IN');
    if (compMap.get('FLS_A').state === 'CLOSED') {
      activeWires.add('W_FLS_A_OUT');
      activeWires.add('W_T_COIL');
    }
  }

  if (!eocrTripped && compMap.get('X_A2').state === 'CLOSED') {
    activeWires.add('W_MC1_CTRL_1');
    activeWires.add('W_MC1_CTRL_2');
  }
  if (!eocrTripped && isOn('T_POWER')) {
    activeWires.add('W_MC2_CTRL_1');
    if (compMap.get('T_A').state === 'CLOSED') activeWires.add('W_MC2_CTRL_2');
  }
  if (!eocrTripped && compMap.get('MC1_A').state === 'CLOSED') {
    activeWires.add('W_RL_CTRL_1');
    activeWires.add('W_RL_CTRL_2');
  }
  if (!eocrTripped && compMap.get('MC2_A').state === 'CLOSED') {
    activeWires.add('W_GL_CTRL_1');
    activeWires.add('W_GL_CTRL_2');
  }

  return {
    components: comps,
    activeWires: Array.from(activeWires),
    returnActiveWires: Array.from(returnActiveWires),
    activeCoils: energized
  };
}

function setEquals(a, b) {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}
