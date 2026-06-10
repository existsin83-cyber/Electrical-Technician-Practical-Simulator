// 전기기능사 실기 1번 과제 (시퀀스 회로도) 좌표 및 노드 데이터 매핑
// PDF 7페이지 (841 x 595 가로형 A4 포인트 좌표계, 좌상단 원점)
//
// 좌표는 페이지7 비트맵을 투영분석/원검출로 실측한 값:
//   상단 제어버스 y=140, 하단 공통(L2) 버스 y=394, 가로 연결레벨 y≈238/297
//   부하 원(코일/램프/부저) 중심 y=378, 각 부하 x중심:
//   EOCR284 FR324 YL362 BZ402 FLS470 X519 T557 MC1 636 MC2 674 RL714 GL752

export const task01 = {
  taskNumber: 1,
  pdfPage: 7, // 시퀀스 회로도 페이지
  pdfPageLayout: 6, // 제어판 배치도 페이지
  pdfPagePiping: 5, // 배관 배치도 페이지

  // 회로도상의 컴포넌트(접점, 스위치, 코일) 정의
  components: [
    // 1. 주전원 및 차단기류 (좌측 주회로)
    { id: "MCCB", name: "배선용차단기", type: "mccb", x: 75, y: 180, state: "CLOSED" },
    { id: "FUSE_L1", name: "퓨즈 (L1)", type: "fuse", x: 195, y: 205, state: "CLOSED" },
    { id: "FUSE_L2", name: "퓨즈 (L2)", type: "fuse", x: 195, y: 260, state: "CLOSED" },

    // 2. EOCR (과전류계전기)
    { id: "EOCR_POWER", name: "EOCR 전원", type: "coil", trigger: "always", x: 284, y: 378, state: "DEENERGIZED" },
    { id: "EOCR_B", name: "EOCR B접점", type: "contact_b", x: 305, y: 140, state: "CLOSED" },
    { id: "EOCR_A", name: "EOCR A접점", type: "contact_a", x: 255, y: 250, state: "OPEN" },

    // 3. FR (플리커 릴레이)
    { id: "FR_POWER", name: "FR 전원", type: "coil", trigger: "alarm", x: 324, y: 378, state: "DEENERGIZED" },
    { id: "FR_B", name: "FR B접점", type: "contact_b", x: 362, y: 335, state: "CLOSED" },
    { id: "FR_A", name: "FR A접점", type: "contact_a", x: 402, y: 335, state: "OPEN" },
    { id: "YL", name: "노란색 램프 (YL)", type: "lamp", x: 362, y: 378, color: "#eab308", state: "OFF" },
    { id: "BZ", name: "부저 (BZ)", type: "buzzer", x: 402, y: 378, state: "OFF" },

    // 4. FLS (플로트레스 스위치)
    { id: "FLS_POWER", name: "FLS 전원", type: "coil", trigger: "auto+reach", controls: ["FLS_A"], x: 470, y: 378, state: "DEENERGIZED" },
    { id: "FLS_A", name: "FLS A접점", type: "contact_a", gate: "water", x: 520, y: 268, state: "OPEN" },
    { id: "FLS_E1", name: "수위 센서 E1-E3 (TB4)", type: "sensor", x: 500, y: 420, state: "OPEN" },

    // 5. SS (셀렉터 스위치) 및 조작 스위치
    { id: "SS", name: "셀렉터 스위치", type: "selector", x: 557, y: 165, mode: "M" }, // M: 수동, A: 자동
    { id: "PB0", name: "푸시버튼 0 (적색 B접점)", type: "btn_b", x: 557, y: 210, state: "CLOSED" },
    { id: "PB1", name: "푸시버튼 1 (녹색 A접점)", type: "btn_a", x: 557, y: 268, state: "OPEN" },

    // 6. X (보조 릴레이)
    { id: "X_POWER", name: "릴레이 X 전원", type: "coil", controls: ["X_A1", "X_A2"], x: 519, y: 378, state: "DEENERGIZED" },
    { id: "X_A1", name: "X A접점 (자기유지)", type: "contact_a", x: 520, y: 238, state: "OPEN" },
    { id: "X_A2", name: "X A접점 (MC1 구동)", type: "contact_a", x: 636, y: 170, state: "OPEN" },

    // 7. T (타이머)
    { id: "T_POWER", name: "타이머 T 전원", type: "coil", controls: ["T_A"], x: 557, y: 378, state: "DEENERGIZED" },
    { id: "T_A", name: "T 한시 A접점 (MC2 구동)", type: "contact_a", gate: "tElapsed", x: 674, y: 335, state: "OPEN" },

    // 8. MC1 & MC2 (전자접촉기) 및 출력 램프
    { id: "MC1_POWER", name: "전자접촉기 MC1 전원", type: "coil", controls: ["MC1_A"], x: 636, y: 378, state: "DEENERGIZED" },
    { id: "MC2_POWER", name: "전자접촉기 MC2 전원", type: "coil", controls: ["MC2_A"], x: 674, y: 378, state: "DEENERGIZED" },
    { id: "MC1_A", name: "MC1 A접점 (RL 구동)", type: "contact_a", x: 714, y: 170, state: "OPEN" },
    { id: "MC2_A", name: "MC2 A접점 (GL 구동)", type: "contact_a", x: 752, y: 170, state: "OPEN" },
    { id: "RL", name: "적색 램프 (RL)", type: "lamp", x: 714, y: 378, color: "#ef4444", state: "OFF" },
    { id: "GL", name: "녹색 램프 (GL)", type: "lamp", x: 752, y: 378, color: "#22c55e", state: "OFF" }
  ],

  // 전류가 흐를 전선 경로 및 포인트 (실측 그리드 기반). from/to 논리 위상은 유지.
  wires: [
    // L1 인입 → 상단 제어버스(y=140)
    { id: "W_L1_1", from: "FUSE_L1", to: "EOCR_B", points: [[195, 205], [195, 140], [305, 140]] },
    { id: "W_L1_2", from: "EOCR_B", to: "SS", points: [[305, 140], [557, 140], [557, 165]] },

    // EOCR A접점 경보 분기 → FR
    { id: "W_EOCR_A", from: "EOCR_B", to: "EOCR_A", points: [[255, 140], [255, 250]] },
    { id: "W_ALARM_1", from: "EOCR_A", to: "FR_POWER", points: [[255, 250], [255, 297], [324, 297], [324, 378]] },
    { id: "W_ALARM_2", from: "FR_POWER", to: "FR_B", points: [[324, 297], [362, 297], [362, 335]] },
    { id: "W_ALARM_3", from: "FR_POWER", to: "FR_A", points: [[324, 297], [402, 297], [402, 335]] },
    { id: "W_YL", from: "FR_B", to: "YL", points: [[362, 335], [362, 378]] },
    { id: "W_BZ", from: "FR_A", to: "BZ", points: [[402, 335], [402, 378]] },

    // SS 수동(M) → PB0
    { id: "W_SS_M", from: "SS", to: "PB0", points: [[557, 165], [557, 210]] },

    // PB0 → PB1 및 자기유지 X_A1 병렬부 (분기점 y=238)
    { id: "W_PB0_PB1", from: "PB0", to: "PB1", points: [[557, 210], [557, 238], [557, 268]] },
    { id: "W_PB1_PARALLEL", from: "PB0", to: "X_A1", points: [[557, 238], [520, 238]] },

    // PB1 / X_A1 → X 코일 및 T 코일 구동선 (y=297 합류 → X/T 코일)
    { id: "W_PB1_JOIN", from: "PB1", to: "X_POWER", points: [[557, 268], [557, 297], [519, 297], [519, 378]] },
    { id: "W_XA1_JOIN", from: "X_A1", to: "X_POWER", points: [[520, 238], [520, 268], [519, 297], [519, 378]] },
    { id: "W_T_COIL", from: "PB1", to: "T_POWER", points: [[557, 268], [557, 378]] },

    // SS 자동(A, x=520 분선) → FLS 구동
    { id: "W_SS_A", from: "SS", to: "FLS_POWER", points: [[557, 165], [557, 150], [470, 150], [470, 378]] },
    { id: "W_FLS_A_IN", from: "SS", to: "FLS_A", points: [[520, 150], [520, 268]] },
    { id: "W_FLS_A_OUT", from: "FLS_A", to: "X_POWER", points: [[520, 268], [520, 297], [519, 378]] },

    // 릴레이 X 접점에 의한 MC1 제어 (상단버스 → X_A2 → MC1)
    { id: "W_MC1_CTRL_1", from: "EOCR_B", to: "X_A2", points: [[557, 140], [636, 140], [636, 170]] },
    { id: "W_MC1_CTRL_2", from: "X_A2", to: "MC1_POWER", points: [[636, 170], [636, 378]] },

    // 타이머 T 한시접점에 의한 MC2 제어
    { id: "W_MC2_CTRL_1", from: "PB0", to: "T_A", points: [[557, 297], [674, 297], [674, 335]] },
    { id: "W_MC2_CTRL_2", from: "T_A", to: "MC2_POWER", points: [[674, 335], [674, 378]] },

    // MC1 접점 → RL
    { id: "W_RL_CTRL_1", from: "EOCR_B", to: "MC1_A", points: [[636, 140], [714, 140], [714, 170]] },
    { id: "W_RL_CTRL_2", from: "MC1_A", to: "RL", points: [[714, 170], [714, 378]] },

    // MC2 접점 → GL
    { id: "W_GL_CTRL_1", from: "EOCR_B", to: "MC2_A", points: [[714, 140], [752, 140], [752, 170]] },
    { id: "W_GL_CTRL_2", from: "MC2_A", to: "GL", points: [[752, 170], [752, 378]] },

    // 공통 리턴 라인 (하부 L2 버스 y=394 - 모든 코일/램프/부저를 묶음)
    { id: "W_L2_COMMON", from: "FUSE_L2", to: "ALL_RETURN", points: [[195, 260], [195, 394], [752, 394]] }
  ]
};
