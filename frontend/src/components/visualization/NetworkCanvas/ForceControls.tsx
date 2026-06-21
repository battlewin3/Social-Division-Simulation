import { CaretDown, CaretRight } from '@phosphor-icons/react';
import type { ForceParams } from './types';
import { FORCE_LABELS, FORCE_RANGES } from './types';

// ============================================================
// ForceControls — collapsible force parameter tuning panel
// ============================================================

interface ForceControlsProps {
  show: boolean;
  forceParams: ForceParams;
  onChange: (key: keyof ForceParams, value: number) => void;
  onReset: () => void;
  isCommunityView: boolean;
}

export function ForceControls({
  show,
  forceParams,
  onChange,
  onReset,
  isCommunityView,
}: ForceControlsProps) {
  const toggleButton = (
    <button
      onClick={onReset} // placeholder: toggle is handled by parent via show prop
      className="btn-ghost flex items-center gap-1 px-2.5 py-1 text-[0.7rem] font-sans"
      style={{
        backgroundColor: show ? 'var(--color-canvas)' : 'transparent',
        color: 'var(--color-ink-secondary)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-sm)',
        cursor: 'pointer',
      }}
      type="button"
    >
      {show ? (
        <CaretDown size={10} weight="bold" />
      ) : (
        <CaretRight size={10} weight="bold" />
      )}
      力参数
    </button>
  );

  if (!show) return toggleButton;

  return (
    <>
      {toggleButton}
      <div
        className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-x-3 gap-y-2 p-2.5 mb-2 bg-canvas border border-border rounded-card"
      >
        {(Object.keys(FORCE_LABELS) as (keyof ForceParams)[]).map((key) => {
          const [min, max, step] = FORCE_RANGES[key];
          return (
            <div key={key} className="flex flex-col gap-0.5">
              <div className="flex justify-between items-baseline">
                <label className="text-[0.6rem] font-sans text-ink-secondary">
                  {FORCE_LABELS[key]}
                </label>
                <span className="text-[0.55rem] font-mono text-ink-secondary">
                  {forceParams[key].toFixed(
                    key === 'alphaDecay'
                      ? 4
                      : key === 'linkStrength' || key === 'centerStrength'
                        ? 2
                        : 0,
                  )}
                </span>
              </div>
              <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={forceParams[key]}
                onChange={(e) => onChange(key, parseFloat(e.target.value))}
                className="w-full h-1 cursor-pointer"
                style={{ accentColor: 'var(--color-accent)' }}
              />
            </div>
          );
        })}
        <div className="flex items-end justify-end">
          <button
            onClick={onReset}
            type="button"
            className="btn-ghost px-2 py-[3px] text-[0.6rem] font-sans text-accent border border-accent rounded-btn cursor-pointer whitespace-nowrap"
          >
            重置默认
          </button>
        </div>
      </div>
    </>
  );
}
