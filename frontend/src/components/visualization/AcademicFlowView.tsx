import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import type { AgentData, SimulationParams } from '../../types/simulation';
import { COLORS } from '../../lib/constants';
import { Card } from '../shared/Card';
import { Play, Pause, ArrowCounterClockwise, Plus, Minus, CornersOut } from '@phosphor-icons/react';

// ============================================================
// Deterministic pseudo-random
// ============================================================
function hash01(seed: number): number {
  let h = ((seed * 2654435761) >>> 0);
  h = ((h >> 17) | (h << 15)) >>> 0;
  h = (h * 2246822519) >>> 0;
  h = ((h >> 13) | (h << 19)) >>> 0;
  h = (h * 3266489917) >>> 0;
  return (h & 0x7fffffff) / 2147483648;
}
function jitter(id: number, stage: number): number {
  return (hash01(id * 2654435761 + stage * 7) - 0.5) * 4;
}
function zNorm(vals: number[]): number[] {
  const n = vals.length; if (n === 0) return [];
  const m = vals.reduce((a, b) => a + b, 0) / n;
  const v = vals.reduce((s, x) => s + (x - m) ** 2, 0) / n;
  return vals.map(x => (x - m) / (Math.sqrt(v) || 1));
}

// ============================================================
// Layout — 1200×620 canvas
// ============================================================
const STAGE_W = 210, STAGE_H = 330;
const NODE_GAP = 80;
const MARGIN_LEFT = 90;
const MAIN_TOP = 190;
const MAIN_CY = MAIN_TOP + STAGE_H / 2; // 355
const CANVAS_W = 1200, CANVAS_H = 620;

const STAGE_CX = [0, 1, 2, 3].map(i => MARGIN_LEFT + STAGE_W / 2 + i * (STAGE_W + NODE_GAP));
// → [195, 485, 775, 1065]
const STAGE_X = STAGE_CX.map(cx => cx - STAGE_W / 2);
// → [90, 380, 670, 960]

// Combined grid at top
const GRID_X = 80, GRID_Y = 16, GRID_W = 1040, GRID_H = 84;
const GRID_BOT = GRID_Y + GRID_H; // 100
const GRID_DIV = GRID_X + GRID_W / 2; // 600 — divider between race/ability

const NODE_TOP_PAD = 132, NODE_BOT_PAD = 8;

// ============================================================
// Types
// ============================================================
interface NodeSpec { key: string; label: string; sub: string; x: number; y: number; w: number; h: number; cx: number; cy: number; }
interface EdgeSpec { src: string; tgt: string; betaKey: keyof SimulationParams; defVal: number; style: 'main' | 'beta' | 'zero'; }

const NODES: NodeSpec[] = [
  { key: 'income',   label: '继承阶层', sub: 'income',   x: STAGE_X[0], y: MAIN_TOP, w: STAGE_W, h: STAGE_H, cx: STAGE_CX[0], cy: MAIN_CY },
  { key: 'nhood',    label: '社区质量', sub: 'nhood',    x: STAGE_X[1], y: MAIN_TOP, w: STAGE_W, h: STAGE_H, cx: STAGE_CX[1], cy: MAIN_CY },
  { key: 'school',   label: '学校质量', sub: 'school',   x: STAGE_X[2], y: MAIN_TOP, w: STAGE_W, h: STAGE_H, cx: STAGE_CX[2], cy: MAIN_CY },
  { key: 'earnings', label: '劳动收入', sub: 'earnings', x: STAGE_X[3], y: MAIN_TOP, w: STAGE_W, h: STAGE_H, cx: STAGE_CX[3], cy: MAIN_CY },
];

// Main axis edges
const MAIN_EDGES: EdgeSpec[] = [
  { src: 'income', tgt: 'nhood',    betaKey: 'beta_income_nhood',    defVal: 1.0, style: 'main' },
  { src: 'nhood', tgt: 'school',    betaKey: 'beta_nhood_school',    defVal: 1.0, style: 'main' },
  { src: 'school', tgt: 'earnings', betaKey: 'beta_school_earnings', defVal: 1.0, style: 'main' },
];

// ── 4 merged bezier edges from grid to main nodes ──
interface GridEdge {
  tgt: string; // target main node key
  betas: { src: string; key: keyof SimulationParams; defVal: number }[];
}
const GRID_EDGES: GridEdge[] = [
  { tgt: 'income',   betas: [{ src: 'race', key: 'beta_race_income', defVal: 0.75 }] },
  { tgt: 'nhood',    betas: [{ src: 'race', key: 'beta_race_nhood', defVal: 0.075 },
                             { src: 'ability', key: 'beta_ability_nhood', defVal: 0.0 }] },
  { tgt: 'school',   betas: [{ src: 'race', key: 'beta_race_school', defVal: 0.075 },
                             { src: 'ability', key: 'beta_ability_school', defVal: 0.3 }] },
  { tgt: 'earnings', betas: [{ src: 'race', key: 'beta_race_earnings', defVal: 0.075 },
                             { src: 'ability', key: 'beta_ability_earnings', defVal: 0.3 }] },
];

const nodeMap = new Map(NODES.map(n => [n.key, n]));
const STAGES = ['income', 'nhood', 'school', 'earnings'];

// ============================================================
// Edge routing (bezier for grid→node, polyline for main/cross)
// ============================================================
function mainEdgePath(e: EdgeSpec): string {
  const sn = nodeMap.get(e.src)!, tn = nodeMap.get(e.tgt)!;
  const x1 = sn.x + sn.w, x2 = tn.x, y = sn.cy;
  return `M${x1},${y} Q${(x1 + x2) / 2},${y} ${x2},${y}`;
}

function gridBezier(ge: GridEdge): string {
  const tn = nodeMap.get(ge.tgt)!;
  const x1 = tn.cx, y1 = GRID_BOT, x2 = tn.cx, y2 = tn.y;
  const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2 - 30;
  return `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`;
}

function gridLabelPos(ge: GridEdge): { x: number; y: number } {
  const tn = nodeMap.get(ge.tgt)!;
  // Exact midpoint between grid bottom and node top
  return { x: tn.cx + 8, y: (GRID_BOT + tn.y) / 2 };
}

function mainLabelPos(e: EdgeSpec): { x: number; y: number } {
  const sn = nodeMap.get(e.src)!, tn = nodeMap.get(e.tgt)!;
  return { x: (sn.x + sn.w + tn.x) / 2, y: sn.cy - 10 };
}

// ============================================================
// Dual-β label for grid edges (1-2 β values stacked vertically)
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
// Stage structural equation — rendered inside each main node
// ============================================================
interface FormulaTerm { text: string; sub?: string; }
type FormulaLine = FormulaTerm[];

const STAGE_FORMULAS: Record<string, { lhs: string; lines: FormulaLine[] }> = {
  income: {
    lhs: 'I',
    lines: [[
      { text: ' = ' }, { text: 'β', sub: 'race' }, { text: '·Race + ε' },
    ]],
  },
  nhood: {
    lhs: 'N',
    lines: [[
      { text: ' = ' }, { text: 'β', sub: 'inc' }, { text: '·I + ' },
      { text: 'β', sub: 'race' }, { text: '·Race + ' },
      { text: 'β', sub: 'abl' }, { text: '·Abl + ε' },
    ]],
  },
  school: {
    lhs: 'S',
    lines: [[
      { text: ' = ' }, { text: 'β', sub: 'nhd' }, { text: '·N + ' },
      { text: 'β', sub: 'inc' }, { text: '·I + ' },
      { text: 'β', sub: 'race' }, { text: '·Race + ε' },
    ], [
      { text: '  + ' }, { text: 'β', sub: 'abl' }, { text: '·Abl' },
    ]],
  },
  earnings: {
    lhs: 'Y',
    lines: [[
      { text: ' = ' }, { text: 'β', sub: 'sch' }, { text: '·S + ' },
      { text: 'β', sub: 'nhd' }, { text: '·N + ' },
      { text: 'β', sub: 'inc' }, { text: '·I + ' },
      { text: 'β', sub: 'race' }, { text: '·Race' },
    ], [
      { text: '  + ' }, { text: 'β', sub: 'abl' }, { text: '·Abl + Luck + ε' },
    ]],
  },
};

function StageFormula({ stageKey, x, y, lineH }: { stageKey: string; x: number; y: number; lineH: number }) {
  const f = STAGE_FORMULAS[stageKey];
  if (!f) return null;
  return (
    <g>
      {f.lines.map((terms, li) => (
        <text key={li} x={x} y={y + li * lineH} textAnchor="middle"
          fill="var(--color-ink-secondary)" fontFamily="'Geist Sans', sans-serif" fontSize="8.5">
          {li === 0 && <tspan fontWeight="bold" fill="var(--color-ink)">{f.lhs}</tspan>}
          {terms.map((t, ti) =>
            t.sub
              ? <tspan key={ti}>{t.text.slice(0, 1)}<tspan baselineShift="sub" fontSize="6.5">{t.sub}</tspan>{t.text.slice(1)}</tspan>
              : <tspan key={ti}>{t.text}</tspan>
          )}
        </text>
      ))}
    </g>
  );
}
function YAxis({ nodeW, nodeH }: { nodeW: number; nodeH: number }) {
  const top = NODE_TOP_PAD, bottom = nodeH - NODE_BOT_PAD, axisX = 24;
  return (
    <g>
      <line x1={axisX} y1={top} x2={axisX} y2={bottom} stroke="var(--color-border)" strokeWidth={0.8} />
      {[0, 25, 50, 75, 100].map(pct => {
        const y = top + (bottom - top) * (1 - pct / 100);
        return (
          <g key={pct}>
            <line x1={axisX - 3} y1={y} x2={nodeW - 8} y2={y} stroke="var(--color-border)" strokeWidth={0.3} strokeDasharray="3,4" />
            <text x={axisX - 5} y={y} textAnchor="end" dominantBaseline="central"
              fill="var(--color-ink-secondary)" fontFamily="'Geist Mono', monospace" fontSize="8.5">{pct}%</text>
          </g>
        );
      })}
    </g>
  );
}

// ============================================================
// Particle helpers
// ============================================================
interface Particle {
  id: number; race: number; r: number;
  stageY: number[]; delay: number;
  income: number; nhood: number; school: number; earnings: number;
}

function buildParticles(agents: AgentData[]): Particle[] {
  if (agents.length === 0) return [];
  const attrs = ['income', 'nhood_proper', 'school_proper', 'earnings'] as const;
  const raw = attrs.map(attr => agents.map(a => {
    const v = (a as unknown as Record<string, unknown>)[attr];
    return typeof v === 'number' && !Number.isNaN(v) ? v : 0;
  }));
  const norms = raw.map(v => zNorm(v));
  const eMin = Math.min(...agents.map(a => a.earnings)), eMax = Math.max(...agents.map(a => a.earnings)), eR = eMax - eMin || 1;
  return agents.map((a, i) => ({
    id: a.agent_id, race: a.race,
    r: 1.6 + 3.5 * ((a.earnings - eMin) / eR),
    stageY: [0, 1, 2, 3].map(s => Math.max(0.03, Math.min(0.97, (norms[s][i] + 3) / 6))),
    delay: hash01(a.agent_id * 1103515245) * 0.28,
    income: a.income, nhood: a.nhood_proper, school: a.school_proper, earnings: a.earnings,
  }));
}

interface CirclePos { x: number; y: number; id: number; race: number; r: number; stageIdx: number; }

function computePositions(particles: Particle[], wave: number, t: number): CirclePos[] {
  const result: CirclePos[] = [];
  if (particles.length === 0) return result;

  const posX = (n: NodeSpec, id: number, si: number) =>
    n.x + 20 + hash01(id * 7 + si * 13) * (n.w - 40);
  const posY = (n: NodeSpec, p: Particle, si: number) =>
    n.y + NODE_TOP_PAD + (n.h - NODE_TOP_PAD - NODE_BOT_PAD) * (1 - p.stageY[si]) + jitter(p.id, si);

  if (wave === 0) {
    for (const p of particles) {
      const n = nodeMap.get('income')!;
      result.push({ x: posX(n, p.id, 0), y: posY(n, p, 0), id: p.id, race: p.race, r: p.r, stageIdx: 0 });
    }
    return result;
  }
  if (wave >= 4) {
    for (const p of particles) {
      for (let s = 0; s < 4; s++) {
        const n = nodeMap.get(STAGES[s])!;
        result.push({ x: posX(n, p.id, s), y: posY(n, p, s), id: p.id, race: p.race, r: p.r * 0.5, stageIdx: s });
      }
    }
    return result;
  }

  const si = wave - 1, ti = wave;
  for (const p of particles) {
    const effT = Math.max(0, Math.min(1, (t - p.delay) / Math.max(0.001, 1 - p.delay)));
    const st = effT < 1 ? effT * effT * (3 - 2 * effT) : 1;
    const sn = nodeMap.get(STAGES[si])!, tn = nodeMap.get(STAGES[ti])!;
    result.push({
      x: posX(sn, p.id, si) + (posX(tn, p.id, ti) - posX(sn, p.id, si)) * st,
      y: posY(sn, p, si) + (posY(tn, p, ti) - posY(sn, p, si)) * st,
      id: p.id, race: p.race, r: p.r, stageIdx: ti,
    });
    for (let s = 0; s < si; s++) {
      const gn = nodeMap.get(STAGES[s])!;
      result.push({ x: posX(gn, p.id, s), y: posY(gn, p, s), id: p.id, race: p.race, r: p.r * 0.5, stageIdx: s });
    }
  }
  return result;
}

// ============================================================
// Component
// ============================================================
interface Props {
  agents: AgentData[];
  params: SimulationParams | null;
  selectedAgentId: number | null;
  onSelectAgent: (id: number) => void;
  loading: boolean;
  error: string | null;
  highlightedParam: string | null;
}

export function AcademicFlowView({ agents, params, selectedAgentId, onSelectAgent, loading, error, highlightedParam }: Props) {
  const particles = useMemo(() => buildParticles(agents), [agents]);
  const particlesRef = useRef(particles);
  particlesRef.current = particles;

  // Animation state — setWave triggers React render at wave BOUNDARIES only
  const [wave, setWave] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [, setRedraw] = useState(0); // force re-render when needed (zoom, etc.)
  const animRef = useRef({ wave: 0, t: 0, playing: false, lastT: 0 });
  const rafRef = useRef(0);
  const circlesGRef = useRef<SVGGElement>(null);

  // Zoom/pan
  const zoomRef = useRef({ x: 0, y: 0, k: 1 });
  const dragRef = useRef({ active: false, sx: 0, sy: 0, zx: 0, zy: 0 });
  const svgWrapperRef = useRef<HTMLDivElement>(null);

  // Hover
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);
  const [hoveredParticleId, setHoveredParticleId] = useState<number | null>(null);
  const [hoveredParticleStage, setHoveredParticleStage] = useState<number | null>(null);

  // ---- rAF tick — only called when playing, updates DOM directly ----
  const tick = useCallback((now: number) => {
    const a = animRef.current;
    if (!a.playing) return;

    const dt = a.lastT ? Math.min((now - a.lastT) / 1000, 0.1) : 0.016;
    a.lastT = now;
    const nt = a.t + dt * 0.5;

    if (nt >= 1) {
      a.t = 0; a.wave += 1;
      if (a.wave > 4) { a.playing = false; setPlaying(false); return; }
      setWave(a.wave);
    } else {
      a.t = nt;
      const pos = computePositions(particlesRef.current, a.wave, nt);
      const g = circlesGRef.current;
      if (g) {
        const circles = g.children;
        for (let i = 0; i < pos.length && i < circles.length; i++) {
          const c = circles[i] as SVGCircleElement;
          c.setAttribute('cx', String(pos[i].x));
          c.setAttribute('cy', String(pos[i].y));
        }
      }
    }
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => { return () => cancelAnimationFrame(rafRef.current); }, []);

  // ---- Controls ----
  const start = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    animRef.current = { wave: 1, t: 0, playing: true, lastT: 0 };
    setWave(1); setPlaying(true);
    rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  const toggle = useCallback(() => {
    const a = animRef.current;
    if (a.playing) { a.playing = false; setPlaying(false); cancelAnimationFrame(rafRef.current); }
    else { a.playing = true; a.lastT = 0; setPlaying(true); rafRef.current = requestAnimationFrame(tick); }
  }, [tick]);

  const reset = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    animRef.current = { wave: 0, t: 0, playing: false, lastT: 0 };
    setWave(0); setPlaying(false);
  }, []);

  const handlePlayPause = useCallback(() => {
    if (playing) { toggle(); return; }
    if (wave > 0 && wave < 4) { toggle(); return; }
    start();
  }, [playing, wave, toggle, start]);

  // Auto-start
  const prevCount = useRef(0);
  useEffect(() => {
    if (agents.length > 0 && agents.length !== prevCount.current) {
      prevCount.current = agents.length;
      const t = setTimeout(start, 400);
      return () => clearTimeout(t);
    }
  }, [agents.length, start]);

  // ---- Zoom & Pan ----
  useEffect(() => {
    const el = svgWrapperRef.current; if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const z = zoomRef.current;
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const nk = Math.max(0.25, Math.min(5, z.k * factor));
      z.x = mx - (mx - z.x) * (nk / z.k);
      z.y = my - (my - z.y) * (nk / z.k);
      z.k = nk;
      setRedraw(t => t + 1);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Don't start drag if clicking on a circle (let particle click through)
    const t = e.target as Element;
    if (t.tagName === 'circle') return;
    dragRef.current = { active: true, sx: e.clientX, sy: e.clientY, zx: zoomRef.current.x, zy: zoomRef.current.y };
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current.active) return;
      zoomRef.current.x = dragRef.current.zx + (e.clientX - dragRef.current.sx);
      zoomRef.current.y = dragRef.current.zy + (e.clientY - dragRef.current.sy);
      setRedraw(t => t + 1);
    };
    const onUp = () => { dragRef.current.active = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  // ---- Event delegation: single mousemove on SVG ----
  const handleSvgMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const t = e.target as Element;
    const tag = t.tagName;
    if (tag === 'circle') {
      const el = t as SVGCircleElement;
      const aid = Number(el.dataset.agentId);
      const sid = Number(el.dataset.stageIdx);
      if (!Number.isNaN(aid)) {
        setHoveredParticleId(aid);
        setHoveredParticleStage(Number.isNaN(sid) ? null : sid);
        setHoveredNode(null); setHoveredEdge(null); return;
      }
    }
    // Check parent group for data attributes
    const parent = t.closest?.('[data-node]') as SVGElement | null;
    if (parent) { setHoveredNode(parent.dataset.node!); setHoveredEdge(null); setHoveredParticleId(null); return; }
    const edgeParent = t.closest?.('[data-edge]') as SVGElement | null;
    if (edgeParent) { setHoveredEdge(edgeParent.dataset.edge!); setHoveredNode(null); setHoveredParticleId(null); return; }
    // Nothing interactive under cursor
    setHoveredNode(null); setHoveredEdge(null); setHoveredParticleId(null); setHoveredParticleStage(null);
  }, []);

  const handleSvgMouseLeave = useCallback(() => {
    setHoveredNode(null); setHoveredEdge(null); setHoveredParticleId(null); setHoveredParticleStage(null);
  }, []);

  // ---- Hover helpers (enhance only, NO dimming) ----
  const isNodeEnhanced = (key: string) => {
    if (hoveredNode === key) return true;
    if (hoveredParticleId !== null && hoveredParticleStage !== null) {
      return STAGES.indexOf(key) === hoveredParticleStage;
    }
    return false;
  };
  const isEdgeEnhanced = (ekey: string) => hoveredEdge === ekey;
  const getParticleOpacity = (p: CirclePos) => {
    if (hoveredParticleId === p.id) return 1;
    if (selectedAgentId === p.id) return 1;
    return 0.55;
  };

  // ---- Derived data ----
  const circlePositions = useMemo(
    () => computePositions(particles, wave, 0),
    [particles, wave],
  );

  const nodeStats = useMemo(() => {
    if (agents.length === 0) return new Map<string, { majM: number; minM: number; gap: number }>();
    const m = new Map<string, { majM: number; minM: number; gap: number }>();
    for (const [key, attr] of [['income', 'income'], ['nhood', 'nhood_proper'], ['school', 'school_proper'], ['earnings', 'earnings']] as [string, keyof AgentData][]) {
      const maj = agents.filter(a => a.race === 1).map(a => a[attr] as number);
      const min = agents.filter(a => a.race === 0).map(a => a[attr] as number);
      const majM = maj.reduce((s, v) => s + v, 0) / (maj.length || 1);
      const minM = min.reduce((s, v) => s + v, 0) / (min.length || 1);
      m.set(key, { majM, minM, gap: majM - minM });
    }
    return m;
  }, [agents]);

  const empty = agents.length === 0;
  const btnLabel = playing ? '暂停' : (wave > 0 && wave < 4) ? '继续' : '播放';
  const canInteract = !empty && !loading;

  // Hovered particle data for tooltip
  const hoveredParticleData = hoveredParticleId !== null ? particles.find(p => p.id === hoveredParticleId) : null;

  // ==========================================================
  // Render
  // ==========================================================
  return (
    <Card title="因果模型 · Agent 流动"
      subtitle={loading ? '计算中...' : empty ? '暂无数据' : `${agents.length} 个智能体 · 4 个生命阶段`}>
      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <button onClick={handlePlayPause} disabled={!canInteract}
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px', fontSize: '0.75rem', fontFamily: 'var(--font-sans)', backgroundColor: 'var(--color-ink)', color: '#FFF', border: 'none', borderRadius: 'var(--radius-sm)', cursor: canInteract ? 'pointer' : 'not-allowed', opacity: canInteract ? 1 : 0.5 }}>
          {playing ? <Pause size={14} weight="bold" /> : <Play size={14} weight="bold" />}{btnLabel}
        </button>
        <button onClick={reset} disabled={!canInteract}
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px', fontSize: '0.75rem', fontFamily: 'var(--font-sans)', backgroundColor: 'transparent', color: 'var(--color-ink-secondary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', cursor: canInteract ? 'pointer' : 'not-allowed', opacity: canInteract ? 1 : 0.5 }}>
          <ArrowCounterClockwise size={14} weight="bold" />重置
        </button>
        {[0, 1, 2, 3, 4].map(s => (
          <div key={s} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: s <= wave ? 'var(--color-accent)' : 'var(--color-border)' }} />
        ))}
        <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: '0.7rem', color: 'var(--color-ink-secondary)', minWidth: 60, textAlign: 'right' }}>
          {wave === 0 && !playing ? '就绪' : wave >= 4 && !playing ? '完成' : `波 ${wave}/4`}
        </span>
      </div>

      {/* Canvas */}
      <div ref={svgWrapperRef}
        style={{ width: '100%', height: CANVAS_H, backgroundColor: 'var(--color-canvas)', borderRadius: 'var(--radius-md)', overflow: 'hidden', position: 'relative', border: '1px solid var(--color-border)', cursor: dragRef.current.active ? 'grabbing' : 'grab' }}
        onMouseDown={handleMouseDown}>
        {loading ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontFamily: "'Geist Mono', monospace", color: 'var(--color-ink-secondary)', fontSize: '0.85rem' }}>加载中...</span></div>
        ) : error ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ color: 'var(--color-error-text)', fontSize: '0.85rem' }}>{error}</span></div>
        ) : empty ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ color: 'var(--color-ink-secondary)', fontSize: '0.85rem' }}>运行模拟以查看因果模型与 Agent 流动</span></div>
        ) : (
          <svg width="100%" height="100%" viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`} style={{ display: 'block' }} preserveAspectRatio="xMidYMid meet"
            onMouseMove={handleSvgMouseMove} onMouseLeave={handleSvgMouseLeave}>
            <g transform={`translate(${zoomRef.current.x},${zoomRef.current.y}) scale(${zoomRef.current.k})`}>
              {/* ── Combined grid (top) ── */}
              <g data-node="grid">
                <rect x={GRID_X} y={GRID_Y} width={GRID_W} height={GRID_H} rx={10}
                  fill="var(--color-surface)" stroke="var(--color-border)" strokeWidth={1.2} />
                {/* Divider */}
                <line x1={GRID_DIV} y1={GRID_Y + 8} x2={GRID_DIV} y2={GRID_BOT - 8} stroke="var(--color-border)" strokeWidth={0.8} />

                {/* Race (left half) */}
                <circle cx={GRID_X + 140} cy={GRID_Y + 28} r={7} fill={COLORS.majority.text} />
                <text x={GRID_X + 156} y={GRID_Y + 33} fill="var(--color-ink)" fontFamily="var(--font-sans)" fontSize="14" fontWeight="bold">种族</text>
                <text x={GRID_X + 156} y={GRID_Y + 50} fill="var(--color-ink-secondary)" fontFamily="'Geist Mono', monospace" fontSize="9.5">群体身份 (0=少数 / 1=多数)</text>
                {/* Ability (right half) */}
                <circle cx={GRID_DIV + 40} cy={GRID_Y + 28} r={7} fill={COLORS.ability.text} />
                <text x={GRID_DIV + 56} y={GRID_Y + 33} fill="var(--color-ink)" fontFamily="var(--font-sans)" fontSize="14" fontWeight="bold">能力</text>
                <text x={GRID_DIV + 56} y={GRID_Y + 50} fill="var(--color-ink-secondary)" fontFamily="'Geist Mono', monospace" fontSize="9.5">先天认知水平 (标准化 z-score)</text>

              </g>

              {/* ── Nodes ── */}
              {NODES.map(n => {
                const stats = nodeStats.get(n.key); const enhanced = isNodeEnhanced(n.key);
                return (
                  <g key={n.key} transform={`translate(${n.x},${n.y})`} data-node={n.key}>
                    <rect width={n.w} height={n.h} rx={8} fill="var(--color-surface)"
                      stroke={enhanced ? 'var(--color-accent)' : 'var(--color-border)'}
                      strokeWidth={enhanced ? 2.5 : 1.2} />
                    <YAxis nodeW={n.w} nodeH={n.h} />
                    <text x={n.w / 2} y={24} textAnchor="middle" fill="var(--color-ink)" fontFamily="var(--font-sans)" fontSize="15" fontWeight="bold">{n.label}</text>
                    <text x={n.w / 2} y={43} textAnchor="middle" fill="var(--color-ink-secondary)" fontFamily="'Geist Mono', monospace" fontSize="11">{n.sub}</text>
                    {stats && <>
                      <line x1={15} y1={54} x2={n.w - 15} y2={54} stroke="var(--color-border)" strokeWidth="0.5" />
                      <text x={n.w / 2} y={68} textAnchor="middle" fill="var(--color-ink-secondary)" fontFamily="'Geist Mono', monospace" fontSize="10">多数均值: {stats.majM.toFixed(2)}  少数均值: {stats.minM.toFixed(2)}</text>
                      <text x={n.w / 2} y={82} textAnchor="middle" fill={stats.gap >= 0 ? 'var(--color-majority-text)' : 'var(--color-minority-text)'}
                        fontFamily="'Geist Mono', monospace" fontSize="10" fontWeight="bold">种族差距: {stats.gap >= 0 ? '+' : ''}{stats.gap.toFixed(3)}</text>
                      {/* Structural equation */}
                      <line x1={20} y1={90} x2={n.w - 20} y2={90} stroke="var(--color-border)" strokeWidth={0.3} strokeDasharray="2,3" />
                      <text x={n.w / 2} y={103} textAnchor="middle" fill="var(--color-ink-secondary)" fontFamily="'Geist Sans', sans-serif" fontSize="8" opacity={0.7}>结构方程</text>
                      <StageFormula stageKey={n.key} x={n.w / 2} y={115} lineH={13} />
                    </>}
                  </g>
                );
              })}

              {/* ── Grid bezier edges (after nodes so hover works) ── */}
              {GRID_EDGES.map(ge => {
                const ekey = `grid-${ge.tgt}`;
                const enhanced = isEdgeEnhanced(ekey) || !!ge.betas.find(b => b.key === highlightedParam);
                const d = gridBezier(ge);
                const lp = gridLabelPos(ge);
                return (
                  <g key={ekey} data-edge={ekey}>
                    <path d={d} fill="none" stroke="transparent" strokeWidth={14} style={{ cursor: 'pointer' }} />
                    <path d={d} fill="none" stroke={enhanced ? 'var(--color-accent)' : '#A0A0A0'}
                      strokeWidth={enhanced ? 2.5 : 1.2} />
                    <GridEdgeLabel ge={ge} params={params} x={lp.x} y={lp.y} enhanced={enhanced} />
                  </g>
                );
              })}

              {/* ── Main axis edges (after nodes so hover works) ── */}
              {MAIN_EDGES.map(e => {
                const ekey = `${e.src}-${e.tgt}`;
                const enhanced = isEdgeEnhanced(ekey);
                const d = mainEdgePath(e);
                const lp = mainLabelPos(e);
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
              })}

              {/* ── Particles (rendered by React at wave boundaries, tweened by rAF between) ── */}
              <g ref={circlesGRef}>
                {circlePositions.map((p, i) => {
                  const isSel = p.id === selectedAgentId;
                  const isHov = p.id === hoveredParticleId;
                  const color = p.race === 1 ? COLORS.majority.text : COLORS.minority.text;
                  const op = getParticleOpacity(p);
                  const radius = isSel ? p.r + 3 : isHov ? p.r + 2.5 : p.r;
                  return (
                    <circle key={`${p.id}-${i}`} cx={p.x} cy={p.y} r={radius}
                      data-agent-id={p.id} data-stage-idx={p.stageIdx}
                      fill={isSel || isHov ? '#FFF' : color}
                      stroke={isSel || isHov ? color : 'none'}
                      strokeWidth={isSel || isHov ? 2 : 0}
                      opacity={op}
                      style={{ cursor: 'pointer' }}
                      onClick={() => onSelectAgent(p.id)} />
                  );
                })}
              </g>

              {/* ── Legend ── */}
              <g transform={`translate(12, ${CANVAS_H - 16})`}>
                <line x1={0} y1={0} x2={18} y2={0} stroke="#A8A8A6" strokeWidth={3.5} />
                <text x={24} y={4} fill="var(--color-ink-secondary)" fontFamily="var(--font-sans)" fontSize="10">主轴</text>
                <line x1={70} y1={0} x2={88} y2={0} stroke="#B0B0AE" strokeWidth={1.2} />
                <text x={94} y={4} fill="var(--color-ink-secondary)" fontFamily="var(--font-sans)" fontSize="10">β系数</text>
                <line x1={158} y1={0} x2={176} y2={0} stroke="#D8D8D6" strokeWidth={0.6} strokeDasharray="5,5" />
                <text x={182} y={4} fill="var(--color-ink-secondary)" fontFamily="var(--font-sans)" fontSize="10">零β</text>
                <circle cx={230} cy={0} r={4} fill={COLORS.majority.text} />
                <text x={238} y={4} fill="var(--color-ink-secondary)" fontFamily="var(--font-sans)" fontSize="10">多数</text>
                <circle cx={282} cy={0} r={4} fill={COLORS.minority.text} />
                <text x={290} y={4} fill="var(--color-ink-secondary)" fontFamily="var(--font-sans)" fontSize="10">少数</text>
              </g>
            </g>

            {/* Tooltip (screen-fixed, outside zoom) */}
            {hoveredParticleData && (
              <g transform={`translate(${CANVAS_W - 205}, 14)`}>
                <rect width={192} height={62} rx={6} fill="var(--color-surface)" stroke="var(--color-accent)" strokeWidth={1.5} filter="url(#ts)" />
                <text x={10} y={20} fill="var(--color-ink)" fontFamily="var(--font-sans)" fontSize="12" fontWeight="bold">Agent #{hoveredParticleData.id}</text>
                <text x={10} y={37} fill="var(--color-ink-secondary)" fontFamily="'Geist Mono', monospace" fontSize="9.5">收入: {hoveredParticleData.income.toFixed(2)}  社区: {hoveredParticleData.nhood.toFixed(2)}</text>
                <text x={10} y={52} fill="var(--color-ink-secondary)" fontFamily="'Geist Mono', monospace" fontSize="9.5">学校: {hoveredParticleData.school.toFixed(2)}  收入: {hoveredParticleData.earnings.toFixed(2)}</text>
              </g>
            )}
            <defs>
              <filter id="ts" x="-5%" y="-5%" width="115%" height="130%">
                <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#00000020" />
              </filter>
            </defs>
          </svg>
        )}

        {/* Zoom controls overlay */}
        {!empty && !loading && !error && (
          <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', alignItems: 'center', gap: 3, backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', padding: '3px 6px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <button onClick={() => { zoomRef.current.k = Math.max(0.25, zoomRef.current.k / 1.2); setRedraw(t => t + 1); }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, border: 'none', borderRadius: 4, backgroundColor: 'transparent', cursor: 'pointer', color: 'var(--color-ink-secondary)' }} title="缩小"><Minus size={13} weight="bold" /></button>
            <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: '0.65rem', color: 'var(--color-ink-secondary)', minWidth: 36, textAlign: 'center', userSelect: 'none' }}>{Math.round(zoomRef.current.k * 100)}%</span>
            <button onClick={() => { zoomRef.current.k = Math.min(5, zoomRef.current.k * 1.2); setRedraw(t => t + 1); }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, border: 'none', borderRadius: 4, backgroundColor: 'transparent', cursor: 'pointer', color: 'var(--color-ink-secondary)' }} title="放大"><Plus size={13} weight="bold" /></button>
            <button onClick={() => { zoomRef.current = { x: 0, y: 0, k: 1 }; setRedraw(t => t + 1); }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, border: 'none', borderRadius: 4, backgroundColor: 'transparent', cursor: 'pointer', color: 'var(--color-ink-secondary)', marginLeft: 2 }} title="重置视图"><CornersOut size={12} weight="bold" /></button>
          </div>
        )}
      </div>
    </Card>
  );
}

export default AcademicFlowView;
