import { useRef, useEffect, useState } from 'react';
import { Trash, CaretDown, CaretRight, Terminal } from '@phosphor-icons/react';
import type { LogEntry } from '../../types/simulation';

interface DebugConsoleProps {
  logs: LogEntry[];
  onClear: () => void;
}

const LEVEL_COLORS: Record<string, string> = {
  debug: 'var(--color-ink-secondary)',
  info: 'var(--color-accent-text)',
  warning: 'var(--color-warning-text)',
  error: 'var(--color-error-text)',
};

export function DebugConsole({ logs, onClear }: DebugConsoleProps) {
  const [open, setOpen] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const tailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && tailRef.current) {
      tailRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const errorCount = logs.filter(l => l.level === 'error').length;
  const warnCount = logs.filter(l => l.level === 'warning').length;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 300,
        backgroundColor: 'var(--color-surface)',
        borderTop: '1px solid var(--color-border)',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.675rem',
        transition: 'max-height 250ms var(--ease-out-expo)',
        maxHeight: open ? '320px' : '32px',
      }}
    >
      {/* Header bar */}
      <div
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          height: 32,
          padding: '0 12px',
          cursor: 'pointer',
          userSelect: 'none',
          backgroundColor: open ? 'var(--color-canvas)' : 'var(--color-surface)',
          borderBottom: open ? '1px solid var(--color-border)' : 'none',
        }}
      >
        {open ? (
          <CaretDown size={10} weight="bold" color="var(--color-ink-secondary)" />
        ) : (
          <CaretRight size={10} weight="bold" color="var(--color-ink-secondary)" />
        )}
        <Terminal size={14} weight="bold" color="var(--color-ink-secondary)" />
        <span style={{ color: 'var(--color-ink)' }}>后端日志</span>
        {!open && logs.length > 0 && (
          <span style={{ color: 'var(--color-ink-secondary)' }}>
            ({logs.length} 条
            {errorCount > 0 && (
              <span style={{ color: 'var(--color-error-text)', fontWeight: 600 }}>
                {' '}{errorCount} 错误
              </span>
            )}
            {warnCount > 0 && (
              <span style={{ color: 'var(--color-warning-text)' }}>
                {' '}{warnCount} 警告
              </span>
            )}
            )
          </span>
        )}
        {!open && logs.length === 0 && (
          <span style={{ color: 'var(--color-ink-secondary)' }}>等待连接...</span>
        )}
        <div style={{ flex: 1 }} />
        {open && (
          <>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', color: 'var(--color-ink-secondary)' }}>
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
                style={{ cursor: 'pointer', accentColor: 'var(--color-accent)' }}
              />
              自动滚动
            </label>
            <button
              onClick={(e) => { e.stopPropagation(); onClear(); }}
              title="清空日志"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 8px',
                backgroundColor: 'transparent',
                color: 'var(--color-ink-secondary)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.6rem',
                cursor: 'pointer',
              }}
            >
              <Trash size={10} weight="bold" />
              清空
            </button>
          </>
        )}
      </div>

      {/* Log list */}
      {open && (
        <div
          style={{
            overflowY: 'auto',
            height: 320 - 32,
            padding: '4px 0',
            backgroundColor: 'var(--color-canvas)',
          }}
        >
          {logs.length === 0 ? (
            <div
              style={{
                padding: '32px 12px',
                textAlign: 'center',
                color: 'var(--color-ink-secondary)',
              }}
            >
              暂无日志 — 启动后端后运行模拟即可看到输出
            </div>
          ) : (
            logs.map((entry, i) => (
              <div
                key={i}
                style={{
                  padding: '2px 12px',
                  display: 'flex',
                  gap: 8,
                  color: LEVEL_COLORS[entry.level] ?? 'var(--color-ink)',
                  backgroundColor: entry.level === 'error' ? 'var(--color-error-bg)'
                    : entry.level === 'warning' ? 'var(--color-warning-bg)'
                    : 'transparent',
                }}
              >
                <span style={{ opacity: 0.6, flexShrink: 0, minWidth: 56 }}>{entry.t}</span>
                <span style={{
                  fontWeight: 600,
                  flexShrink: 0,
                  minWidth: 52,
                  textAlign: 'right',
                  opacity: entry.level === 'info' ? 0.7 : 1,
                }}>
                  {entry.level.toUpperCase()}
                </span>
                <span>{entry.msg}</span>
              </div>
            ))
          )}
          <div ref={tailRef} />
        </div>
      )}
    </div>
  );
}
