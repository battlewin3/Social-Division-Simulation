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
    <div className={`flex flex-wrap gap-4 font-sans text-[0.7rem] ${className}`}>
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-1.5">
          {item.shape === 'line' ? (
            <span className="w-4 h-0.5" style={{ backgroundColor: item.color }} />
          ) : item.shape === 'rect' ? (
            <span className="w-2.5 h-2.5 rounded-[2px]" style={{ backgroundColor: item.color }} />
          ) : (
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
          )}
          <span className="text-text-secondary">{item.label}</span>
        </div>
      ))}
    </div>
  );
}
