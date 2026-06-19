import { useState, useCallback, useEffect, useRef } from 'react';
import { NavBar } from './components/layout/NavBar';
import { MainLayout } from './components/layout/MainLayout';
import { ControlPanel } from './components/controls/ControlPanel';
import { AcademicFlowView } from './components/visualization/AcademicFlowView';
import { HierarchicalNetworkView } from './components/visualization/HierarchicalNetworkView';
import { StatsView } from './components/visualization/StatsView';
import { SensitivityView } from './components/visualization/SensitivityView';
import { TrajectoryView } from './components/visualization/TrajectoryView';
import { AgentInspector } from './components/visualization/AgentInspector';
import { useSimulation } from './hooks/useSimulation';
import type { SimulationParams } from './types/simulation';
import { Warning, ArrowCounterClockwise, CaretDown, CaretRight } from '@phosphor-icons/react';

const DEFAULT_PARAMS: SimulationParams = {
  n_agents: 1000,
  race_dist: 0.36,
  seed: 42,
  beta_race_income: 0.75,
  beta_race_nhood: 0.075,
  beta_race_school: 0.075,
  beta_race_earnings: 0.075,
  beta_income_nhood: 1.0,
  beta_ability_nhood: 0.0,
  beta_income_school: 0.0,
  beta_ability_school: 0.3,
  beta_nhood_school: 1.0,
  beta_income_earnings: 0.0,
  beta_ability_earnings: 0.3,
  beta_nhood_earnings: 0.0,
  beta_school_earnings: 1.0,
  network_formation: 'smallworld',
  network_stage: 'nhood',
  net_size: 100,
  friend_size: 0.8,
  luck_sd: 1.0,
  rescale: true,
};

function isConnectionError(error: string): boolean {
  return error.includes('未连接') || error.includes('重连');
}

function isTimeoutError(error: string): boolean {
  return error.includes('超时');
}

export function App() {
  const {
    connected,
    loading,
    result,
    sweepResult,
    scenarios,
    constraints,
    error,
    cachedMessage,
    progress,
    runSimulation,
    runSweep,
    cancelSimulation,
  } = useSimulation();

  const [params, setParams] = useState<SimulationParams>(DEFAULT_PARAMS);
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);
  const [hasRun, setHasRun] = useState(false);
  const [showTrajectory, setShowTrajectory] = useState(false);
  const [sweepRunning, setSweepRunning] = useState(false);
  const [highlightedParam, setHighlightedParam] = useState<string | null>(null);

  // Auto-expand when sweep result arrives
  const hadSweepResult = useRef(false);
  useEffect(() => {
    if (sweepResult && !hadSweepResult.current) {
      hadSweepResult.current = true;
      setShowTrajectory(true);
    }
    if (!sweepResult) hadSweepResult.current = false;
  }, [sweepResult]);

  // Handle sweep trigger
  const handleRunSweep = useCallback((paramKey: string) => {
    setSweepRunning(true);
    setShowTrajectory(true);
    runSweep(paramKey);
    // Reset sweepRunning when loading changes
  }, [runSweep]);

  // Reset sweepRunning when loading ends (sweep completes)
  useEffect(() => {
    if (!loading && sweepRunning) setSweepRunning(false);
  }, [loading, sweepRunning]);

  // Handle parameter change from sliders
  const handleParamChange = useCallback((key: string, value: number | string) => {
    setParams((prev) => ({ ...prev, [key]: value }));
    setSelectedScenario(null);
  }, []);

  // Handle scenario selection
  const handleScenarioSelect = useCallback((name: string) => {
    const scenario = scenarios.find((s) => s.name === name);
    if (!scenario) return;
    setSelectedScenario(name);
    const newParams = { ...params, ...scenario.params };
    setParams(newParams);
    runSimulation(newParams);
    setHasRun(true);
  }, [scenarios, params, runSimulation]);

  // Handle run button
  const handleRun = useCallback(() => {
    runSimulation(params);
    setHasRun(true);
  }, [params, runSimulation]);

  // Handle cancel
  const handleCancel = useCallback(() => {
    cancelSimulation();
  }, [cancelSimulation]);

  // Handle retry
  const handleRetry = useCallback(() => {
    runSimulation(params);
  }, [params, runSimulation]);

  // Handle agent selection
  const handleSelectAgent = useCallback((id: number) => {
    setSelectedAgentId(id >= 0 ? id : null);
  }, []);

  const handleCloseInspector = useCallback(() => {
    setSelectedAgentId(null);
  }, []);

  const handlePrevAgent = useCallback(() => {
    if (selectedAgentId === null || !result) return;
    const prev = selectedAgentId > 0 ? selectedAgentId - 1 : result.agents.length - 1;
    setSelectedAgentId(prev);
  }, [selectedAgentId, result]);

  const handleNextAgent = useCallback(() => {
    if (selectedAgentId === null || !result) return;
    const next = selectedAgentId < result.agents.length - 1 ? selectedAgentId + 1 : 0;
    setSelectedAgentId(next);
  }, [selectedAgentId, result]);

  // Sidebar content
  const sidebar = (
    <ControlPanel
      params={params}
      constraints={constraints}
      onChange={handleParamChange}
      disabled={loading}
      onParamHover={setHighlightedParam}
      networkStage={params.network_stage}
      onChangeNetworkStage={(stage) => handleParamChange('network_stage', stage)}
    />
  );

  return (
    <div className="min-h-screen bg-canvas">
      <NavBar
        scenarios={scenarios}
        selectedScenario={selectedScenario}
        onSelectScenario={handleScenarioSelect}
        onRun={handleRun}
        onCancel={handleCancel}
        loading={loading}
        connected={connected}
        progress={progress}
      />

      <MainLayout sidebar={sidebar}>
        {/* Status bar */}
        <div
          className="flex items-center gap-4 mb-4 text-xs flex-wrap"
          style={{
            fontFamily: "'Geist Mono', monospace",
            fontSize: '0.65rem',
            color: 'var(--color-ink-secondary)',
          }}
        >
          <span>
            状态:{' '}
            {!connected
              ? '未连接'
              : loading
                ? '模拟中...'
                : hasRun
                  ? '就绪'
                  : '等待运行'}
          </span>
          {cachedMessage && (
            <span style={{ color: 'var(--color-success-text)' }}>
              {cachedMessage}
            </span>
          )}
          {result && (
            <>
              <span>智能体: {result.meta.n_agents}</span>
              <span>边: {result.meta.n_edges}</span>
              <span>耗时: {result.meta.runtime_ms.toFixed(0)}ms</span>
              <span style={{ color: 'var(--color-accent-text)' }}>
                场景: {result.meta.scenario_label}
              </span>
            </>
          )}
        </div>

        {/* Error banner */}
        {error && (
          <div
            className="mb-4 px-4 py-3 rounded-md flex items-center gap-3 text-sm"
            style={{
              backgroundColor: isConnectionError(error)
                ? 'var(--color-warning-bg)'
                : 'var(--color-error-bg)',
              border: `1px solid ${
                isConnectionError(error)
                  ? 'var(--color-warning-text)'
                  : 'var(--color-error-text)'
              }`,
              color: 'var(--color-ink)',
            }}
          >
            <Warning
              size={18}
              weight="fill"
              color={
                isConnectionError(error)
                  ? 'var(--color-warning-text)'
                  : 'var(--color-error-text)'
              }
            />
            <span style={{ flex: 1 }}>{error}</span>
            {isConnectionError(error) ? (
              <button
                onClick={handleRetry}
                className="px-3 py-1 text-xs font-medium rounded-md transition-colors"
                style={{
                  backgroundColor: 'var(--color-ink)',
                  color: '#FFFFFF',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                重试
              </button>
            ) : isTimeoutError(error) ? (
              <button
                onClick={handleRetry}
                className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors"
                style={{
                  backgroundColor: 'var(--color-ink)',
                  color: '#FFFFFF',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <ArrowCounterClockwise size={12} weight="bold" />
                重试
              </button>
            ) : null}
          </div>
        )}

        {/* Progress bar */}
        {loading && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <span
                className="text-xs"
                style={{
                  fontFamily: "'Geist Mono', monospace",
                  fontSize: '0.625rem',
                  color: 'var(--color-ink-secondary)',
                }}
              >
                {progress ? progress.phase : '正在初始化...'}
              </span>
              <span
                className="text-xs"
                style={{
                  fontFamily: "'Geist Mono', monospace",
                  fontSize: '0.625rem',
                  color: 'var(--color-ink-secondary)',
                }}
              >
                {progress ? `${Math.round(progress.pct)}%` : '...'}
              </span>
            </div>
            <div
              className="w-full rounded-full overflow-hidden"
              style={{ height: 3, backgroundColor: 'var(--color-border)' }}
            >
              {progress ? (
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${progress.pct}%`,
                    backgroundColor: 'var(--color-accent)',
                    transition: 'width 500ms cubic-bezier(0.16, 1, 0.3, 1)',
                  }}
                />
              ) : (
                <div
                  className="h-full rounded-full skeleton-shimmer"
                  style={{ width: '30%' }}
                />
              )}
            </div>
          </div>
        )}

        {/* ── Main: ModelFlowView — full width, large canvas (~60% visual weight) ── */}
        <div className="mb-6">
          <AcademicFlowView
            agents={result?.agents ?? []}
            params={params}
            selectedAgentId={selectedAgentId}
            onSelectAgent={handleSelectAgent}
            loading={loading}
            error={error}
            highlightedParam={highlightedParam}
          />
        </div>

        {/* ── Lower: Hierarchical Network + Stats side by side ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
          <HierarchicalNetworkView
            network={result?.network ?? null}
            selectedAgentId={selectedAgentId}
            onSelectAgent={handleSelectAgent}
            loading={loading}
            error={error}
          />
          <StatsView
            godsEye={result?.gods_eye ?? null}
            perception={result?.perception ?? null}
            loading={loading}
            error={error}
          />
        </div>

        {/* ── Collapsible: Sensitivity ── */}
        <div className="mb-4">
          <button
            onClick={() => setShowTrajectory((v) => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', width: '100%',
              backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-card)', cursor: 'pointer', fontFamily: 'var(--font-sans)',
              fontSize: '0.75rem', color: 'var(--color-ink-secondary)', transition: 'background-color 150ms',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--color-canvas)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--color-surface)'; }}
          >
            {showTrajectory ? <CaretDown size={14} weight="bold" /> : <CaretRight size={14} weight="bold" />}
            敏感性分析与精确轨迹图
            <span style={{ fontSize: '0.6rem', fontFamily: "'Geist Mono', monospace", color: 'var(--color-ink-secondary)', marginLeft: 'auto' }}>
              {result ? '参数扫描 · 平行坐标' : '暂无数据'}
            </span>
          </button>
          {showTrajectory && (
            <div className="mt-4 space-y-4">
              <SensitivityView sweepResult={sweepResult} loading={loading} error={error} onRunSweep={handleRunSweep} sweepRunning={sweepRunning} />
              <TrajectoryView
                agents={result?.agents ?? []}
                selectedAgentId={selectedAgentId}
                onSelectAgent={handleSelectAgent}
                loading={loading}
                error={error}
              />
            </div>
          )}
        </div>

        {/* Agent inspector drawer */}
        <AgentInspector
          agents={result?.agents ?? []}
          selectedAgentId={selectedAgentId}
          godsEye={result?.gods_eye ?? null}
          onClose={handleCloseInspector}
          onPrev={handlePrevAgent}
          onNext={handleNextAgent}
        />
      </MainLayout>
    </div>
  );
}
