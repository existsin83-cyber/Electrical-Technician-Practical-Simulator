import React, { useState, useEffect, useRef } from 'react';
import PdfCanvas from './components/PdfCanvas';
import { simulateCircuit } from './simulation/engine';
import { task01 } from './simulation/tasks/task01';

export default function App() {
  // 과제 데이터 (현재는 1번만 포함, 18번까지 확장 가능)
  const [currentTask, setCurrentTask] = useState(task01);
  const [taskNumber, setTaskNumber] = useState(1);
  
  // 시뮬레이터 입력 제어 상태
  const [inputs, setInputs] = useState({
    pb0Pressed: false,     // PB0 (적색 B접점) 누름 상태
    pb1Pressed: false,     // PB1 (녹색 A접점) 누름 상태
    ssMode: 'M',           // 셀렉터 스위치 모드 ('M': 수동, 'A': 자동)
    flsWaterDetected: false, // FLS 수위 감지 (E1-E3 쇼트)
    eocrTest: false        // EOCR 테스트 상태 (과전류 트립)
  });

  // 타이머 세팅 및 타이머 한시 경과 상태
  const [timerSetting, setTimerSetting] = useState(3); // 기본 3초 세팅
  const [timerStates, setTimerStates] = useState({
    tElapsed: false
  });
  const timerRef = useRef(null);

  // 플리커 (FR) 깜빡임 토글 상태 (1초 주기)
  const [flickerState, setFlickerState] = useState(false);
  const flickerIntervalRef = useRef(null);

  // 현재 시뮬레이션된 결과 부품 상태 및 전선 상태
  // 클릭된 좌표 기록용 state (디버깅용)
  const [clickedCoords, setClickedCoords] = useState([]);

  // 활성화된 코일 목록 피드백 유지 (자기유지용)
  const [activeCoils, setActiveCoils] = useState(new Set());

  const [simResult, setSimResult] = useState({
    components: currentTask.components,
    activeWires: [],
    returnActiveWires: []
  });

  // 1. 상태 머신 연동 시뮬레이션 트리거
  useEffect(() => {
    const result = simulateCircuit(
      currentTask.components,
      currentTask.wires,
      inputs,
      timerStates,
      flickerState,
      activeCoils
    );
    setSimResult(result);
    
    // 이전 활성 코일 목록과 다르면 상태 업데이트 (자기유지 피드백)
    const prevCoilsStr = Array.from(activeCoils).sort().join(',');
    const nextCoilsStr = Array.from(result.activeCoils).sort().join(',');
    if (prevCoilsStr !== nextCoilsStr) {
      setActiveCoils(result.activeCoils);
    }
  }, [inputs, timerStates, flickerState, currentTask, activeCoils]);

  // 2. 타이머 (T_POWER) 구동 및 경과 로직
  const tPowerState = simResult.components.find(c => c.id === 'T_POWER')?.state;
  useEffect(() => {
    if (tPowerState === 'ENERGIZED') {
      // 타이머가 가동되면 세팅 시간 후 접점 닫힘
      if (!timerRef.current) {
        timerRef.current = setTimeout(() => {
          setTimerStates({ tElapsed: true });
        }, timerSetting * 1000);
      }
    } else {
      // 타이머 전원 차단 시 즉시 리셋
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setTimerStates({ tElapsed: false });
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [tPowerState, timerSetting]);

  // 3. 플리커 릴레이 (FR_POWER) 점멸 교대 동작 로직
  const frPowerState = simResult.components.find(c => c.id === 'FR_POWER')?.state;
  useEffect(() => {
    if (frPowerState === 'ENERGIZED') {
      if (!flickerIntervalRef.current) {
        flickerIntervalRef.current = setInterval(() => {
          setFlickerState(prev => !prev);
        }, 1000);
      }
    } else {
      if (flickerIntervalRef.current) {
        clearInterval(flickerIntervalRef.current);
        flickerIntervalRef.current = null;
      }
      setFlickerState(false);
    }

    return () => {
      if (flickerIntervalRef.current) clearInterval(flickerIntervalRef.current);
    };
  }, [frPowerState]);

  // 4. 셀렉터 스위치 토글
  const toggleSSMode = () => {
    setInputs(prev => ({
      ...prev,
      ssMode: prev.ssMode === 'M' ? 'A' : 'M'
    }));
  };

  // 5. 스위치 마우스 조작 핸들러
  const handlePb0Down = () => setInputs(prev => ({ ...prev, pb0Pressed: true }));
  const handlePb0Up = () => setInputs(prev => ({ ...prev, pb0Pressed: false }));
  
  const handlePb1Down = () => setInputs(prev => ({ ...prev, pb1Pressed: true }));
  const handlePb1Up = () => setInputs(prev => ({ ...prev, pb1Pressed: false }));

  const toggleFlsWater = () => {
    setInputs(prev => ({ ...prev, flsWaterDetected: !prev.flsWaterDetected }));
  };

  const toggleEocrTest = () => {
    setInputs(prev => ({ ...prev, eocrTest: !prev.eocrTest }));
  };

  // 노드(SVG 핫스팟) 클릭/Down/Up 바인딩
  const handleComponentClick = (comp) => {
    if (comp.id === 'SS') toggleSSMode();
  };

  const handleComponentMouseDown = (comp) => {
    if (comp.id === 'PB0') handlePb0Down();
    if (comp.id === 'PB1') handlePb1Down();
    if (comp.id === 'FLS_E1') toggleFlsWater();
  };

  const handleComponentMouseUp = (comp) => {
    if (comp.id === 'PB0') handlePb0Up();
    if (comp.id === 'PB1') handlePb1Up();
  };

  // 도면 PDF 경로 (Vite 빌드 후 public/Material 또는 루트 Material 접근을 위한 임시/상대경로)
  // Vite 개발 서버 및 빌드 시 루트 디렉토리의 Material을 static 서빙하기 위한 세팅에 대응
  const pdfPath = `/Material/전기기능사-00${taskNumber}-A4, 2025-08-04.pdf`;

  // 도면 내 현재 부품들의 실시간 상태값 추출
  const getCompState = (id) => {
    return simResult.components.find(c => c.id === id)?.state || 'OFF';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', padding: '20px' }}>
      
      {/* 🚀 상부 글로벌 헤더 */}
      <header className="glass-panel p-4 mb-4" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <span style={{ fontSize: '28px' }}>⚡</span>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: '700', letterSpacing: '0.5px' }}>전기기능사 실기 시퀀스 제어 시뮬레이터</h1>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>HTML5 Canvas & PDF Vector Rendering Framework</p>
          </div>
        </div>
        
        {/* 과제 선택 메뉴 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>선택 과제:</span>
          {clickedCoords.length > 0 && (
          <div style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', color: '#60a5fa', marginRight: '15px' }}>
            최근 클릭 좌표: <strong>X: {clickedCoords[clickedCoords.length - 1].x}, Y: {clickedCoords[clickedCoords.length - 1].y}</strong>
          </div>
        )}
        <select 
          value={taskNumber}
            onChange={(e) => setTaskNumber(parseInt(e.target.value))}
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              padding: '8px 16px',
              borderRadius: '8px',
              outline: 'none',
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            <option value={1}>제 1 과제 (시퀀스 001)</option>
            {/* 향후 18과제까지 쉽게 확장 적용 */}
            {Array.from({ length: 17 }, (_, i) => i + 2).map(num => (
              <option key={num} value={num} disabled>{`제 ${num} 과제 (대기중)`}</option>
            ))}
          </select>
        </div>
      </header>

      {/* 🛠️ 메인 대시보드 뷰어 영역 (좌: 도면 Canvas, 우: 가상 콘솔 및 모니터링) */}
      <main style={{ display: 'grid', gridTemplateColumns: '7fr 5fr', gap: '20px', flex: 1, minHeight: 0 }}>
        
        {/* 좌측: PDF 도면 뷰어 */}
        <section style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <h2 style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: '500' }}>
            📜 제어회로 시퀀스 도면 (7페이지 벡터 렌더링)
          </h2>
          <div style={{ overflow: 'auto', flex: 1 }}>
            <PdfCanvas
              pdfPath={pdfPath}
              pageNumber={currentTask.pdfPage}
              components={simResult.components}
              wires={currentTask.wires}
              activeWires={simResult.activeWires}
              returnActiveWires={simResult.returnActiveWires}
              onComponentClick={handleComponentClick}
              onComponentMouseDown={handleComponentMouseDown}
              onComponentMouseUp={handleComponentMouseUp}
              onCanvasClick={(x, y) => {
                setClickedCoords(prev => [...prev, { x, y }]);
                console.log(`Clicked Coordinate: [${x}, ${y}]`);
              }}
            />
          </div>
        </section>

        {/* 우측: 가상 조작 컨트롤러 및 상태 모니터링 */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '20px', minHeight: 0 }}>
          
          {/* 가상 조작판 */}
          <div className="glass-panel p-5" style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <h3 style={{ fontSize: '15px', color: 'var(--text-secondary)', fontWeight: '600', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
              🎮 가상 제어 콘솔 (컨트롤러)
            </h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              {/* 셀렉터 스위치 조작 */}
              <div style={{ background: 'var(--bg-secondary)', padding: '12px', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>셀렉터 스위치 (SS)</span>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <span style={{ fontWeight: inputs.ssMode === 'M' ? '700' : '400', color: inputs.ssMode === 'M' ? '#f59e0b' : 'var(--text-muted)' }}>수동 (M)</span>
                  <button 
                    onClick={toggleSSMode}
                    style={{
                      width: '50px',
                      height: '26px',
                      borderRadius: '13px',
                      background: inputs.ssMode === 'M' ? '#1e293b' : '#3b82f6',
                      border: '1.5px solid var(--border-color)',
                      position: 'relative',
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      background: '#fff',
                      position: 'absolute',
                      top: '1.5px',
                      left: inputs.ssMode === 'M' ? '3px' : '25px',
                      transition: 'left 0.2s',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
                    }} />
                  </button>
                  <span style={{ fontWeight: inputs.ssMode === 'A' ? '700' : '400', color: inputs.ssMode === 'A' ? '#3b82f6' : 'var(--text-muted)' }}>자동 (A)</span>
                </div>
              </div>

              {/* EOCR 테스트 스위치 */}
              <div style={{ background: 'var(--bg-secondary)', padding: '12px', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>EOCR 테스트 버튼</span>
                <button
                  onClick={toggleEocrTest}
                  style={{
                    background: inputs.eocrTest ? '#ef4444' : 'rgba(239, 68, 68, 0.15)',
                    border: '1.5px solid #ef4444',
                    color: inputs.eocrTest ? '#fff' : '#ef4444',
                    padding: '6px 20px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: '600',
                    transition: 'all 0.2s'
                  }}
                >
                  {inputs.eocrTest ? '🔴 TRIP 발생' : '🔘 TRIP 테스트'}
                </button>
              </div>
            </div>

            {/* 푸시버튼 조작 박스 */}
            <div style={{ background: 'var(--bg-secondary)', padding: '15px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '10px' }}>푸시버튼 누름 스위치 (클릭 유지 시 통전)</span>
              
              <div style={{ display: 'flex', gap: '20px', justifyContent: 'space-around' }}>
                {/* PB0 (적색 정지 스위치) */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                  <button
                    onMouseDown={handlePb0Down}
                    onMouseUp={handlePb0Up}
                    onMouseLeave={handlePb0Up}
                    style={{
                      width: '60px',
                      height: '60px',
                      borderRadius: '50%',
                      background: 'radial-gradient(circle, #f87171 0%, #dc2626 100%)',
                      border: '4px solid #7f1d1d',
                      boxShadow: inputs.pb0Pressed ? 'inset 0 4px 10px rgba(0,0,0,0.8)' : '0 6px 12px rgba(220, 38, 38, 0.3)',
                      transform: inputs.pb0Pressed ? 'translateY(2px)' : 'none',
                      cursor: 'pointer',
                      transition: 'all 0.1s'
                    }}
                  />
                  <span style={{ fontSize: '13px', fontWeight: '500' }}>PB0 (정지)</span>
                </div>

                {/* PB1 (녹색 기동 스위치) */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                  <button
                    onMouseDown={handlePb1Down}
                    onMouseUp={handlePb1Up}
                    onMouseLeave={handlePb1Up}
                    style={{
                      width: '60px',
                      height: '60px',
                      borderRadius: '50%',
                      background: 'radial-gradient(circle, #4ade80 0%, #16a34a 100%)',
                      border: '4px solid #14532d',
                      boxShadow: inputs.pb1Pressed ? 'inset 0 4px 10px rgba(0,0,0,0.8)' : '0 6px 12px rgba(22, 163, 74, 0.3)',
                      transform: inputs.pb1Pressed ? 'translateY(2px)' : 'none',
                      cursor: 'pointer',
                      transition: 'all 0.1s'
                    }}
                  />
                  <span style={{ fontSize: '13px', fontWeight: '500' }}>PB1 (기동)</span>
                </div>
              </div>
            </div>

            {/* FLS 센서 수위 감지 및 타이머 초 설정 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              
              {/* FLS 물 감지 */}
              <div style={{ background: 'var(--bg-secondary)', padding: '12px', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>FLS 수위 센서 감지 (E1-E3)</span>
                <button
                  onClick={toggleFlsWater}
                  style={{
                    background: inputs.flsWaterDetected ? '#3b82f6' : 'rgba(59, 130, 246, 0.15)',
                    border: '1.5px solid #3b82f6',
                    color: inputs.flsWaterDetected ? '#fff' : '#3b82f6',
                    padding: '6px 20px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: '600',
                    transition: 'all 0.2s'
                  }}
                >
                  {inputs.flsWaterDetected ? '💧 수위 가득 (쇼트)' : '💨 물 없음 (오픈)'}
                </button>
              </div>

              {/* 타이머 초 세팅 다이얼 */}
              <div style={{ background: 'var(--bg-secondary)', padding: '12px', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>타이머 지연 설정: <strong style={{ color: '#60a5fa' }}>{timerSetting}초</strong></span>
                <input 
                  type="range"
                  min={1}
                  max={10}
                  value={timerSetting}
                  onChange={(e) => setTimerSetting(parseInt(e.target.value))}
                  style={{
                    width: '90%',
                    cursor: 'pointer',
                    accentColor: '#3b82f6'
                  }}
                />
              </div>
            </div>
          </div>

          {/* 모니터링 출력 패널 */}
          <div className="glass-panel p-5" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <h3 style={{ fontSize: '15px', color: 'var(--text-secondary)', fontWeight: '600', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
              📊 기구 출력 상태 모니터 (계전기 및 램프)
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px', flex: 1 }}>
              {/* 계전기 코일 상태 */}
              <div style={{ background: 'var(--bg-secondary)', padding: '12px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <span style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-secondary)' }}>릴레이/접촉기</span>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px' }}>EOCR</span>
                    <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px #22c55e' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px' }}>Relay X</span>
                    <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: getCompState('X_POWER') === 'ENERGIZED' ? '#ff3e3e' : '#334155', boxShadow: getCompState('X_POWER') === 'ENERGIZED' ? '0 0 8px #ff3e3e' : 'none' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px' }}>Timer T</span>
                    <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: getCompState('T_POWER') === 'ENERGIZED' ? '#ff3e3e' : '#334155', boxShadow: getCompState('T_POWER') === 'ENERGIZED' ? '0 0 8px #ff3e3e' : 'none' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px' }}>MC1</span>
                    <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: getCompState('MC1_POWER') === 'ENERGIZED' ? '#ff3e3e' : '#334155', boxShadow: getCompState('MC1_POWER') === 'ENERGIZED' ? '0 0 8px #ff3e3e' : 'none' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px' }}>MC2</span>
                    <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: getCompState('MC2_POWER') === 'ENERGIZED' ? '#ff3e3e' : '#334155', boxShadow: getCompState('MC2_POWER') === 'ENERGIZED' ? '0 0 8px #ff3e3e' : 'none' }} />
                  </div>
                </div>
              </div>

              {/* 램프 표시 상태 */}
              <div style={{ background: 'var(--bg-secondary)', padding: '12px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <span style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-secondary)' }}>표시등 (램프)</span>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', justifyContent: 'center', height: '80%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      background: getCompState('RL') === 'ON' ? '#ef4444' : '#3a1a1a',
                      border: '1.5px solid #ef4444',
                      boxShadow: getCompState('RL') === 'ON' ? '0 0 12px #ef4444' : 'none'
                    }} />
                    <span style={{ fontSize: '13px', color: getCompState('RL') === 'ON' ? 'var(--text-primary)' : 'var(--text-muted)' }}>RL (적색등)</span>
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      background: getCompState('GL') === 'ON' ? '#22c55e' : '#102e1c',
                      border: '1.5px solid #22c55e',
                      boxShadow: getCompState('GL') === 'ON' ? '0 0 12px #22c55e' : 'none'
                    }} />
                    <span style={{ fontSize: '13px', color: getCompState('GL') === 'ON' ? 'var(--text-primary)' : 'var(--text-muted)' }}>GL (녹색등)</span>
                  </div>

                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px'
                  }}>
                    <div style={{
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      background: getCompState('YL') === 'ON' ? '#eab308' : '#3a2e05',
                      border: '1.5px solid #eab308',
                      boxShadow: getCompState('YL') === 'ON' ? '0 0 12px #eab308' : 'none'
                    }} />
                    <span style={{ fontSize: '13px', color: getCompState('YL') === 'ON' ? 'var(--text-primary)' : 'var(--text-muted)' }}>YL (황색등)</span>
                  </div>
                </div>
              </div>

              {/* 경보 상태 */}
              <div style={{ background: 'var(--bg-secondary)', padding: '12px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <span style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-secondary)' }}>경보 기구 (부저)</span>
                
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '80%', gap: '10px' }}>
                  <div style={{
                    fontSize: '32px',
                    opacity: getCompState('BZ') === 'ON' ? '1' : '0.15',
                    filter: getCompState('BZ') === 'ON' ? 'drop-shadow(0 0 8px #f97316)' : 'none'
                  }}>
                    🔔
                  </div>
                  <span style={{ fontSize: '13px', color: getCompState('BZ') === 'ON' ? '#f97316' : 'var(--text-muted)', fontWeight: '600' }}>
                    {getCompState('BZ') === 'ON' ? 'BUZZER 경보 중' : '부저 대기'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

      </main>
    </div>
  );
}
