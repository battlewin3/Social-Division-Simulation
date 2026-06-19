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
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: `${DRAWER_HEIGHT}px`,
        zIndex: 1000,
        transform: isOpen ? 'translateY(0)' : 'translateY(100%)',
        transition: `transform ${TRANSITION_MS}ms cubic-bezier(0.16, 1, 0.3, 1)`,
        background: COLORS.surface,
        borderTop: `1px solid ${COLORS.border}`,
        boxShadow: isOpen
          ? '0 -4px 24px rgba(0,0,0,0.08)'
          : 'none',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "'Geist Sans', sans-serif",
        pointerEvents: isOpen ? 'auto' : 'none',
      }}
    >
      {/* Navigation Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: `${NAV_BAR_HEIGHT}px`,
          padding: '0 12px',
          borderBottom: `1px solid ${COLORS.gridLine}`,
          flexShrink: 0,
          gap: 12,
        }}
      >
        {/* Left: prev / next / agent label */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={onPrev} disabled={!isOpen || agents.length <= 1}
            style={{ border: `1px solid ${COLORS.neutral}`, borderRadius: 3, background: COLORS.surface, color: COLORS.textPrimary, fontSize: '0.7rem', width: 24, height: 22, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: isOpen && agents.length > 1 ? 1 : 0.3 }}
            aria-label="上一个智能体">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M6 2L3 5L6 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>

          <span style={{ fontSize: '0.7rem', color: COLORS.textPrimary, fontWeight: 500, minWidth: 70, textAlign: 'center' }}>
            {selectedAgent ? `智能体 ${selectedAgent.agent_id}` : '未选择'}
          </span>

          <button onClick={onNext} disabled={!isOpen || agents.length <= 1}
            style={{ border: `1px solid ${COLORS.neutral}`, borderRadius: 3, background: COLORS.surface, color: COLORS.textPrimary, fontSize: '0.7rem', width: 24, height: 22, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: isOpen && agents.length > 1 ? 1 : 0.3 }}
            aria-label="下一个智能体">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M4 2L7 5L4 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </div>

        {/* Agent index indicator */}
        {selectedAgent && (
          <span style={{ fontSize: '0.6rem', color: COLORS.textSecondary }}>
            {(() => {
              const idx = agents.findIndex((a) => a.agent_id === selectedAgent.agent_id);
              return idx >= 0 ? `${idx + 1} / ${agents.length}` : '';
            })()}
          </span>
        )}

        {/* Search jump */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
            placeholder="跳转到ID..."
            style={{
              width: 70,
              height: 22,
              fontSize: '0.6rem',
              fontFamily: "'Geist Mono', monospace",
              border: `1px solid ${COLORS.border}`,
              borderRadius: 3,
              padding: '0 4px',
              outline: 'none',
              color: COLORS.textPrimary,
              backgroundColor: COLORS.surface,
            }}
          />
          <button onClick={handleSearch}
            style={{ border: `1px solid ${COLORS.neutral}`, borderRadius: 3, background: COLORS.surface, color: COLORS.textPrimary, fontSize: '0.6rem', height: 22, cursor: 'pointer', padding: '0 6px' }}>
            跳转
          </button>
        </div>

        {/* Close */}
        <button onClick={onClose}
          style={{ border: `1px solid ${COLORS.neutral}`, borderRadius: 3, background: COLORS.surface, color: COLORS.textPrimary, fontSize: '0.8rem', width: 24, height: 22, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = COLORS.bias.bg; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = COLORS.surface; }}
          aria-label="关闭面板">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
        </button>
      </div>

      {/* Three-Column Body */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {/* Left Column: Agent Attributes */}
        <div style={{ flex: '1 1 33.33%', borderRight: `1px solid ${COLORS.gridLine}`, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6, overflow: 'auto' }}>
          {selectedAgent ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: COLORS.textPrimary, fontFamily: "'Geist Mono', monospace" }}>ID {selectedAgent.agent_id}</span>
                <Badge variant={selectedAgent.race === 1 ? 'blue' : 'amber'}>{selectedAgent.race_label}</Badge>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', background: COLORS.ability.bg, borderRadius: 4 }}>
                <span style={{ fontSize: '0.6rem', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{stageName('ability')}</span>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: COLORS.ability.text, fontFamily: "'Geist Mono', monospace" }}>{fmtNum(selectedAgent.ability)}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 2 }}>
                {lifeStageEntries.map((entry) => (
                  <div key={entry.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 0' }}>
                    <span style={{ fontSize: '0.63rem', color: COLORS.textSecondary }}>{entry.label}</span>
                    <span style={{ fontSize: '0.7rem', fontWeight: 500, color: COLORS.textPrimary, fontFamily: "'Geist Mono', monospace" }}>{fmtNum(entry.value)}</span>
                  </div>
                ))}
              </div>
              <div style={{ borderTop: `1px solid ${COLORS.gridLine}`, margin: '2px 0' }} />
              <div style={{ fontSize: '0.6rem', color: COLORS.textSecondary, display: 'flex', justifyContent: 'space-between' }}>
                <span>邻居数</span>
                <span style={{ fontWeight: 500, color: COLORS.textPrimary }}>{selectedAgent.neighbor_count}</span>
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: '0.7rem', color: COLORS.textSecondary }}>
              点击智能体查看详情
            </div>
          )}
        </div>

        {/* Middle Column: Ego-Network */}
        <div style={{ flex: '1 1 33.33%', borderRight: `1px solid ${COLORS.gridLine}`, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center', overflow: 'auto' }}>
          {selectedAgent ? (
            <>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', fontSize: '0.6rem', color: COLORS.textSecondary, fontFamily: "'Geist Mono', monospace" }}>
                <div style={{ textAlign: 'center' }}>
                  <span style={{ display: 'block', fontSize: '0.55rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>多数群体</span>
                  <span style={{ fontWeight: 600, color: COLORS.majority.text, fontSize: '0.75rem' }}>{neighborDemographics.nMajority}</span>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <span style={{ display: 'block', fontSize: '0.55rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>少数群体</span>
                  <span style={{ fontWeight: 600, color: COLORS.minority.text, fontSize: '0.75rem' }}>{neighborDemographics.nMinority}</span>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <span style={{ display: 'block', fontSize: '0.55rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>平均收入</span>
                  <span style={{ fontWeight: 600, color: COLORS.textPrimary, fontSize: '0.75rem' }}>{neighborDemographics.avgEarnings !== null ? fmtNum(neighborDemographics.avgEarnings, 2) : '--'}</span>
                </div>
              </div>
              <div style={{ fontSize: '0.6rem', color: COLORS.textSecondary }}>
                {neighborAgents.length > 0
                  ? `${fmtPercent(neighborDemographics.nMajority / neighborAgents.length, 0)} 多数 / ${fmtPercent(neighborDemographics.nMinority / neighborAgents.length, 0)} 少数`
                  : '无邻居'}
              </div>
              <canvas ref={canvasRef} style={{ border: `1px solid ${COLORS.gridLine}`, borderRadius: 4, flexShrink: 0 }} />
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: '0.7rem', color: COLORS.textSecondary }}>
              点击智能体查看网络
            </div>
          )}
        </div>

        {/* Right Column: Perception vs Truth */}
        <div style={{ flex: '1 1 33.33%', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 0, overflow: 'auto' }}>
          {selectedAgent ? (
            <>
              <div style={{ fontSize: '0.6rem', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, fontWeight: 500 }}>
                个体感知 vs 客观真相
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.6rem', fontFamily: "'Geist Mono', monospace" }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${COLORS.gridLine}` }}>
                    <th style={{ textAlign: 'left', fontWeight: 500, color: COLORS.textSecondary, padding: '2px 2px 4px 0', whiteSpace: 'nowrap' }}>指标</th>
                    <th style={{ textAlign: 'right', fontWeight: 500, color: COLORS.textSecondary, padding: '2px 2px 4px 2px', whiteSpace: 'nowrap' }}>感知</th>
                    <th style={{ textAlign: 'right', fontWeight: 500, color: COLORS.textSecondary, padding: '2px 2px 4px 2px', whiteSpace: 'nowrap' }}>真相</th>
                    <th style={{ textAlign: 'center', fontWeight: 500, color: COLORS.textSecondary, padding: '2px 0 4px 2px', width: 20 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {/* Gini */}
                  <tr>
                    <td style={{ padding: '4px 2px 4px 0', color: COLORS.textSecondary, whiteSpace: 'nowrap' }}>基尼系数</td>
                    <td style={{ textAlign: 'right', padding: '4px 2px', color: COLORS.textPrimary, fontWeight: 500 }}>
                      {selectedAgent.perceived_gini != null ? fmtNum(selectedAgent.perceived_gini) : '--'}
                    </td>
                    <td style={{ textAlign: 'right', padding: '4px 2px', color: COLORS.textPrimary, fontWeight: 500 }}>
                      {godsEye ? fmtNum(godsEye.gini) : '--'}
                    </td>
                    <td style={{ textAlign: 'center', padding: '4px 0 4px 2px', color: biasColor(selectedAgent.perceived_gini ?? null, godsEye?.gini ?? null), fontSize: '0.75rem' }}>
                      {biasArrow(selectedAgent.perceived_gini ?? null, godsEye?.gini ?? null)}
                    </td>
                  </tr>
                  {/* Race Gap */}
                  <tr>
                    <td style={{ padding: '4px 2px 4px 0', color: COLORS.textSecondary, whiteSpace: 'nowrap' }}>种族差距</td>
                    <td style={{ textAlign: 'right', padding: '4px 2px', color: COLORS.textPrimary, fontWeight: 500 }}>
                      {selectedAgent.perceived_race_gap != null ? fmtNum(selectedAgent.perceived_race_gap) : '--'}
                    </td>
                    <td style={{ textAlign: 'right', padding: '4px 2px', color: COLORS.textPrimary, fontWeight: 500 }}>
                      {godsEye ? fmtNum(godsEye.race_gap) : '--'}
                    </td>
                    <td style={{ textAlign: 'center', padding: '4px 0 4px 2px', color: biasColor(selectedAgent.perceived_race_gap ?? null, godsEye?.race_gap ?? null), fontSize: '0.75rem' }}>
                      {biasArrow(selectedAgent.perceived_race_gap ?? null, godsEye?.race_gap ?? null)}
                    </td>
                  </tr>
                  {/* Ability Beta */}
                  <tr>
                    <td style={{ padding: '4px 2px 4px 0', color: COLORS.textSecondary, whiteSpace: 'nowrap' }}>能力系数</td>
                    <td style={{ textAlign: 'right', padding: '4px 2px', color: COLORS.textPrimary, fontWeight: 500 }}>
                      {selectedAgent.perceived_betas && selectedAgent.perceived_betas.length >= 2 ? fmtSigned(selectedAgent.perceived_betas[1]) : '--'}
                    </td>
                    <td style={{ textAlign: 'right', padding: '4px 2px', color: COLORS.textPrimary, fontWeight: 500 }}>
                      {godsEye?.ols_full.beta_ability != null ? fmtSigned(godsEye.ols_full.beta_ability) : '--'}
                    </td>
                    <td style={{ textAlign: 'center', padding: '4px 0 4px 2px', color: biasColor(
                      (selectedAgent.perceived_betas && selectedAgent.perceived_betas.length >= 2 ? selectedAgent.perceived_betas[1] : null),
                      godsEye?.ols_full.beta_ability ?? null
                    ), fontSize: '0.75rem' }}>
                      {biasArrow(
                        selectedAgent.perceived_betas && selectedAgent.perceived_betas.length >= 2 ? selectedAgent.perceived_betas[1] : null,
                        godsEye?.ols_full.beta_ability ?? null
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
              {selectedAgent.perceived_r_squared != null && (
                <div style={{ marginTop: 'auto', fontSize: '0.55rem', color: COLORS.textSecondary, padding: '4px 0 0 0', borderTop: `1px solid ${COLORS.gridLine}` }}>
                  感知 R&sup2; = {fmtNum(selectedAgent.perceived_r_squared, 4)} | 真相 R&sup2; = {godsEye ? fmtNum(godsEye.ols_full.r_squared, 4) : '--'}
                </div>
              )}
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: '0.7rem', color: COLORS.textSecondary }}>
              点击智能体查看感知对比
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AgentInspector;
