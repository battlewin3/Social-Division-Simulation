import type { NetworkData } from '../../../types/simulation';
import type * as d3 from 'd3';

// ============================================================
// HierarchicalNetworkView props
// ============================================================

export interface HierarchicalNetworkViewProps {
  network: NetworkData | null;
  selectedAgentId: number | null;
  onSelectAgent: (id: number) => void;
  loading: boolean;
  error: string | null;
}

// ============================================================
// Simulation node types
// ============================================================

export interface SimNode extends d3.SimulationNodeDatum {
  id: number;
  race: number;
  earnings: number;
  radius: number;
}

export interface CommunityNode extends d3.SimulationNodeDatum {
  id: string;
  groupKey: number;
  label: string;
  memberCount: number;
  majorityCount: number;
  minorityCount: number;
  radius: number;
}

export interface CommunityEdge {
  source: string;
  target: string;
  weight: number;
}

// ============================================================
// Force simulation tunable parameters
// ============================================================

export interface ForceParams {
  chargeStrength: number;
  linkDistance: number;
  linkStrength: number;
  collisionPadding: number;
  centerStrength: number;
  alphaDecay: number;
}

export const FORCE_DEFAULTS: Record<'community' | 'interior', ForceParams> = {
  community: {
    chargeStrength: -350,
    linkDistance: 120,
    linkStrength: 0.5,
    collisionPadding: 10,
    centerStrength: 1.0,
    alphaDecay: 0.0228,
  },
  interior: {
    chargeStrength: -90,
    linkDistance: 28,
    linkStrength: 0.25,
    collisionPadding: 6,
    centerStrength: 1.0,
    alphaDecay: 0.0228,
  },
};

export const FORCE_LABELS: Record<keyof ForceParams, string> = {
  chargeStrength: '电荷斥力',
  linkDistance: '连线距离',
  linkStrength: '连线强度',
  collisionPadding: '碰撞边距',
  centerStrength: '中心引力',
  alphaDecay: '衰减速度',
};

export const FORCE_RANGES: Record<keyof ForceParams, [number, number, number]> = {
  chargeStrength: [-1200, 0, 10],
  linkDistance: [5, 300, 1],
  linkStrength: [0, 1, 0.01],
  collisionPadding: [0, 40, 1],
  centerStrength: [0, 3, 0.05],
  alphaDecay: [0.002, 0.2, 0.001],
};
