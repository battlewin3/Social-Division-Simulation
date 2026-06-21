import { NodeSpec } from './types';

// ============================================================
// Layout constants shared between node rendering and YAxis
// ============================================================
export const NODE_TOP_PAD = 132;
export const NODE_BOT_PAD = 8;

// ============================================================
// Stage structural equation — rendered inside each main node
// ============================================================
import type { FormulaTerm, FormulaLine } from './types';

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

// ============================================================
// YAxis — vertical percentile axis inside a node
// ============================================================
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
// FlowNode — renders a single stage node
// ============================================================
interface FlowNodeProps {
  node: NodeSpec;
  stats: { majM: number; minM: number; gap: number } | undefined;
  enhanced: boolean;
}

export function FlowNode({ node, stats, enhanced }: FlowNodeProps) {
  const n = node;
  return (
    <g transform={`translate(${n.x},${n.y})`} data-node={n.key}>
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
}
