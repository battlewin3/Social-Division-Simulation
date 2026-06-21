import type { SimulationResult } from '../../types/simulation';

interface StatusBarProps {
  connected: boolean;
  loading: boolean;
  hasRun: boolean;
  cachedMessage: string | null;
  result: SimulationResult | null;
}

export function StatusBar({ connected, loading, hasRun, cachedMessage, result }: StatusBarProps) {
  return (
    <div className="status-bar mb-4">
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
        <span className="text-success-text">
          {cachedMessage}
        </span>
      )}
      {result && (
        <>
          <span>智能体: {result.meta.n_agents}</span>
          <span>边: {result.meta.n_edges}</span>
          <span>耗时: {result.meta.runtime_ms.toFixed(0)}ms</span>
          <span className="text-accent-text">
            场景: {result.meta.scenario_label}
          </span>
        </>
      )}
    </div>
  );
}
