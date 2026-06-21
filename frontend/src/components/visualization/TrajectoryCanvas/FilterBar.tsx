import { COLORS } from '../../../lib/constants';
import type { FilterMode, BrushState } from './types';
import { AXIS_LABELS } from './types';

// ---------------------------------------------------------------------------
// FilterBar — filter toggle buttons + brush indicator
// ---------------------------------------------------------------------------

interface FilterBarProps {
  filterMode: FilterMode;
  onChange: (mode: FilterMode) => void;
  brush: BrushState | null;
  onClearBrush: () => void;
}

function FilterButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      type="button"
      className="font-sans text-[0.7rem] px-3 py-1 rounded-md border cursor-pointer transition-all duration-150 whitespace-nowrap"
      style={{
        fontWeight: active ? 600 : 400,
        borderColor: active ? COLORS.textPrimary : COLORS.border,
        backgroundColor: active ? COLORS.textPrimary : COLORS.surface,
        color: active ? COLORS.surface : COLORS.textSecondary,
      }}
    >
      {label}
    </button>
  );
}

export function FilterBar({
  filterMode,
  onChange,
  brush,
  onClearBrush,
}: FilterBarProps) {
  return (
    <div className="flex gap-1.5 mb-3 flex-wrap">
      <FilterButton
        label="全部"
        active={filterMode === 'all'}
        onClick={() => onChange('all')}
      />
      <FilterButton
        label="仅多数"
        active={filterMode === 'majority'}
        onClick={() => onChange('majority')}
      />
      <FilterButton
        label="仅少数"
        active={filterMode === 'minority'}
        onClick={() => onChange('minority')}
      />
      <FilterButton
        label="仅选中"
        active={filterMode === 'selected'}
        onClick={() => onChange('selected')}
      />
      {brush !== null && (
        <span className="font-sans text-[0.65rem] text-text-secondary px-2 py-1 flex items-center gap-1">
          <span
            className="inline-block w-1.5 h-1.5 rounded-full opacity-40"
            style={{ backgroundColor: COLORS.textPrimary }}
          />
          刷选: {AXIS_LABELS[brush.axisIndex]} [{brush.y0.toFixed(1)},{' '}
          {brush.y1.toFixed(1)}]
          <button
            onClick={onClearBrush}
            type="button"
            className="font-mono text-[0.6rem] border-none bg-transparent text-text-secondary cursor-pointer p-0 ml-1"
          >
            ✕
          </button>
        </span>
      )}
    </div>
  );
}
