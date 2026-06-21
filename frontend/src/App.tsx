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
import { StatusBar } from './components/visualization/StatusBar';
import { ErrorBanner } from './components/visualization/ErrorBanner';
import { useSimulation } from './hooks/useSimulation';
import type { SimulationParams } from './types/simulation';
import { CaretDown, CaretRight } from '@phosphor-icons/react';

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
        <StatusBar
          connected={connected}
          loading={loading}
          hasRun={hasRun}
          cachedMessage={cachedMessage}
          result={result}
        />

        {/* Error banner */}
        {error && <ErrorBanner error={error} onRetry={handleRetry} />}

        {/* Progress bar */}
        {loading && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-mono text-[0.625rem] text-ink-secondary">
                {progress ? progress.phase : '正在初始化...'}
              </span>
              <span className="font-mono text-[0.625rem] text-ink-secondary">
                {progress ? `${Math.round(progress.pct)}%` : '...'}
              </span>
            </div>
            <div
              className="w-full rounded-full overflow-hidden bg-border"
              style={{ height: 3 }}
            >
              {progress ? (
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-500"
                  style={{
                    width: `${progress.pct}%`,
                    transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
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
            className="flex items-center gap-1.5 px-3 py-2 w-full bg-surface border border-border rounded-card cursor-pointer font-sans text-xs text-ink-secondary transition-colors duration-150"
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--color-canvas)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--color-surface)'; }}
          >
            {showTrajectory ? <CaretDown size={14} weight="bold" /> : <CaretRight size={14} weight="bold" />}
            敏感性分析与精确轨迹图
            <span className="font-mono text-[0.6rem] text-ink-secondary ml-auto">
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
