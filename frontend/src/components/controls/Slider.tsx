import { useRef, useCallback } from 'react';

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  formatValue?: (v: number) => string;
  accentColor?: string;
  disabled?: boolean;
  onHover?: (hovered: boolean) => void;
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  formatValue,
  accentColor = '#1F6C9F',
  disabled = false,
  onHover,
}: SliderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const progress = ((value - min) / (max - min)) * 100;

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(parseFloat(e.target.value));
    },
    [onChange]
  );

  const displayValue = formatValue ? formatValue(value) : value.toFixed(3);

  return (
    <div className="flex flex-col gap-1.5 py-1.5"
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}>
      <div className="flex justify-between items-baseline">
        <label
          className="text-xs text-text-secondary"
          style={{
            fontFamily: "'Geist Sans', sans-serif",
            fontSize: '0.675rem',
            letterSpacing: '0.03em',
          }}
        >
          {label}
        </label>
        <span
          className="text-xs font-medium text-text-primary tabular-nums"
          style={{ fontFamily: "'Geist Mono', monospace", fontSize: '0.675rem' }}
        >
          {displayValue}
        </span>
      </div>
      <div className="relative w-full h-6 flex items-center">
        {/* Track background */}
        <div
          className="absolute w-full rounded-full"
          style={{
            height: 4,
            backgroundColor: 'var(--color-border)',
          }}
        />
        {/* Track filled */}
        <div
          className="absolute rounded-full"
          style={{
            height: 4,
            width: `${progress}%`,
            backgroundColor: disabled ? 'var(--color-border)' : accentColor,
            transition: 'width 100ms ease-out',
          }}
        />
        {/* Input */}
        <input
          ref={inputRef}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={handleChange}
          disabled={disabled}
          className="absolute w-full h-full opacity-0 cursor-pointer"
          style={{ zIndex: 1 }}
        />
        {/* Custom thumb */}
        <div
          className="absolute w-4 h-4 rounded-full bg-surface border transition-shadow duration-200"
          style={{
            left: `calc(${progress}% - 8px)`,
            border: '2px solid ' + (disabled ? 'var(--color-border)' : accentColor),
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
            transition: 'left 100ms ease-out',
            pointerEvents: 'none',
          }}
        />
      </div>
    </div>
  );
}
