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
      <nav
        className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 border-b bg-surface/90 backdrop-blur-sm"
        style={{
          height: 'var(--nav-height)',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        {/* Left: Title + connection status */}
        <div className="flex items-center gap-3">
          <List size={18} weight="bold" style={{ color: 'var(--color-ink-secondary)' }} />
          <h1
            className="text-base font-normal m-0"
            style={{
              fontFamily: 'var(--font-serif)',
              letterSpacing: '-0.02em',
              color: 'var(--color-ink)',
            }}
          >
            社会模拟: 不平等均衡
          </h1>
          <span
            className="text-xs"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.65rem',
              color: 'var(--color-ink-secondary)',
            }}
          >
            Mijs & Usmani (2024)
          </span>

          {/* Connection status dot */}
          <div className="flex items-center gap-1.5 ml-2">
            <span
              className={`status-dot ${connected ? 'connected' : 'disconnected'}`}
              title={connected ? '已连接' : '未连接'}
            />
            <span
              className="text-xs"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.55rem',
                color: connected ? '#3D9E5C' : '#C73E3A',
              }}
            >
              {connected ? '已连接' : '未连接'}
            </span>
          </div>
        </div>

        {/* Center: Scenario presets */}
        <div className="flex items-center gap-2">
          <span
            className="text-xs mr-1"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '0.65rem',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color: 'var(--color-ink-secondary)',
            }}
          >
            场景预设
          </span>
          {scenarios.map((s) => (
            <button
              key={s.name}
              onClick={() => onSelectScenario(s.name)}
              disabled={loading}
              className="px-3 py-1 text-xs transition-colors duration-200"
              style={{
                backgroundColor: selectedScenario === s.name ? 'var(--color-ink)' : 'transparent',
                color: selectedScenario === s.name ? '#FFFFFF' : 'var(--color-ink-secondary)',
                border: selectedScenario === s.name
                  ? '1px solid var(--color-ink)'
                  : '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
                fontFamily: 'var(--font-sans)',
                fontSize: '0.675rem',
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
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-all duration-200"
              style={{
                backgroundColor: 'transparent',
                color: 'var(--color-error-text)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
                fontFamily: 'var(--font-sans)',
                cursor: 'pointer',
              }}
            >
              <Stop size={12} weight="bold" />
              取消
            </button>
          )}
          <button
            onClick={onRun}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-1.5 text-sm font-medium transition-all duration-200"
            style={{
              backgroundColor: loading ? 'var(--color-border)' : 'var(--color-ink)',
              color: loading ? 'var(--color-ink-secondary)' : '#FFFFFF',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              fontFamily: 'var(--font-sans)',
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
            onMouseEnter={(e) => {
              if (!loading) (e.target as HTMLElement).style.backgroundColor = '#333333';
            }}
            onMouseLeave={(e) => {
              if (!loading) (e.target as HTMLElement).style.backgroundColor = 'var(--color-ink)';
            }}
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
          <div className="w-full" style={{ height: 2, backgroundColor: 'var(--color-border)' }}>
            {progress ? (
              <div
                className="h-full"
                style={{
                  width: `${progress.pct}%`,
                  backgroundColor: 'var(--color-accent)',
                  transition: 'width 500ms cubic-bezier(0.16, 1, 0.3, 1)',
                }}
              />
            ) : (
              <div className="h-full skeleton-shimmer" style={{ width: '30%' }} />
            )}
          </div>
          {/* Phase label */}
          <div
            style={{
              padding: '4px 16px',
              fontSize: '0.625rem',
              fontFamily: 'var(--font-mono)',
              color: 'var(--color-ink-secondary)',
              backgroundColor: 'var(--color-canvas)',
              borderBottom: '1px solid var(--color-border)',
            }}
          >
            {progress ? `${progress.phase} (${Math.round(progress.pct)}%)` : '正在初始化模拟...'}
          </div>
        </div>
      )}
    </>
  );
}
