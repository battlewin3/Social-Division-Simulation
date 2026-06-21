import { List, Play, Pause, Stop } from '@phosphor-icons/react';
import type { ScenarioPreset, SimulationProgress } from '../../types/simulation';

interface NavBarProps {
  scenarios: ScenarioPreset[];
  selectedScenario: string | null;
  onSelectScenario: (name: string) => void;
  onRun: () => void;
  onCancel: () => void;
  loading: boolean;
  connected: boolean;
  progress: SimulationProgress | null;
}

export function NavBar({ scenarios, selectedScenario, onSelectScenario, onRun, onCancel, loading, connected, progress }: NavBarProps) {
  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 border-b border-border bg-surface/90 backdrop-blur-sm h-nav">
        {/* Left: Title + connection status */}
        <div className="flex items-center gap-3">
          <List size={18} weight="bold" className="text-ink-secondary" />
          <h1 className="font-serif text-base font-normal m-0 tracking-[-0.02em] text-ink">
            社会模拟: 不平等均衡
          </h1>
          <span className="font-mono text-[0.65rem] text-ink-secondary">
            Mijs & Usmani (2024)
          </span>

          {/* Connection status dot */}
          <div className="flex items-center gap-1.5 ml-2">
            <span
              className={`status-dot ${connected ? 'connected' : 'disconnected'}`}
              title={connected ? '已连接' : '未连接'}
            />
            <span
              className="font-mono text-[0.55rem]"
              style={{ color: connected ? '#3D9E5C' : '#C73E3A' }}
            >
              {connected ? '已连接' : '未连接'}
            </span>
          </div>
        </div>

        {/* Center: Scenario presets */}
        <div className="flex items-center gap-2">
          <span className="font-sans text-[0.65rem] tracking-[0.05em] uppercase text-ink-secondary mr-1">
            场景预设
          </span>
          {scenarios.map((s) => (
            <button
              key={s.name}
              onClick={() => onSelectScenario(s.name)}
              disabled={loading}
              className="font-sans text-[0.675rem] px-3 py-1 rounded-btn transition-colors duration-200"
              style={{
                backgroundColor: selectedScenario === s.name ? 'var(--color-ink)' : 'transparent',
                color: selectedScenario === s.name ? '#FFFFFF' : 'var(--color-ink-secondary)',
                border: selectedScenario === s.name
                  ? '1px solid var(--color-ink)'
                  : '1px solid var(--color-border)',
                cursor: loading ? 'default' : 'pointer',
                opacity: loading ? 0.6 : 1,
              }}
              title={s.description}
            >
              {s.name}
            </button>
          ))}
        </div>

        {/* Right: Run / Cancel button */}
        <div className="flex items-center gap-2">
          {loading && (
            <button
              onClick={onCancel}
              className="btn-ghost font-medium px-3 py-1.5 text-error-text text-xs"
            >
              <Stop size={12} weight="bold" />
              取消
            </button>
          )}
          <button
            onClick={onRun}
            disabled={loading}
            className={
              loading
                ? 'flex items-center gap-2 px-4 py-1.5 text-sm font-medium bg-border text-ink-secondary border-none rounded-btn font-sans cursor-not-allowed transition-all duration-200'
                : 'btn-primary flex items-center gap-2 px-4 py-1.5 text-sm'
            }
          >
            {loading ? (
              <>
                <Pause size={14} weight="bold" />
                模拟中...
              </>
            ) : (
              <>
                <Play size={14} weight="bold" />
                运行模拟
              </>
            )}
          </button>
        </div>
      </nav>

      {/* Progress bar — attached below nav */}
      {loading && (
        <div
          className="fixed left-0 right-0 z-50"
          style={{ top: 'var(--nav-height)' }}
        >
          <div className="w-full h-0.5 bg-border">
            {progress ? (
              <div
                className="h-full bg-accent transition-[width] duration-500"
                style={{
                  width: `${progress.pct}%`,
                  transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
                }}
              />
            ) : (
              <div className="h-full skeleton-shimmer" style={{ width: '30%' }} />
            )}
          </div>
          {/* Phase label */}
          <div className="px-4 py-1 font-mono text-[0.625rem] text-ink-secondary bg-canvas border-b border-border">
            {progress ? `${progress.phase} (${Math.round(progress.pct)}%)` : '正在初始化模拟...'}
          </div>
        </div>
      )}
    </>
  );
}
