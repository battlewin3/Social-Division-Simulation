import { ReactNode } from 'react';

interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  className?: string;
}

export function Button({ children, onClick, variant = 'primary', disabled = false, className = '' }: ButtonProps) {
  const isPrimary = variant === 'primary';

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-4 py-2 text-sm font-medium cursor-pointer transition-all duration-200 ${className}`}
      style={{
        backgroundColor: disabled ? 'var(--color-border)' : isPrimary ? 'var(--color-ink)' : 'var(--color-surface)',
        color: disabled ? 'var(--color-ink-secondary)' : isPrimary ? '#FFFFFF' : 'var(--color-ink)',
        border: isPrimary ? '1px solid var(--color-ink)' : '1px solid var(--color-border)',
        borderRadius: 'var(--radius-sm)',
        fontFamily: 'var(--font-sans)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          (e.target as HTMLElement).style.backgroundColor = isPrimary ? '#333333' : 'var(--color-canvas)';
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled) {
          (e.target as HTMLElement).style.backgroundColor = isPrimary ? 'var(--color-ink)' : 'var(--color-surface)';
        }
      }}
      onMouseDown={(e) => {
        if (!disabled) (e.target as HTMLElement).style.transform = 'scale(0.98)';
      }}
      onMouseUp={(e) => {
        (e.target as HTMLElement).style.transform = 'scale(1)';
      }}
    >
      {children}
    </button>
  );
}
