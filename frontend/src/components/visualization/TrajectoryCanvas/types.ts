import { COLORS } from '../../../lib/constants';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FilterMode = 'all' | 'majority' | 'minority' | 'selected';

/** Z-score normalized agent for chart rendering. */
export interface NormalizedAgent {
  agentId: number;
  race: number;
  zValues: [number, number, number, number]; // income, nhood, school, earnings
}

export interface BrushState {
  axisIndex: number;
  y0: number;  // data coordinate
  y1: number;  // data coordinate (y0 may be > y1)
}

// ---------------------------------------------------------------------------
// Group mean computation
// ---------------------------------------------------------------------------

export interface GroupMeans {
  majority: [number, number, number, number] | null;
  minority: [number, number, number, number] | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const AXIS_LABELS = ['继承阶层', '社区质量', '学校质量', '劳动收入'] as const;
export const AXIS_KEYS = ['income', 'nhood_proper', 'school_proper', 'earnings'] as const;

export const Y_MIN = -3;
export const Y_MAX = 3;

export const MAJORITY_HEX = COLORS.majority.text;   // #1F6C9F
export const MINORITY_HEX = COLORS.minority.text;   // #956400
