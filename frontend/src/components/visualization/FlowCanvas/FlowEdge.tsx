import type { GridEdge, EdgeSpec } from './types';
import type { SimulationParams } from '../../../types/simulation';
import { COLORS } from '../../../lib/constants';

// ============================================================
// Layout constants needed from parent layout
// ============================================================
// These must match the layout in AcademicFlowView.
// For grid bezier: GRID_BOT = GRID_Y + GRID_H = 16 + 84 = 100
const GRID_BOT = 100;

// ============================================================
// Helper: path strings
// ============================================================
export function mainEdgePath(e: EdgeSpec, nodeMap: Map<string, { x: number; y: number; w: number; h: number; cx: number; cy: number }>): string {
  const sn = nodeMap.get(e.src)!, tn = nodeMap.get(e.tgt)!;
  const x1 = sn.x + sn.w, x2 = tn.x, y = sn.cy;
  return `M${x1},${y} Q${(x1 + x2) / 2},${y} ${x2},${y}`;
}

export function gridBezier(ge: GridEdge, nodeMap: Map<string, { x: number; y: number; w: number; h: number; cx: number; cy: number }>): string {
  const tn = nodeMap.get(ge.tgt)!;
  const x1 = tn.cx, y1 = GRID_BOT, x2 = tn.cx, y2 = tn.y;
  const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2 - 30;
  return `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`;
}

export function gridLabelPos(ge: GridEdge, nodeMap: Map<string, { x: number; y: number; w: number; h: number; cx: number; cy: number }>): { x: number; y: number } {
  const tn = nodeMap.get(ge.tgt)!;
  // Exact midpoint between grid bottom and node top
  return { x: tn.cx + 8, y: (GRID_BOT + tn.y) / 2 };
}

export function mainLabelPos(e: EdgeSpec, nodeMap: Map<string, { x: number; y: number; w: number; h: number; cx: number; cy: number }>): { x: number; y: number } {
  const sn = nodeMap.get(e.src)!, tn = nodeMap.get(e.tgt)!;
  return { x: (sn.x + sn.w + tn.x) / 2, y: sn.cy - 10 };
}

// ============================================================
// GridEdgeLabel — dual-β label for grid edges
// ============================================================
function GridEdgeLabel({ ge, params, x, y, enhanced }: {
  ge: GridEdge; params: SimulationParams | null; x: number; y: number; enhanced: boolean;
}) {
  const betas = ge.betas;
  const lineH = 14;
  const startY = y - ((betas.length - 1) * lineH) / 2;
  return (
    <g opacity={enhanced ? 1 : 0.7}>
      {betas.map((b, i) => {
        const val = params ? (params[b.key] as number) : b.defVal;
        const active = Math.abs(val) > 0.001;
        const prec = b.defVal < 0.1 ? 3 : 2;
        const sc = b.src === 'race' ? COLORS.majority.text : COLORS.ability.text;
        return (
          <text key={b.key} x={x} y={startY + i * lineH} textAnchor="middle"
            fill={active ? sc : 'var(--color-ink-secondary)'}
            fontFamily="'Geist Sans', sans-serif" fontSize="10"
            opacity={active ? 0.9 : 0.4}>
            <tspan fontFamily="'Newsreader','Lyon Text',serif" fontStyle="italic" fontSize="11">β</tspan>
            <tspan baselineShift="sub" fontSize="7">{b.src},{ge.tgt}</tspan>
            <tspan> = {val.toFixed(prec)}</tspan>
          </text>
        );
      })}
    </g>
  );
}

// ============================================================
// GridFlowEdge — bezier edge from grid to a main node
// ============================================================
interface GridFlowEdgeProps {
  ge: GridEdge;
  nodeMap: Map<string, { x: number; y: number; w: number; h: number; cx: number; cy: number }>;
  params: SimulationParams | null;
  enhanced: boolean;
  highlightedParam: string | null;
}

export function GridFlowEdge({ ge, nodeMap, params, enhanced, highlightedParam }: GridFlowEdgeProps) {
  const ekey = `grid-${ge.tgt}`;
  const effectiveEnhanced = enhanced || !!ge.betas.find(b => b.key === highlightedParam);
  const d = gridBezier(ge, nodeMap);
  const lp = gridLabelPos(ge, nodeMap);
  return (
    <g key={ekey} data-edge={ekey}>
      <path d={d} fill="none" stroke="transparent" strokeWidth={14} style={{ cursor: 'pointer' }} />
      <path d={d} fill="none" stroke={effectiveEnhanced ? 'var(--color-accent)' : '#A0A0A0'}
        strokeWidth={effectiveEnhanced ? 2.5 : 1.2} />
      <GridEdgeLabel ge={ge} params={params} x={lp.x} y={lp.y} enhanced={effectiveEnhanced} />
    </g>
  );
}

// ============================================================
// MainFlowEdge — polyline edge along the main axis
// ============================================================
interface MainFlowEdgeProps {
  edge: EdgeSpec;
  nodeMap: Map<string, { x: number; y: number; w: number; h: number; cx: number; cy: number }>;
  enhanced: boolean;
}

export function MainFlowEdge({ edge, nodeMap, enhanced }: MainFlowEdgeProps) {
  const ekey = `${edge.src}-${edge.tgt}`;
  const d = mainEdgePath(edge, nodeMap);
  const lp = mainLabelPos(edge, nodeMap);
  return (
    <g key={ekey} data-edge={ekey}>
      <path d={d} fill="none" stroke="transparent" strokeWidth={14} style={{ cursor: 'pointer' }} />
      <path d={d} fill="none" stroke={enhanced ? 'var(--color-accent)' : '#A8A8A6'}
        strokeWidth={enhanced ? 5 : 3.5} />
      <text x={lp.x} y={lp.y} textAnchor="middle"
        fill="var(--color-ink-secondary)" fontFamily="'Geist Mono',monospace" fontSize="9.5"
        opacity={enhanced ? 1 : 0.65}>β = 1.00</text>
    </g>
  );
}
