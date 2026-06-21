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
        <label className="font-sans text-[0.675rem] tracking-[0.03em] text-text-secondary">
          {label}
        </label>
        <span className="font-mono text-[0.675rem] font-medium text-text-primary tabular-nums">
          {displayValue}
        </span>
      </div>
      <div className="relative w-full h-6 flex items-center">
        {/* Track background */}
        <div className="absolute w-full h-1 rounded-full bg-border" />
        {/* Track filled */}
        <div
          className="absolute h-1 rounded-full"
          style={{
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
          className="absolute w-full h-full opacity-0 cursor-pointer z-[1]"
        />
        {/* Custom thumb */}
        <div
          className="absolute w-4 h-4 rounded-full bg-surface border-2 border-solid shadow-surface pointer-events-none"
          style={{
            left: `calc(${progress}% - 8px)`,
            borderColor: disabled ? 'var(--color-border)' : accentColor,
            transition: 'left 100ms ease-out',
          }}
        />
      </div>
    </div>
  );
}
