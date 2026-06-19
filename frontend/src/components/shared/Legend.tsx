interface LegendItem {
  color: string;
  label: string;
  shape?: 'circle' | 'line' | 'rect';
}

interface LegendProps {
  items: LegendItem[];
  className?: string;
}

export function Legend({ items, className = '' }: LegendProps) {
  return (
    <div className={`flex flex-wrap gap-4 ${className}`}
      style={{ fontFamily: "'Geist Sans', sans-serif", fontSize: '0.7rem' }}>
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-1.5">
          {item.shape === 'line' ? (
            <span style={{ width: 16, height: 2, backgroundColor: item.color, display: 'inline-block' }} />
          ) : item.shape === 'rect' ? (
            <span style={{ width: 10, height: 10, backgroundColor: item.color, display: 'inline-block', borderRadius: 2 }} />
          ) : (
            <span style={{ width: 8, height: 8, backgroundColor: item.color, borderRadius: '50%', display: 'inline-block' }} />
          )}
          <span className="text-text-secondary">{item.label}</span>
        </div>
      ))}
    </div>
  );
}
