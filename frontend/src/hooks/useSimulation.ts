import { useState, useRef, useEffect, useCallback } from 'react';
import type { SimulationResult, SimulationParams, SweepResult, WSMessage, ScenarioPreset, ParameterConstraint, SimulationProgress, LogEntry } from '../types/simulation';
import { WS_URL } from '../lib/constants';

const SIMULATION_TIMEOUT_MS = 120_000;
const SWEEP_TIMEOUT_MS = 120_000;
const RECONNECT_DELAY_MS = 3_000;

interface SimulationState {
  connected: boolean;
  loading: boolean;
  result: SimulationResult | null;
  sweepResult: SweepResult | null;
  scenarios: ScenarioPreset[];
  constraints: Record<string, ParameterConstraint>;
  error: string | null;
  cachedMessage: string | null;
  progress: SimulationProgress | null;
  logs: LogEntry[];
}

export function useSimulation() {
  const [state, setState] = useState<SimulationState>({
    connected: false,
    loading: false,
    result: null,
    sweepResult: null,
    scenarios: [],
    constraints: {},
    error: null,
    cachedMessage: null,
    progress: null,
    logs: [],
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();
  const timeoutTimer = useRef<ReturnType<typeof setTimeout>>();
  const connectAttemptRef = useRef(0);

  const clearTimeoutSafe = (ref: ReturnType<typeof setTimeout> | undefined) => {
    if (ref) clearTimeout(ref);
  };

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    if (wsRef.current?.readyState === WebSocket.CONNECTING) return;

    connectAttemptRef.current += 1;
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      connectAttemptRef.current = 0;
      setState(s => ({ ...s, connected: true, error: null }));
      console.debug('[WS] Connected to backend');
    };

    ws.onmessage = (event) => {
      try {
        const raw = event.data;
        const msg: WSMessage = JSON.parse(raw);
        // Log every message type for debugging (check browser DevTools)
        if (msg.type !== 'log') {
          console.debug('[WS] ←', msg.type,
            msg.type === 'result' ? `(agents=${(msg as any).data?.meta?.n_agents})` :
            msg.type === 'progress' ? `(${(msg as any).phase} ${(msg as any).pct}%)` :
            msg.type === 'error' ? `(${(msg as any).message})` :
            '');
        }
        switch (msg.type) {
          case 'connected':
            setState(s => ({
              ...s,
              scenarios: msg.scenarios,
              constraints: msg.constraints,
            }));
            break;
          case 'result':
            clearTimeoutSafe(timeoutTimer.current);
            console.debug('[WS] Setting result:', (msg as any).data?.meta?.n_agents, 'agents');
            setState(s => ({ ...s, loading: false, result: msg.data, cachedMessage: null, progress: null }));
            break;
          case 'cached':
            // Do NOT clear the timeout here — the result message (which follows
            // immediately) will clear it. If the result never arrives (e.g. legacy
            // backend sending raw JSON without type envelope), the timeout fallback
            // in runSimulation still fires and resets loading.
            setState(s => ({ ...s, cachedMessage: msg.message }));
            break;
          case 'sweep_result':
            clearTimeoutSafe(timeoutTimer.current);
            setState(s => ({ ...s, loading: false, sweepResult: msg.data, progress: null }));
            break;
          case 'progress':
            setState(s => ({ ...s, progress: { phase: msg.phase, pct: msg.pct } }));
            break;
          case 'log':
            setState(s => {
              const next = [...s.logs, msg.entry];
              if (next.length > 500) return { ...s, logs: next.slice(-300) };
              return { ...s, logs: next };
            });
            break;
          case 'error':
            clearTimeoutSafe(timeoutTimer.current);
            console.warn('[WS] Error from backend:', msg.message);
            setState(s => ({ ...s, loading: false, error: msg.message, progress: null }));
            break;
          default: {
            // Legacy backend sends cached results as raw JSON via send_text
            // without a type envelope. Detect by checking for 'meta' + 'agents'.
            const raw = msg as Record<string, unknown>;
            if (raw && typeof raw === 'object' && 'meta' in raw && 'agents' in raw) {
              clearTimeoutSafe(timeoutTimer.current);
              console.debug('[WS] Detected raw result (no type envelope):',
                (raw.meta as any)?.n_agents, 'agents');
              setState(s => ({
                ...s,
                loading: false,
                result: raw as unknown as SimulationResult,
                cachedMessage: null,
                progress: null,
              }));
            } else {
              console.debug('[WS] Unknown message type:', (raw as any)?.type, 'keys:', Object.keys(raw || {}));
            }
          }
        }
      } catch (err) {
        console.warn('[WS] Parse error:', err, 'raw:', (event.data as string).slice(0, 200));
      }
    };

    ws.onclose = () => {
      setState(s => ({ ...s, connected: false }));
      const delay = Math.min(30_000, RECONNECT_DELAY_MS * Math.pow(1.5, connectAttemptRef.current));
      connectAttemptRef.current += 1;
      reconnectTimer.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      clearTimeoutSafe(reconnectTimer.current);
      clearTimeoutSafe(timeoutTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((message: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
      return true;
    }
    return false;
  }, []);

  const cancelSimulation = useCallback(() => {
    clearTimeoutSafe(timeoutTimer.current);
    setState(s => ({ ...s, loading: false, progress: null }));
  }, []);

  const clearLogs = useCallback(() => {
    setState(s => ({ ...s, logs: [] }));
  }, []);

  const runSimulation = useCallback((params: Partial<SimulationParams>) => {
    // Check connection before entering loading state
    if (wsRef.current?.readyState !== WebSocket.OPEN) {
      console.debug('[WS] Cannot run — WebSocket not OPEN (readyState=%s)', wsRef.current?.readyState);
      setState(s => ({
        ...s,
        error: '未连接到模拟后端，正在尝试重连...',
        loading: false,
      }));
      return;
    }

    console.debug('[WS] → run (n_agents=%d)', params.n_agents);
    setState(s => ({ ...s, loading: true, error: null, progress: null }));
    const sent = send({ type: 'run', params });

    if (!sent) {
      // WebSocket disconnected between the readyState check and send()
      setState(s => ({ ...s, loading: false, error: '连接已断开，正在重连...' }));
      return;
    }

    // Start timeout — if backend never responds, reset loading
    clearTimeoutSafe(timeoutTimer.current);
    timeoutTimer.current = setTimeout(() => {
      setState(s => {
        // Only timeout if still loading (avoid racing with a late result)
        if (s.loading) {
          return { ...s, loading: false, error: '模拟超时（30秒无响应），请检查后端是否正常运行', progress: null };
        }
        return s;
      });
    }, SIMULATION_TIMEOUT_MS);
  }, [send]);

  const runSweep = useCallback((sweepParam: string, baseParams?: Partial<SimulationParams>) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) {
      setState(s => ({
        ...s,
        error: '未连接到模拟后端，正在尝试重连...',
        loading: false,
      }));
      return;
    }

    setState(s => ({ ...s, loading: true, error: null, progress: null }));
    const sent = send({ type: 'sweep', sweep_param: sweepParam, base_params: baseParams || {} });

    if (sent) {
      clearTimeoutSafe(timeoutTimer.current);
      timeoutTimer.current = setTimeout(() => {
        setState(s => {
          if (s.loading) {
            return { ...s, loading: false, error: '灵敏度扫描超时（120秒无响应），请减少扫描范围后重试', progress: null };
          }
          return s;
        });
      }, SWEEP_TIMEOUT_MS);
    }
  }, [send]);

  return {
    ...state,
    runSimulation,
    runSweep,
    cancelSimulation,
    clearLogs,
  };
}
