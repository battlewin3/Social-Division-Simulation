import { Warning, ArrowCounterClockwise } from '@phosphor-icons/react';

interface ErrorBannerProps {
  error: string;
  onRetry: () => void;
}

function isConnectionError(error: string): boolean {
  return error.includes('未连接') || error.includes('重连');
}

function isTimeoutError(error: string): boolean {
  return error.includes('超时');
}

export function ErrorBanner({ error, onRetry }: ErrorBannerProps) {
  const isConnErr = isConnectionError(error);
  const isTimeout = isTimeoutError(error);

  return (
    <div
      className="mb-4 px-4 py-3 rounded-md flex items-center gap-3 text-sm"
      style={{
        backgroundColor: isConnErr
          ? 'var(--color-warning-bg)'
          : 'var(--color-error-bg)',
        border: `1px solid ${
          isConnErr
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
          isConnErr
            ? 'var(--color-warning-text)'
            : 'var(--color-error-text)'
        }
      />
      <span className="flex-1">{error}</span>
      {isConnErr ? (
        <button
          onClick={onRetry}
          className="btn-primary px-3 py-1 text-xs"
        >
          重试
        </button>
      ) : isTimeout ? (
        <button
          onClick={onRetry}
          className="btn-primary flex items-center gap-1.5 px-3 py-1 text-xs"
        >
          <ArrowCounterClockwise size={12} weight="bold" />
          重试
        </button>
      ) : null}
    </div>
  );
}
