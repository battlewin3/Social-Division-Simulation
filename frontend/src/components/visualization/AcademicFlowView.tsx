import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import type { AgentData, SimulationParams } from '../../types/simulation';
import { COLORS } from '../../lib/constants';
import { Card } from '../shared/Card';
import { FlowNode, NODE_TOP_PAD, NODE_BOT_PAD } from './FlowCanvas/FlowNode';
import { GridFlowEdge, MainFlowEdge } from './FlowCanvas/FlowEdge';
import { FlowParticles } from './FlowCanvas/FlowParticles';
import { FlowGrid } from './FlowCanvas/FlowGrid';
import { FlowControls } from './FlowCanvas/FlowControls';
import type { NodeSpec, EdgeSpec, GridEdge, Particle, CirclePos } from './FlowCanvas/types';

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

// ============================================================
// Data definitions
// ============================================================
const NODES: NodeSpec[] = [
  { key: 'income',   label: '继承阶层', sub: 'income',   x: STAGE_X[0], y: MAIN_TOP, w: STAGE_W, h: STAGE_H, cx: STAGE_CX[0], cy: MAIN_CY },
  { key: 'nhood',    label: '社区质量', sub: 'nhood',    x: STAGE_X[1], y: MAIN_TOP, w: STAGE_W, h: STAGE_H, cx: STAGE_CX[1], cy: MAIN_CY },
  { key: 'school',   label: '学校质量', sub: 'school',   x: STAGE_X[2], y: MAIN_TOP, w: STAGE_W, h: STAGE_H, cx: STAGE_CX[2], cy: MAIN_CY },
  { key: 'earnings', label: '劳动收入', sub: 'earnings', x: STAGE_X[3], y: MAIN_TOP, w: STAGE_W, h: STAGE_H, cx: STAGE_CX[3], cy: MAIN_CY },
];

const MAIN_EDGES: EdgeSpec[] = [
  { src: 'income', tgt: 'nhood',    betaKey: 'beta_income_nhood',    defVal: 1.0, style: 'main' },
  { src: 'nhood', tgt: 'school',    betaKey: 'beta_nhood_school',    defVal: 1.0, style: 'main' },
  { src: 'school', tgt: 'earnings', betaKey: 'beta_school_earnings', defVal: 1.0, style: 'main' },
];

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
// Particle helpers
// ============================================================
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

  // Animation state
  const [wave, setWave] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [, setRedraw] = useState(0);
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

  // ---- rAF tick ----
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

  // ---- Pan (drag only, no scroll-wheel zoom) ----
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
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

  // ---- Zoom callbacks ----
  const zoomIn = useCallback(() => {
    zoomRef.current.k = Math.min(5, zoomRef.current.k * 1.2);
    setRedraw(t => t + 1);
  }, []);
  const zoomOut = useCallback(() => {
    zoomRef.current.k = Math.max(0.25, zoomRef.current.k / 1.2);
    setRedraw(t => t + 1);
  }, []);
  const zoomReset = useCallback(() => {
    zoomRef.current = { x: 0, y: 0, k: 1 };
    setRedraw(t => t + 1);
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
    const parent = t.closest?.('[data-node]') as SVGElement | null;
    if (parent) { setHoveredNode(parent.dataset.node!); setHoveredEdge(null); setHoveredParticleId(null); return; }
    const edgeParent = t.closest?.('[data-edge]') as SVGElement | null;
    if (edgeParent) { setHoveredEdge(edgeParent.dataset.edge!); setHoveredNode(null); setHoveredParticleId(null); return; }
    setHoveredNode(null); setHoveredEdge(null); setHoveredParticleId(null); setHoveredParticleStage(null);
  }, []);

  const handleSvgMouseLeave = useCallback(() => {
    setHoveredNode(null); setHoveredEdge(null); setHoveredParticleId(null); setHoveredParticleStage(null);
  }, []);

  // ---- Hover helpers ----
  const isNodeEnhanced = (key: string) => {
    if (hoveredNode === key) return true;
    if (hoveredParticleId !== null && hoveredParticleStage !== null) {
      return STAGES.indexOf(key) === hoveredParticleStage;
    }
    return false;
  };
  const isEdgeEnhanced = (ekey: string) => hoveredEdge === ekey;

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
  const canInteract = !empty && !loading;

  const hoveredParticleData = hoveredParticleId !== null ? particles.find(p => p.id === hoveredParticleId) : null;

  // ==========================================================
  // Render
  // ==========================================================
  return (
    <Card title="因果模型 · Agent 流动"
      subtitle={loading ? '计算中...' : empty ? '暂无数据' : `${agents.length} 个智能体 · 4 个生命阶段`}>
      {/* Playback + Zoom controls (combined bar) */}
      <FlowControls
        playing={playing} wave={wave} canInteract={canInteract}
        onPlayPause={handlePlayPause} onReset={reset}
        zoomK={zoomRef.current.k}
        onZoomIn={zoomIn} onZoomOut={zoomOut} onZoomReset={zoomReset}
      />

      {/* Canvas */}
      <div ref={svgWrapperRef}
        className="w-full bg-canvas rounded-md overflow-hidden relative border border-border"
        style={{ height: CANVAS_H, cursor: dragRef.current.active ? 'grabbing' : 'grab' }}
        onMouseDown={handleMouseDown}>
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <span className="text-ink-secondary text-[0.85rem]" style={{ fontFamily: "'Geist Mono', monospace" }}>加载中...</span>
          </div>
        ) : error ? (
          <div className="h-full flex items-center justify-center">
            <span className="text-error-text text-[0.85rem]">{error}</span>
          </div>
        ) : empty ? (
          <div className="h-full flex items-center justify-center">
            <span className="text-ink-secondary text-[0.85rem]">运行模拟以查看因果模型与 Agent 流动</span>
          </div>
        ) : (
          <svg width="100%" height="100%" viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`} className="block" preserveAspectRatio="xMidYMid meet"
            onMouseMove={handleSvgMouseMove} onMouseLeave={handleSvgMouseLeave}>
            <g transform={`translate(${zoomRef.current.x},${zoomRef.current.y}) scale(${zoomRef.current.k})`}>

              {/* ── Combined grid (top) ── */}
              <FlowGrid />

              {/* ── Nodes ── */}
              {NODES.map(n => (
                <FlowNode key={n.key} node={n}
                  stats={nodeStats.get(n.key)}
                  enhanced={isNodeEnhanced(n.key)} />
              ))}

              {/* ── Grid bezier edges ── */}
              {GRID_EDGES.map(ge => {
                const ekey = `grid-${ge.tgt}`;
                return (
                  <GridFlowEdge key={ekey} ge={ge} nodeMap={nodeMap}
                    params={params} enhanced={isEdgeEnhanced(ekey)}
                    highlightedParam={highlightedParam} />
                );
              })}

              {/* ── Main axis edges ── */}
              {MAIN_EDGES.map(e => {
                const ekey = `${e.src}-${e.tgt}`;
                return (
                  <MainFlowEdge key={ekey} edge={e} nodeMap={nodeMap}
                    enhanced={isEdgeEnhanced(ekey)} />
                );
              })}

              {/* ── Particles ── */}
              <g ref={circlesGRef}>
                <FlowParticles positions={circlePositions}
                  selectedAgentId={selectedAgentId}
                  hoveredParticleId={hoveredParticleId}
                  onSelectAgent={onSelectAgent} />
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
      </div>
    </Card>
  );
}

export default AcademicFlowView;
