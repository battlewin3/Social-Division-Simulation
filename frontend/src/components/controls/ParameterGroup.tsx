import { ReactNode } from 'react';
import { CaretDown, CaretRight } from '@phosphor-icons/react';
import { useState } from 'react';

interface ParameterGroupProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}

export function ParameterGroup({ title, children, defaultOpen = true }: ParameterGroupProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="mb-4">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 w-full text-left py-1.5 mb-2 cursor-pointer bg-transparent border-none font-sans"
      >
        {open ? (
          <CaretDown size={10} weight="bold" color="#787774" />
        ) : (
          <CaretRight size={10} weight="bold" color="#787774" />
        )}
        <span className="text-[0.625rem] tracking-[0.08em] font-semibold uppercase text-text-secondary">
          {title}
        </span>
      </button>
      {open && <div className="pl-2">{children}</div>}
    </div>
  );
}
