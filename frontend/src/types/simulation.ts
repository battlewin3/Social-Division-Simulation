export interface SimulationParams {
  n_agents: number;
  race_dist: number;
  seed: number;
  beta_race_income: number;
  beta_race_nhood: number;
  beta_race_school: number;
  beta_race_earnings: number;
  beta_income_nhood: number;
  beta_ability_nhood: number;
  beta_income_school: number;
  beta_ability_school: number;
  beta_nhood_school: number;
  beta_income_earnings: number;
  beta_ability_earnings: number;
  beta_nhood_earnings: number;
  beta_school_earnings: number;
  network_formation: string;
  network_stage: NetworkStage;
  net_size: number;
  friend_size: number;
  luck_sd: number;
  rescale: boolean;
}

export type NetworkStage = 'random' | 'nhood' | 'school' | 'earnings';

export interface AgentData {
  agent_id: number;
  race: number;
  race_label: string;
  ability: number;
  income: number;
  nhood_raw: number;
  nhood_proper: number;
  school_raw: number;
  school_proper: number;
  earnings: number;
  earnings_proper: number;
  neighbor_count: number;
  neighbors: number[];
  perceived_gini?: number | null;
  perceived_race_gap?: number | null;
  perceived_betas?: number[] | null;
  perceived_r_squared?: number | null;
}

export interface NetworkNode {
  id: number;
  race: number;
  race_label: string;
  ability: number;
  income: number;
  nhood_proper: number;
  school_proper: number;
  earnings: number;
  earnings_proper: number;
  degree: number;
  perceived_gini?: number | null;
}

export interface NetworkData {
  nodes: NetworkNode[];
  edges: [number, number][];
}

export interface GodsEyeStats {
  gini: number;
  race_gap: number;
  majority_mean_earnings: number | null;
  minority_mean_earnings: number | null;
  between_race_var_share: number;
  ols_full: OLSResult;
  ols_race_only: OLSResult;
  n_agents: number;
  n_majority: number;
  n_minority: number;
}

export interface OLSResult {
  intercept: number;
  beta_race: number;
  beta_ability?: number;
  beta_income?: number;
  beta_nhood?: number;
  beta_school?: number;
  r_squared: number;
}

export interface PerceptionData {
  perception_mean: {
    mean_perceived_gini: number | null;
    mean_perceived_race_gap: number | null;
    mean_perceived_beta_race: number | null;
    mean_perceived_beta_ability: number | null;
    mean_perceived_r_squared: number | null;
  };
  biases: {
    gini_bias?: number;
    race_gap_bias?: number;
    ability_coef_bias?: number;
    race_coef_bias?: number;
  };
  n_agents_with_inference: number;
}

export interface NetworkStats {
  total_edges: number;
  avg_degree: number;
  modularity_race: number;
  homophily_race: number;
}

export interface SimulationResult {
  meta: {
    params: SimulationParams;
    runtime_ms: number;
    n_agents: number;
    n_edges: number;
    scenario_label: string;
  };
  agents: AgentData[];
  network: NetworkData;
  gods_eye: GodsEyeStats;
  perception: PerceptionData;
  network_stats: NetworkStats;
}

export interface ParameterConstraint {
  min: number;
  max: number;
  step: number;
  label: string;
}

export interface ScenarioPreset {
  name: string;
  description: string;
  params: Partial<SimulationParams>;
}

export interface SweepPoint {
  param_value: number;
  gini_true: number;
  race_gap_true: number;
  gini_perceived: number | null;
  race_gap_perceived: number | null;
  gini_bias: number | null;
  race_gap_bias: number | null;
  ability_coef_bias: number | null;
  network_modularity: number;
  network_homophily: number;
}

export interface SweepSeries {
  network_stage: NetworkStage;
  stage_label: string;
  points: SweepPoint[];
}

export interface SweepResult {
  sweep_param: string;
  sweep_param_label: string;
  series: SweepSeries[];
  summary: {
    max_gini_bias_stage: string | null;
    max_gini_bias: number | null;
  };
}

export interface SimulationProgress {
  phase: string;
  pct: number;
}

export interface LogEntry {
  t: string;
  level: 'debug' | 'info' | 'warning' | 'error';
  name: string;
  msg: string;
}

export type WSMessage =
  | { type: 'connected'; scenarios: ScenarioPreset[]; constraints: Record<string, ParameterConstraint> }
  | { type: 'result'; data: SimulationResult }
  | { type: 'cached'; message: string }
  | { type: 'sweep_start'; param: string }
  | { type: 'sweep_result'; data: SweepResult }
  | { type: 'scenarios'; data: ScenarioPreset[] }
  | { type: 'constraints'; data: Record<string, ParameterConstraint> }
  | { type: 'progress'; phase: string; pct: number }
  | { type: 'log'; entry: LogEntry }
  | { type: 'error'; message: string }
  | { type: 'health'; status: string };
