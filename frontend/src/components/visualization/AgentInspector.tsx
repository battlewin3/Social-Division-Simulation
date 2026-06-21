import { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import { Badge } from '../shared/Badge';
import { COLORS } from '../../lib/constants';
import { fmtNum, fmtPercent, stageName } from '../../lib/formatters';
import type { AgentData, GodsEyeStats } from '../../types/simulation';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AgentInspectorProps {
  agents: AgentData[];
  selectedAgentId: number | null;
  godsEye: GodsEyeStats | null;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}

interface LifeStageEntry {
  key: string;
  label: string;
  value: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DRAWER_HEIGHT = 220;
const NAV_BAR_HEIGHT = 32;

const TRANSITION_MS = 350;

const CANVAS_SIZE = 180;
const EGO_RADIUS = CANVAS_SIZE * 0.48;
const NEIGHBOR_MAX_RADIUS = CANVAS_SIZE * 0.42;

// ---------------------------------------------------------------------------
// Simple force layout for ego network (runs synchronously, small N)
// ---------------------------------------------------------------------------

interface ForceNode {
  id: number;
  race: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

function simpleForceLayout(
  neighbors: AgentData[],
  cx: number,
  cy: number,
  maxR: number,
): { x: number; y: number }[] {
  const nodes: ForceNode[] = neighbors.map((nb, i) => {
    const angle = (2 * Math.PI * i) / neighbors.length;
    const r = maxR * 0.5;
    return {
      id: nb.agent_id,
      race: nb.race,
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
      vx: 0,
      vy: 0,
    };
  });

  if (nodes.length < 2) return nodes.map((n) => ({ x: n.x, y: n.y }));

  // Run ~80 iterations of simple force simulation
  for (let iter = 0; iter < 80; iter++) {
    const alpha = 1 - iter / 80;

    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];

      // Repulsion from ego (center)
      let dx = a.x - cx;
      let dy = a.y - cy;
      const distEgo = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const forceEgo = (30 / (distEgo * distEgo)) * alpha;
      a.vx += (dx / distEgo) * forceEgo;
      a.vy += (dy / distEgo) * forceEgo;

      // Constrain to max radius
      if (distEgo > maxR) {
        a.x = cx + (dx / distEgo) * maxR;
        a.y = cy + (dy / distEgo) * maxR;
      }
      if (distEgo < 8) {
        a.x = cx + (dx / distEgo) * 8;
        a.y = cy + (dy / distEgo) * 8;
      }

      // Repulsion between neighbors
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        dx = a.x - b.x;
        dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const force = (15 / (dist * dist)) * alpha;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }
    }

    // Apply velocities with damping
    for (const n of nodes) {
      n.vx *= 0.4;
      n.vy *= 0.4;
      n.x += n.vx;
      n.y += n.vy;

      // Keep within max radius
      const dx = n.x - cx;
      const dy = n.y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > maxR) {
        n.x = cx + (dx / dist) * maxR;
        n.y = cy + (dy / dist) * maxR;
      }
    }
  }

  return nodes.map((n) => ({ x: n.x, y: n.y }));
}

// ---------------------------------------------------------------------------
// Ego-network canvas renderer
// ---------------------------------------------------------------------------

function drawEgoNetwork(
  ctx: CanvasRenderingContext2D,
  egoRace: number,
  neighbors: AgentData[],
): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const cx = w / 2;
  const cy = h / 2;

  ctx.clearRect(0, 0, w, h);

  // Compute force layout
  const positions = simpleForceLayout(neighbors, cx, cy, NEIGHBOR_MAX_RADIUS);

  // Faint boundary circle
  ctx.beginPath();
  ctx.arc(cx, cy, EGO_RADIUS, 0, Math.PI * 2);
  ctx.strokeStyle = COLORS.gridLine;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Ego dot (center)
  const egoColor = egoRace === 1 ? COLORS.majority.stroke : COLORS.minority.stroke;
  ctx.beginPath();
  ctx.arc(cx, cy, 6, 0, Math.PI * 2);
  ctx.fillStyle = egoColor;
  ctx.fill();
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Neighbor dots
  if (neighbors.length === 0) return;

  neighbors.forEach((nb, i) => {
    const pos = positions[i];
    if (!pos) return;
    const nx = pos.x;
    const ny = pos.y;
    const dotColor = nb.race === 1 ? COLORS.majority.stroke : COLORS.minority.stroke;

    // Edge line from ego
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(nx, ny);
    ctx.strokeStyle = COLORS.gridLine;
    ctx.lineWidth = 0.4;
    ctx.stroke();

    // Neighbor dot
    ctx.beginPath();
    ctx.arc(nx, ny, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = dotColor;
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 0.8;
    ctx.stroke();
  });
}

// ---------------------------------------------------------------------------
// AgentInspector Component
// ---------------------------------------------------------------------------

export function AgentInspector({
  agents,
  selectedAgentId,
  godsEye,
  onClose,
  onPrev,
  onNext,
}: AgentInspectorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [searchText, setSearchText] = useState('');

  // ---- Derive selected agent ----
  const selectedAgent = useMemo(() => {
    if (selectedAgentId === null) return null;
    return agents.find((a) => a.agent_id === selectedAgentId) ?? null;
  }, [agents, selectedAgentId]);

  // ---- Derive neighbor agent data ----
  const neighborAgents = useMemo(() => {
    if (!selectedAgent) return [];
    const nSet = new Set(selectedAgent.neighbors);
    return agents.filter((a) => nSet.has(a.agent_id));
  }, [agents, selectedAgent]);

  // ---- Neighbor demographics ----
  const neighborDemographics = useMemo(() => {
    const n = neighborAgents.length;
    if (n === 0) return { nMajority: 0, nMinority: 0, avgEarnings: null as number | null };
    const nMajority = neighborAgents.filter((a) => a.race === 1).length;
    const nMinority = n - nMajority;
    const avgEarnings = neighborAgents.reduce((s, a) => s + a.earnings, 0) / n;
    return { nMajority, nMinority, avgEarnings };
  }, [neighborAgents]);

  // ---- Life-stage entries for left column ----
  const lifeStageEntries: LifeStageEntry[] = useMemo(() => {
    if (!selectedAgent) return [];
    return [
      { key: 'income', label: stageName('income'), value: selectedAgent.income },
      { key: 'nhood', label: stageName('nhood'), value: selectedAgent.nhood_proper },
      { key: 'school', label: stageName('school'), value: selectedAgent.school_proper },
      { key: 'earnings', label: stageName('earnings'), value: selectedAgent.earnings },
    ];
  }, [selectedAgent]);

  // ---- Draw ego-network on canvas ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !selectedAgent) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = CANVAS_SIZE * dpr;
    canvas.height = CANVAS_SIZE * dpr;
    canvas.style.width = `${CANVAS_SIZE}px`;
    canvas.style.height = `${CANVAS_SIZE}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    drawEgoNetwork(ctx, selectedAgent.race, neighborAgents);
  }, [selectedAgent, neighborAgents]);

  // ---- Determine visibility ----
  const isOpen = selectedAgentId !== null;

  // ---- Keyboard navigation ----
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        onPrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        onNext();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onPrev, onNext, onClose]);

  // ---- Search handler ----
  const handleSearch = useCallback(() => {
    const id = parseInt(searchText, 10);
    if (!isNaN(id) && id >= 0 && id < agents.length) {
      const found = agents.find((a) => a.agent_id === id);
      if (found) {
        // Navigate by simulating clicks until we reach the target
        // Since we can't directly set selectedAgentId, use a workaround
        const currentIdx = agents.findIndex((a) => a.agent_id === selectedAgentId);
        const targetIdx = agents.findIndex((a) => a.agent_id === id);
        if (targetIdx >= 0) {
          // Jump directly by calling onNext/onPrev in a loop via an effect
          setSearchText('');
          // Use the first agent's selection to trigger navigation
          const diff = targetIdx - (currentIdx >= 0 ? currentIdx : 0);
          if (diff > 0) {
            for (let i = 0; i < diff; i++) onNext();
          } else if (diff < 0) {
            for (let i = 0; i < Math.abs(diff); i++) onPrev();
          }
        }
      }
    }
  }, [searchText, agents, selectedAgentId, onNext, onPrev]);

  // ---- Bias helpers ----
  function biasArrow(perceived: number | null, trueVal: number | null): string {
    if (perceived === null || trueVal === null) return '';
    const diff = perceived - trueVal;
    if (Math.abs(diff) < 0.001) return '→';
    return diff > 0 ? '▲' : '▼';
  }

  function biasColor(perceived: number | null, trueVal: number | null): string {
    if (perceived === null || trueVal === null) return COLORS.textSecondary;
    const diff = perceived - trueVal;
    if (Math.abs(diff) < 0.001) return COLORS.neutral;
    return COLORS.bias.text;
  }

  function fmtSigned(n: number | null | undefined): string {
    if (n === null || n === undefined) return '--';
    const sign = n >= 0 ? '+' : '';
    return sign + n.toFixed(3);
  }

  // ===========================================================================
  // Render
  // ===========================================================================

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[1000] flex flex-col font-sans"
      style={{
        height: `${DRAWER_HEIGHT}px`,
        transform: isOpen ? 'translateY(0)' : 'translateY(100%)',
        transition: `transform ${TRANSITION_MS}ms cubic-bezier(0.16, 1, 0.3, 1)`,
        background: COLORS.surface,
        borderTop: `1px solid ${COLORS.border}`,
        boxShadow: isOpen
          ? '0 -4px 24px rgba(0,0,0,0.08)'
          : 'none',
        pointerEvents: isOpen ? 'auto' : 'none',
      }}
    >
      {/* Navigation Header */}
      <div
        className="flex items-center justify-between px-3 gap-3 shrink-0"
        style={{ height: `${NAV_BAR_HEIGHT}px`, borderBottom: `1px solid ${COLORS.gridLine}` }}
      >
        {/* Left: prev / next / agent label */}
        <div className="flex items-center gap-2">
          <button
            onClick={onPrev}
            disabled={!isOpen || agents.length <= 1}
            className="flex items-center justify-center w-6 h-[22px] text-[0.7rem] border border-neutral rounded-[3px] bg-surface text-text-primary cursor-pointer"
            style={{ opacity: isOpen && agents.length > 1 ? 1 : 0.3 }}
            aria-label="上一个智能体"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M6 2L3 5L6 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>

          <span className="text-[0.7rem] text-text-primary font-medium min-w-[70px] text-center">
            {selectedAgent ? `智能体 ${selectedAgent.agent_id}` : '未选择'}
          </span>

          <button
            onClick={onNext}
            disabled={!isOpen || agents.length <= 1}
            className="flex items-center justify-center w-6 h-[22px] text-[0.7rem] border border-neutral rounded-[3px] bg-surface text-text-primary cursor-pointer"
            style={{ opacity: isOpen && agents.length > 1 ? 1 : 0.3 }}
            aria-label="下一个智能体"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M4 2L7 5L4 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </div>

        {/* Agent index indicator */}
        {selectedAgent && (
          <span className="text-[0.6rem] text-text-secondary">
            {(() => {
              const idx = agents.findIndex((a) => a.agent_id === selectedAgent.agent_id);
              return idx >= 0 ? `${idx + 1} / ${agents.length}` : '';
            })()}
          </span>
        )}

        {/* Search jump */}
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
            placeholder="跳转到ID..."
            className="input-mono"
            style={{
              width: 70,
              height: 22,
              fontSize: '0.625rem',
              outline: 'none',
            }}
          />
          <button
            onClick={handleSearch}
            className="border border-neutral rounded-[3px] bg-surface text-text-primary text-[0.625rem] h-[22px] cursor-pointer px-1.5"
          >
            跳转
          </button>
        </div>

        {/* Close */}
        <button
          onClick={onClose}
          className="flex items-center justify-center w-6 h-[22px] text-[0.8rem] border border-neutral rounded-[3px] bg-surface text-text-primary cursor-pointer"
          onMouseEnter={(e) => { e.currentTarget.style.background = COLORS.bias.bg; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = COLORS.surface; }}
          aria-label="关闭面板"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
        </button>
      </div>

      {/* Three-Column Body */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left Column: Agent Attributes */}
        <div
          className="flex-1 basis-1/3 flex flex-col gap-1.5 p-2.5 overflow-auto"
          style={{ borderRight: `1px solid ${COLORS.gridLine}` }}
        >
          {selectedAgent ? (
            <>
              <div className="flex items-center gap-2">
                <span className="text-[0.85rem] font-semibold text-text-primary font-mono">ID {selectedAgent.agent_id}</span>
                <Badge variant={selectedAgent.race === 1 ? 'blue' : 'amber'}>{selectedAgent.race_label}</Badge>
              </div>
              <div
                className="flex items-center gap-1.5 px-2 py-1 rounded"
                style={{ background: COLORS.ability.bg }}
              >
                <span className="text-[0.625rem] text-text-secondary uppercase tracking-[0.06em]">{stageName('ability')}</span>
                <span className="text-[0.8rem] font-semibold font-mono" style={{ color: COLORS.ability.text }}>{fmtNum(selectedAgent.ability)}</span>
              </div>
              <div className="flex flex-col gap-[3px] mt-0.5">
                {lifeStageEntries.map((entry) => (
                  <div key={entry.key} className="flex justify-between items-center py-0.5">
                    <span className="text-[0.625rem] text-text-secondary">{entry.label}</span>
                    <span className="text-[0.7rem] font-medium text-text-primary font-mono">{fmtNum(entry.value)}</span>
                  </div>
                ))}
              </div>
              <div style={{ borderTop: `1px solid ${COLORS.gridLine}`, margin: '2px 0' }} />
              <div className="text-[0.625rem] text-text-secondary flex justify-between">
                <span>邻居数</span>
                <span className="font-medium text-text-primary">{selectedAgent.neighbor_count}</span>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-[0.7rem] text-text-secondary">
              点击智能体查看详情
            </div>
          )}
        </div>

        {/* Middle Column: Ego-Network */}
        <div
          className="flex-1 basis-1/3 flex flex-col gap-1.5 p-2.5 items-center overflow-auto"
          style={{ borderRight: `1px solid ${COLORS.gridLine}` }}
        >
          {selectedAgent ? (
            <>
              <div className="flex gap-3 justify-center text-[0.625rem] text-text-secondary font-mono">
                <div className="text-center">
                  <span className="block text-[0.55rem] uppercase tracking-[0.05em]">多数群体</span>
                  <span className="font-semibold text-[0.75rem]" style={{ color: COLORS.majority.text }}>{neighborDemographics.nMajority}</span>
                </div>
                <div className="text-center">
                  <span className="block text-[0.55rem] uppercase tracking-[0.05em]">少数群体</span>
                  <span className="font-semibold text-[0.75rem]" style={{ color: COLORS.minority.text }}>{neighborDemographics.nMinority}</span>
                </div>
                <div className="text-center">
                  <span className="block text-[0.55rem] uppercase tracking-[0.05em]">平均收入</span>
                  <span className="font-semibold text-[0.75rem] text-text-primary">{neighborDemographics.avgEarnings !== null ? fmtNum(neighborDemographics.avgEarnings, 2) : '--'}</span>
                </div>
              </div>
              <div className="text-[0.625rem] text-text-secondary">
                {neighborAgents.length > 0
                  ? `${fmtPercent(neighborDemographics.nMajority / neighborAgents.length, 0)} 多数 / ${fmtPercent(neighborDemographics.nMinority / neighborAgents.length, 0)} 少数`
                  : '无邻居'}
              </div>
              <canvas
                ref={canvasRef}
                className="shrink-0 rounded"
                style={{ border: `1px solid ${COLORS.gridLine}` }}
              />
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-[0.7rem] text-text-secondary">
              点击智能体查看网络
            </div>
          )}
        </div>

        {/* Right Column: Perception vs Truth */}
        <div className="flex-1 basis-1/3 flex flex-col gap-0 p-2.5 overflow-auto">
          {selectedAgent ? (
            <>
              <div className="text-[0.625rem] text-text-secondary uppercase tracking-[0.06em] mb-2 font-medium">
                个体感知 vs 客观真相
              </div>
              <table className="w-full border-collapse text-[0.625rem] font-mono">
                <thead>
                  <tr style={{ borderBottom: `1px solid ${COLORS.gridLine}` }}>
                    <th className="text-left font-medium text-text-secondary py-[2px] pr-0.5 whitespace-nowrap">指标</th>
                    <th className="text-right font-medium text-text-secondary py-[2px] px-0.5 whitespace-nowrap">感知</th>
                    <th className="text-right font-medium text-text-secondary py-[2px] px-0.5 whitespace-nowrap">真相</th>
                    <th className="text-center font-medium text-text-secondary py-[2px] pl-0.5 w-5"></th>
                  </tr>
                </thead>
                <tbody>
                  {/* Gini */}
                  <tr>
                    <td className="py-1 pr-0.5 text-text-secondary whitespace-nowrap">基尼系数</td>
                    <td className="text-right py-1 px-0.5 text-text-primary font-medium">
                      {selectedAgent.perceived_gini != null ? fmtNum(selectedAgent.perceived_gini) : '--'}
                    </td>
                    <td className="text-right py-1 px-0.5 text-text-primary font-medium">
                      {godsEye ? fmtNum(godsEye.gini) : '--'}
                    </td>
                    <td className="text-center py-1 pl-0.5 text-[0.75rem]" style={{ color: biasColor(selectedAgent.perceived_gini ?? null, godsEye?.gini ?? null) }}>
                      {biasArrow(selectedAgent.perceived_gini ?? null, godsEye?.gini ?? null)}
                    </td>
                  </tr>
                  {/* Race Gap */}
                  <tr>
                    <td className="py-1 pr-0.5 text-text-secondary whitespace-nowrap">种族差距</td>
                    <td className="text-right py-1 px-0.5 text-text-primary font-medium">
                      {selectedAgent.perceived_race_gap != null ? fmtNum(selectedAgent.perceived_race_gap) : '--'}
                    </td>
                    <td className="text-right py-1 px-0.5 text-text-primary font-medium">
                      {godsEye ? fmtNum(godsEye.race_gap) : '--'}
                    </td>
                    <td className="text-center py-1 pl-0.5 text-[0.75rem]" style={{ color: biasColor(selectedAgent.perceived_race_gap ?? null, godsEye?.race_gap ?? null) }}>
                      {biasArrow(selectedAgent.perceived_race_gap ?? null, godsEye?.race_gap ?? null)}
                    </td>
                  </tr>
                  {/* Ability Beta */}
                  <tr>
                    <td className="py-1 pr-0.5 text-text-secondary whitespace-nowrap">能力系数</td>
                    <td className="text-right py-1 px-0.5 text-text-primary font-medium">
                      {selectedAgent.perceived_betas && selectedAgent.perceived_betas.length >= 2 ? fmtSigned(selectedAgent.perceived_betas[1]) : '--'}
                    </td>
                    <td className="text-right py-1 px-0.5 text-text-primary font-medium">
                      {godsEye?.ols_full.beta_ability != null ? fmtSigned(godsEye.ols_full.beta_ability) : '--'}
                    </td>
                    <td className="text-center py-1 pl-0.5 text-[0.75rem]" style={{ color: biasColor(
                      (selectedAgent.perceived_betas && selectedAgent.perceived_betas.length >= 2 ? selectedAgent.perceived_betas[1] : null),
                      godsEye?.ols_full.beta_ability ?? null
                    ) }}>
                      {biasArrow(
                        selectedAgent.perceived_betas && selectedAgent.perceived_betas.length >= 2 ? selectedAgent.perceived_betas[1] : null,
                        godsEye?.ols_full.beta_ability ?? null
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
              {selectedAgent.perceived_r_squared != null && (
                <div
                  className="mt-auto text-[0.55rem] text-text-secondary pt-1"
                  style={{ borderTop: `1px solid ${COLORS.gridLine}` }}
                >
                  感知 R&sup2; = {fmtNum(selectedAgent.perceived_r_squared, 4)} | 真相 R&sup2; = {godsEye ? fmtNum(godsEye.ols_full.r_squared, 4) : '--'}
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-[0.7rem] text-text-secondary">
              点击智能体查看感知对比
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AgentInspector;
