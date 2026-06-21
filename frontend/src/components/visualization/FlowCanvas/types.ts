import type { AgentData, SimulationParams } from '../../../types/simulation';

// ── Node / Edge specs ──
export interface NodeSpec {
  key: string;
  label: string;
  sub: string;
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
}

export interface EdgeSpec {
  src: string;
  tgt: string;
  betaKey: keyof SimulationParams;
  defVal: number;
  style: 'main' | 'beta' | 'zero';
}

export interface GridEdge {
  tgt: string; // target main node key
  betas: { src: string; key: keyof SimulationParams; defVal: number }[];
}

// ── Particle ──
export interface Particle {
  id: number;
  race: number;
  r: number;
  stageY: number[];
  delay: number;
  income: number;
  nhood: number;
  school: number;
  earnings: number;
}

export interface CirclePos {
  x: number;
  y: number;
  id: number;
  race: number;
  r: number;
  stageIdx: number;
}

// ── Stage formula ──
export interface FormulaTerm {
  text: string;
  sub?: string;
}

export type FormulaLine = FormulaTerm[];
