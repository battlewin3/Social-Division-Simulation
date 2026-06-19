interface BadgeProps {
  children: string;
  variant?: 'blue' | 'amber' | 'green' | 'red' | 'neutral';
  className?: string;
}

const STYLES: Record<string, { bg: string; text: string }> = {
  blue: { bg: '#E1F3FE', text: '#1F6C9F' },
  amber: { bg: '#FBF3DB', text: '#956400' },
  green: { bg: '#EDF3EC', text: '#346538' },
  red: { bg: '#FDEBEC', text: '#9F2F2D' },
  neutral: { bg: '#F3F3F2', text: '#787774' },
};

export function Badge({ children, variant = 'neutral', className = '' }: BadgeProps) {
  const s = STYLES[variant];
  return (
    <span
      className={`inline-block rounded-tag px-2.5 py-0.5 text-xs uppercase tracking-wider font-medium ${className}`}
      style={{
        backgroundColor: s.bg,
        color: s.text,
        fontSize: '0.65rem',
        letterSpacing: '0.08em',
      }}
    >
      {children}
    </span>
  );
}
