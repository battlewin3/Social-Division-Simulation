import { ParameterGroup } from './ParameterGroup';
import { Slider } from './Slider';
import type { SimulationParams, ParameterConstraint, NetworkStage } from '../../types/simulation';

interface ControlPanelProps {
  params: SimulationParams;
  constraints: Record<string, ParameterConstraint>;
  onChange: (key: string, value: number | string) => void;
  disabled: boolean;
  onParamHover?: (key: string | null) => void;
  networkStage: string;
  onChangeNetworkStage: (stage: string) => void;
}

export function ControlPanel({ params, constraints, onChange, disabled, onParamHover, networkStage, onChangeNetworkStage }: ControlPanelProps) {
  const renderSlider = (key: keyof SimulationParams, accentColor?: string) => {
    const constraint = constraints[key as string];
    if (!constraint) return null;
    return (
      <Slider
        key={key}
        label={constraint.label}
        value={params[key] as number}
        min={constraint.min}
        max={constraint.max}
        step={constraint.step}
        onChange={(v) => onChange(key as string, v)}
        onHover={(hovered) => onParamHover?.(hovered ? (key as string) : null)}
        accentColor={accentColor}
        disabled={disabled}
      />
    );
  };

  return (
    <div className="p-5">
      {/* Header */}
      <div className="mb-6 pb-4" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <h2
          className="text-sm font-normal m-0 mb-1 text-text-primary"
          style={{ fontFamily: "'Newsreader', serif", letterSpacing: '-0.02em' }}
        >
          参数控制
        </h2>
        <p className="text-xs text-text-secondary m-0" style={{ fontSize: '0.65rem' }}>
          调节参数观察微观变化如何影响宏观结果
        </p>
      </div>

      {/* Discrimination coefficients */}
      <ParameterGroup title="种族歧视系数" defaultOpen={true}>
        {renderSlider('beta_race_income', '#9F2F2D')}
        {renderSlider('beta_race_nhood', '#9F2F2D')}
        {renderSlider('beta_race_school', '#9F2F2D')}
        {renderSlider('beta_race_earnings', '#9F2F2D')}
      </ParameterGroup>

      {/* Class / ability effects */}
      <ParameterGroup title="阶层与能力效应" defaultOpen={false}>
        {renderSlider('beta_income_nhood', '#346538')}
        {renderSlider('beta_ability_nhood', '#346538')}
        {renderSlider('beta_ability_school', '#346538')}
        {renderSlider('beta_ability_earnings', '#346538')}
        {renderSlider('beta_nhood_school', '#346538')}
        {renderSlider('beta_school_earnings', '#346538')}
        {renderSlider('beta_income_school', '#346538')}
        {renderSlider('beta_income_earnings', '#346538')}
        {renderSlider('beta_nhood_earnings', '#346538')}
      </ParameterGroup>

      {/* Network parameters */}
      <ParameterGroup title="网络参数" defaultOpen={false}>
        <div style={{ marginBottom: 12 }}>
          <label
            style={{
              display: 'block',
              fontSize: '0.7rem',
              fontFamily: 'var(--font-sans)',
              color: 'var(--color-ink-secondary)',
              marginBottom: 4,
            }}
          >
            网络形成基础
          </label>
          <select
            value={networkStage}
            onChange={(e) => onChangeNetworkStage(e.target.value)}
            disabled={disabled}
            style={{
              width: '100%',
              padding: '6px 8px',
              fontSize: '0.72rem',
              fontFamily: 'var(--font-sans)',
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-ink)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              outline: 'none',
              opacity: disabled ? 0.5 : 1,
            }}
          >
            <option value="random">随机网络</option>
            <option value="nhood">社区网络</option>
            <option value="school">学校网络</option>
            <option value="earnings">收入网络</option>
          </select>
        </div>
        {renderSlider('net_size', '#1F6C9F')}
        {renderSlider('friend_size', '#1F6C9F')}
      </ParameterGroup>

      {/* Population */}
      <ParameterGroup title="智能体总体" defaultOpen={false}>
        {renderSlider('n_agents', '#787774')}
        {renderSlider('race_dist', '#787774')}
        {renderSlider('luck_sd', '#787774')}
      </ParameterGroup>
    </div>
  );
}
