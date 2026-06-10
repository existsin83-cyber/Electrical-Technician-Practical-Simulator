# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — Vite dev server on port 3000 (auto-opens browser)
- `npm run build` — production build
- `npm run preview` — preview production build

No test runner or linter is configured.

## Architecture

A React 19 + Vite SPA simulating 전기기능사 실기 sequence-control circuits. The exam circuit diagram is a vector PDF rendered to a canvas; an absolutely-positioned SVG layer on top draws live wires and interactive component hotspots.

Data flows in one direction, recomputed every render:

1. **`src/App.jsx`** — top-level state owner. Holds `inputs` (PB0/PB1/selector/FLS/EOCR), `timerSetting`/`timerStates`, `flickerState`, and `activeCoils`. On any input change it calls `simulateCircuit(...)` and stores the result. Two `useEffect`s drive real time: a timeout for the timer's delayed contact (`T_POWER` → `tElapsed`) and a 1s interval for the flicker relay (`FR_POWER` → alternating YL lamp / BZ buzzer).

2. **`src/simulation/engine.js`** — `simulateCircuit(components, wires, inputs, timerStates, flickerState, prevActiveCoils)`. Pure function. Models the circuit as a graph: BFS from `FUSE_L1` across `wires`, passing through a node only if its contact `state === 'CLOSED'`. Reached `coil` nodes become energized; energized coils flip their associated contacts (e.g. `X_POWER` → `X_A1`/`X_A2`), and the loop re-runs until convergence (max 8 iterations). **Self-holding (자기유지) is implemented by feeding the previous frame's energized coils back in via `prevActiveCoils`** — App stores `result.activeCoils` into state, retriggering the effect. Returns updated components plus `activeWires` / `returnActiveWires` ID lists for highlighting.

3. **`src/components/PdfCanvas.jsx`** — loads the PDF with `pdfjs-dist`, scales it to container width, renders the page to `<canvas>`, and overlays an `<svg>` whose `viewBox` maps 1:1 to the PDF's native point coordinate system (842×595, landscape A4). Wires/hotspots are positioned in those PDF points. A transparent rect logs click coordinates (used while authoring task data).

4. **`src/simulation/tasks/task01.js`** — per-task data: `components` (each with `id`, `type`, `state`, and `x`/`y` in PDF points) and `wires` (each with `points` polylines). Only task 1 exists; App's task selector lists 18 but disables 2–18.

### Key conventions

- **Coordinates are PDF native points** (842×595), not pixels. New component/wire coordinates must be captured in that system — use the canvas click-to-log feature.
- **Component `type` drives behavior**: `coil`, `contact_a`/`contact_b`, `btn_a`/`btn_b`, `selector`, `sensor`, `lamp`, `buzzer`, `fuse`, `mccb`. Types starting with `contact_`/`btn_` (and `sensor`) gate current flow by `state`. `btn_`/`selector`/`sensor` are clickable hotspots.
- **State vocabulary**: contacts use `CLOSED`/`OPEN`, coils use `ENERGIZED`/`DEENERGIZED`, outputs use `ON`/`OFF`.
- **Coil → contact wiring is hardcoded by id** in engine.js (e.g. `X_POWER`→`X_A1`/`X_A2`). Adding a relay means adding both the coil and its contact-update mapping.
- **PDFs live in `public/Material/`** and are fetched at runtime as `/Material/전기기능사-00{n}-A4, 2025-08-04.pdf`.
- **Styling** is CSS variables in `src/index.css` (wire colors, neon glow) plus inline styles; `.wire-path.active` / `.return-active` and `.node-point.active` drive the live highlighting. UI text is Korean.

### Adding a new task (2–18)

Create `src/simulation/tasks/taskNN.js` mirroring `task01`'s shape, import it in App.jsx, wire it into the task selector, and capture coordinates from the corresponding PDF page using the click-logger.
