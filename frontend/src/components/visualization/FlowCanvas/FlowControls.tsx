import { Play, Pause, ArrowCounterClockwise, Plus, Minus, CornersOut } from '@phosphor-icons/react';

interface FlowControlsProps {
  playing: boolean;
  wave: number;
  canInteract: boolean;
  onPlayPause: () => void;
  onReset: () => void;
  zoomK: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
}

export function FlowControls({
  playing, wave, canInteract,
  onPlayPause, onReset,
  zoomK, onZoomIn, onZoomOut, onZoomReset,
}: FlowControlsProps) {
  const btnLabel = playing ? '暂停' : (wave > 0 && wave < 4) ? '继续' : '播放';
  const statusText = wave === 0 && !playing ? '就绪' : wave >= 4 && !playing ? '完成' : `波 ${wave}/4`;

  return (
    <div className="flex items-center gap-2 mb-2">
      {/* Play/Pause */}
      <button onClick={onPlayPause} disabled={!canInteract}
        className="flex items-center gap-1 px-3 py-[5px] text-xs bg-ink text-white border-none rounded-btn cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ fontFamily: 'var(--font-sans)' }}>
        {playing ? <Pause size={14} weight="bold" /> : <Play size={14} weight="bold" />}
        {btnLabel}
      </button>

      {/* Reset */}
      <button onClick={onReset} disabled={!canInteract}
        className="flex items-center gap-1 px-3 py-[5px] text-xs bg-transparent text-ink-secondary border border-border rounded-btn cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ fontFamily: 'var(--font-sans)' }}>
        <ArrowCounterClockwise size={14} weight="bold" />重置
      </button>

      {/* Wave indicator dots */}
      {[0, 1, 2, 3, 4].map(s => (
        <div key={s} className="flex-1 h-[3px] rounded-sm"
          style={{ backgroundColor: s <= wave ? 'var(--color-accent)' : 'var(--color-border)' }} />
      ))}

      {/* Status text */}
      <span className="text-[0.7rem] text-ink-secondary min-w-[60px] text-right"
        style={{ fontFamily: "'Geist Mono', monospace" }}>
        {statusText}
      </span>

      {/* Zoom controls */}
      <div className="flex items-center gap-[3px] bg-surface rounded-btn border border-border px-[6px] py-[3px] shadow-surface"
        style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        <button onClick={onZoomOut} title="缩小"
          className="flex items-center justify-center w-6 h-6 border-none rounded bg-transparent cursor-pointer text-ink-secondary">
          <Minus size={13} weight="bold" />
        </button>
        <span className="text-[0.65rem] text-ink-secondary min-w-[36px] text-center select-none"
          style={{ fontFamily: "'Geist Mono', monospace" }}>
          {Math.round(zoomK * 100)}%
        </span>
        <button onClick={onZoomIn} title="放大"
          className="flex items-center justify-center w-6 h-6 border-none rounded bg-transparent cursor-pointer text-ink-secondary">
          <Plus size={13} weight="bold" />
        </button>
        <button onClick={onZoomReset} title="重置视图"
          className="flex items-center justify-center w-6 h-6 border-none rounded bg-transparent cursor-pointer text-ink-secondary ml-0.5">
          <CornersOut size={12} weight="bold" />
        </button>
      </div>
    </div>
  );
}
