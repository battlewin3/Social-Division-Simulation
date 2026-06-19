import { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
}

export function Card({ children, className = '', title, subtitle }: CardProps) {
  return (
    <div
      className={`bg-surface border border-border rounded-card p-card-pad ${className}`}
    >
      {title && (
        <div className="mb-4">
          <h3
            className="text-label uppercase tracking-wider m-0 mb-1"
            style={{
              fontFamily: 'var(--font-sans)',
              color: 'var(--color-ink-secondary)',
            }}
          >
            {title}
          </h3>
          {subtitle && (
            <p
              className="text-xs m-0"
              style={{
                fontSize: '0.7rem',
                fontFamily: 'var(--font-mono)',
                color: 'var(--color-ink-secondary)',
              }}
            >
              {subtitle}
            </p>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
