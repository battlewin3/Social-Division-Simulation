import { COLORS } from '../../../lib/constants';

// Layout constants (mirror AcademicFlowView layout)
const GRID_X = 80, GRID_Y = 16, GRID_W = 1040, GRID_H = 84;
const GRID_BOT = GRID_Y + GRID_H; // 100
const GRID_DIV = GRID_X + GRID_W / 2; // 600

export function FlowGrid() {
  return (
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
  );
}
