import type { CirclePos } from './types';
import { COLORS } from '../../../lib/constants';

interface FlowParticlesProps {
  positions: CirclePos[];
  selectedAgentId: number | null;
  hoveredParticleId: number | null;
  onSelectAgent: (id: number) => void;
}

function getParticleOpacity(p: CirclePos, hoveredParticleId: number | null, selectedAgentId: number | null): number {
  if (hoveredParticleId === p.id) return 1;
  if (selectedAgentId === p.id) return 1;
  return 0.55;
}

export function FlowParticles({ positions, selectedAgentId, hoveredParticleId, onSelectAgent }: FlowParticlesProps) {
  return (
    <>
      {positions.map((p, i) => {
        const isSel = p.id === selectedAgentId;
        const isHov = p.id === hoveredParticleId;
        const color = p.race === 1 ? COLORS.majority.text : COLORS.minority.text;
        const op = getParticleOpacity(p, hoveredParticleId, selectedAgentId);
        const radius = isSel ? p.r + 3 : isHov ? p.r + 2.5 : p.r;
        return (
          <circle key={`${p.id}-${i}`} cx={p.x} cy={p.y} r={radius}
            data-agent-id={p.id} data-stage-idx={p.stageIdx}
            fill={isSel || isHov ? '#FFF' : color}
            stroke={isSel || isHov ? color : 'none'}
            strokeWidth={isSel || isHov ? 2 : 0}
            opacity={op}
            style={{ cursor: 'pointer' }}
            onClick={() => onSelectAgent(p.id)} />
        );
      })}
    </>
  );
}
