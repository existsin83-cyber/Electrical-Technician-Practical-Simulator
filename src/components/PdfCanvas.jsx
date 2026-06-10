import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export default function PdfCanvas({
  pdfPath,
  pageNumber,
  components,
  wires,
  activeWires,
  returnActiveWires,
  onComponentClick,
  onComponentMouseDown,
  onComponentMouseUp,
  onCanvasClick
}) {
  const stageRef = useRef(null);   // 패딩 없는 내부 스테이지 (canvas + svg 가 정확히 겹치는 박스)
  const canvasRef = useRef(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  // PDF 원본 포인트 좌표계 (scale 1.0 기준). task 데이터의 좌표가 이 기준으로 작성됨.
  const [nativeSize, setNativeSize] = useState({ width: 842, height: 595 });
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // PDF 문서 로드
  useEffect(() => {
    setLoading(true);
    setError(null);
    setReady(false);

    if (!pdfPath) return;
    const loadingTask = pdfjsLib.getDocument({ url: pdfPath });
    loadingTask.promise.then(
      (pdf) => {
        setPdfDoc(pdf);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('PDF 로드 실패:', err);
        setError('도면 PDF 파일을 불러오지 못했습니다. 경로를 확인해 주세요.');
        setLoading(false);
      }
    );

    return () => {
      loadingTask.destroy();
    };
  }, [pdfPath]);

  // Canvas 렌더링 (스테이지 폭에 맞춰 스케일, 고해상도 대응)
  useEffect(() => {
    if (!pdfDoc) return;
    let isMounted = true;

    const renderPage = () => {
      pdfDoc.getPage(pageNumber).then((page) => {
        if (!isMounted) return;

        const native = page.getViewport({ scale: 1.0 });
        setNativeSize({ width: native.width, height: native.height });

        // 스테이지(=실제 표시 박스)의 콘텐츠 폭 기준으로 스케일 계산. 패딩 미포함.
        const stageWidth = stageRef.current?.clientWidth || native.width;
        const dpr = window.devicePixelRatio || 1;
        const cssScale = stageWidth / native.width;
        const viewport = page.getViewport({ scale: cssScale * dpr });

        const canvas = canvasRef.current;
        if (!canvas) return;
        const context = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        // CSS 표시 크기는 스테이지 폭에 100%로 고정 → SVG(100%)와 항상 동일 박스
        canvas.style.width = '100%';
        canvas.style.height = 'auto';

        page.render({ canvasContext: context, viewport });
        setReady(true);
      });
    };

    renderPage();
    window.addEventListener('resize', renderPage);
    return () => {
      isMounted = false;
      window.removeEventListener('resize', renderPage);
    };
  }, [pdfDoc, pageNumber]);

  const handleNodeClick = (comp) => { if (onComponentClick) onComponentClick(comp); };
  const handleNodeMouseDown = (comp) => { if (onComponentMouseDown) onComponentMouseDown(comp); };
  const handleNodeMouseUp = (comp) => { if (onComponentMouseUp) onComponentMouseUp(comp); };

  // PDF 원본 포인트 좌표를 그대로 SVG 패스로 변환 (viewBox 가 원본 좌표계와 1:1)
  const getSvgPathString = (points) => {
    if (!points || points.length === 0) return '';
    return points.reduce((acc, p, idx) => acc + `${idx === 0 ? 'M' : 'L'} ${p[0]} ${p[1]} `, '');
  };

  return (
    <div className="glass-panel p-2" style={{ width: '100%' }}>
      {/* 패딩 없는 스테이지: canvas 와 svg 가 정확히 같은 박스를 점유 */}
      <div ref={stageRef} style={{ position: 'relative', width: '100%', lineHeight: 0 }}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900 bg-opacity-70 rounded-xl" style={{ zIndex: 10 }}>
            <p className="text-blue-400 font-semibold animate-pulse">도면 로딩 및 벡터 렌더링 중...</p>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-red-950 bg-opacity-75 rounded-xl" style={{ zIndex: 10 }}>
            <p className="text-red-400 font-semibold">{error}</p>
          </div>
        )}

        {/* PDF 도면 백그라운드 Canvas */}
        <canvas ref={canvasRef} style={{ display: 'block', borderRadius: '12px', width: '100%', height: 'auto' }} />

        {/* 실시간 전류 네온 하이라이트 및 인터랙션 레이어 (SVG) — canvas 와 정확히 겹침 */}
        {ready && (
          <svg
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
              zIndex: 5
            }}
            viewBox={`0 0 ${nativeSize.width} ${nativeSize.height}`}
            preserveAspectRatio="none"
          >
            {/* 클릭 좌표 디버깅용 투명 배경 */}
            <rect
              width={nativeSize.width}
              height={nativeSize.height}
              fill="transparent"
              style={{ pointerEvents: 'auto', cursor: 'crosshair' }}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const ptX = Math.round(((e.clientX - rect.left) / rect.width) * nativeSize.width);
                const ptY = Math.round(((e.clientY - rect.top) / rect.height) * nativeSize.height);
                if (onCanvasClick) onCanvasClick(ptX, ptY);
              }}
            />

            {/* 1. 전선 레이어 */}
            <g>
              {wires.map((wire) => {
                const isActive = activeWires.includes(wire.id);
                const isReturnActive = returnActiveWires.includes(wire.id);
                let className = 'wire-path';
                if (isActive) className += ' active';
                else if (isReturnActive) className += ' return-active';
                return <path key={wire.id} d={getSvgPathString(wire.points)} className={className} />;
              })}
            </g>

            {/* 2. 인터랙티브 컴포넌트 핫스팟 레이어 */}
            <g style={{ pointerEvents: 'auto' }}>
              {components.map((comp) => {
                const isActive = comp.state === 'CLOSED' || comp.state === 'ENERGIZED' || comp.state === 'ON';
                const isClickable = comp.type.startsWith('btn_') || comp.type === 'selector' || comp.type === 'sensor';
                if (!isClickable) return null;
                return (
                  <circle
                    key={comp.id}
                    cx={comp.x}
                    cy={comp.y}
                    r={12}
                    className={`node-point ${isActive ? 'active' : ''}`}
                    title={`${comp.name} (${comp.state})`}
                    onMouseDown={() => handleNodeMouseDown(comp)}
                    onMouseUp={() => handleNodeMouseUp(comp)}
                    onMouseLeave={() => handleNodeMouseUp(comp)}
                    onClick={() => handleNodeClick(comp)}
                  />
                );
              })}
            </g>
          </svg>
        )}
      </div>
    </div>
  );
}
