interface BadgeProps {
  children: string;
  variant?: 'blue' | 'amber' | 'green' | 'red' | 'neutral';
  className?: string;
}

const VARIANT_CLASSES: Record<string, string> = {
  blue: 'bg-accent-blue-bg text-accent-blue-text',
  amber: 'bg-accent-amber-bg text-accent-amber-text',
  green: 'bg-accent-green-bg text-accent-green-text',
  red: 'bg-accent-red-bg text-accent-red-text',
  neutral: 'bg-canvas text-ink-secondary',
};

export function Badge({ children, variant = 'neutral', className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-block rounded-tag px-2.5 py-0.5 text-[0.65rem] tracking-[0.08em] uppercase font-medium ${VARIANT_CLASSES[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
