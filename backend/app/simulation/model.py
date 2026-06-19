"""
Mesa-style simulation model that orchestrates the full ABM pipeline.

While we don't use Mesa's full framework (to keep dependencies light),
this follows Mesa's Model/Agent pattern for clarity.
"""

import time
import logging
from typing import Callable, Optional
import numpy as np

from .agents import Agent, create_agents, get_agent_array
from .parameters import SimulationParams
from .stages import run_all_stages
from .network import build_social_network, compute_network_statistics
from .inference import compute_gods_eye, compute_individual_inference, compute_aggregate_perception

# Module-level logger — outputs to both stderr and WebSocket clients
_log = logging.getLogger("abm")


class SimulationModel:
    """
    Top-level simulation model.

    Usage:
        params = SimulationParams()
        model = SimulationModel(params)
        model.run()
        results = model.get_results()
    """

    def __init__(self, params: SimulationParams, on_progress: Optional[Callable[[str, float], None]] = None):
        self.params = params
        self.rng = np.random.default_rng(params.seed)
        self.agents: list[Agent] = []
        self._gods_eye: dict = {}
        self._perception: dict = {}
        self._network_stats: dict = {}
        self._runtime_ms: float = 0.0
        self._on_progress = on_progress

    def _progress(self, phase: str, pct: float) -> None:
        if self._on_progress:
            try:
                self._on_progress(phase, pct)
            except Exception:
                pass  # Never let progress reporting crash the simulation

    def run(self) -> None:
        """Execute the full simulation pipeline with detailed progress logging."""
        t0 = time.perf_counter()
        n = self.params.n_agents

        # ── Stage 0: Initialize agents ──
        _log.info("━━ 阶段 0/5: 创建 %d 个智能体 (少数群体比例=%.2f, seed=%d)",
                  n, self.params.race_dist, self.params.seed)
        self._progress('创建智能体...', 5)
        t_stage = time.perf_counter()
        self.agents = create_agents(
            n_agents=n,
            race_dist=self.params.race_dist,
            rng=self.rng,
        )
        n_maj = sum(1 for a in self.agents if a.race == 1)
        n_min = n - n_maj
        _log.info("   ✓ 完成 — 多数群体: %d (%.0f%%), 少数群体: %d (%.0f%%), 耗时 %.0fms",
                  n_maj, 100*n_maj/n, n_min, 100*n_min/n,
                  (time.perf_counter() - t_stage) * 1000)

        # ── Stages 1-4: Life course ──
        _log.info("━━ 阶段 1/5: 计算生命四阶段 (继承阶层 → 社区 → 学校 → 劳动收入)")
        self._progress('计算生命阶段...', 10)
        t_stage = time.perf_counter()
        run_all_stages(self.agents, self.params, self.rng)
        self._progress('生命阶段完成', 20)

        # Log stage summaries
        income_arr = np.array([a.income for a in self.agents])
        nhood_arr = np.array([a.nhood_proper for a in self.agents])
        school_arr = np.array([a.school_proper for a in self.agents])
        earnings_arr = np.array([a.earnings for a in self.agents])
        _log.info("   ✓ 完成 — 耗时 %.0fms", (time.perf_counter() - t_stage) * 1000)
        _log.info("   ├─ 继承阶层: μ=%.3f σ=%.3f", float(np.mean(income_arr)), float(np.std(income_arr)))
        _log.info("   ├─ 社区分组: μ=%.1f σ=%.1f", float(np.mean(nhood_arr)), float(np.std(nhood_arr)))
        _log.info("   ├─ 学校分组: μ=%.1f σ=%.1f", float(np.mean(school_arr)), float(np.std(school_arr)))
        _log.info("   └─ 劳动收入: μ=%.3f σ=%.3f", float(np.mean(earnings_arr)), float(np.std(earnings_arr)))

        # ── Network formation ──
        _log.info("━━ 阶段 2/5: 构建社交网络 (network_stage=%s, net_size=%d, friend_size=%.2f)",
                  self.params.network_stage, self.params.net_size, self.params.friend_size)
        self._progress('构建社交网络...', 25)
        t_stage = time.perf_counter()
        build_social_network(
            agents=self.agents,
            network_stage=self.params.network_stage,
            net_size=self.params.net_size,
            friend_size=self.params.friend_size,
            rng=self.rng,
            on_progress=self._progress,
        )
        _log.info("   ✓ 完成 — 耗时 %.0fms", (time.perf_counter() - t_stage) * 1000)

        # ── Network statistics ──
        _log.info("━━ 阶段 3/5: 计算网络拓扑统计")
        self._progress('计算网络统计...', 50)
        t_stage = time.perf_counter()
        self._network_stats = compute_network_statistics(self.agents)
        _log.info("   ✓ 完成 — 耗时 %.0fms", (time.perf_counter() - t_stage) * 1000)
        _log.info("   ├─ 总边数: %d", self._network_stats["total_edges"])
        _log.info("   ├─ 平均度数: %.1f", self._network_stats["avg_degree"])
        _log.info("   ├─ 种族模块度: %.4f", self._network_stats["modularity_race"])
        _log.info("   └─ 种族同质性: %.4f", self._network_stats["homophily_race"])

        # ── God's-eye inference ──
        _log.info("━━ 阶段 4/5: 全局推理 (God's-eye OLS)")
        self._progress('全局推理...', 60)
        t_stage = time.perf_counter()
        self._gods_eye = compute_gods_eye(self.agents)
        _log.info("   ✓ 完成 — 耗时 %.0fms", (time.perf_counter() - t_stage) * 1000)
        _log.info("   ├─ Gini 系数: %.4f", self._gods_eye["gini"])
        _log.info("   ├─ 种族收入差距: %.4f", self._gods_eye["race_gap"])
        _log.info("   ├─ 种族间方差占比: %.4f", self._gods_eye["between_race_var_share"])
        _log.info("   ├─ OLS 完整模型 R²: %.4f", self._gods_eye["ols_full"]["r_squared"])
        _log.info("   └─ OLS 种族模型 R²: %.4f", self._gods_eye["ols_race_only"]["r_squared"])

        # ── Individual inference ──
        _log.info("━━ 阶段 5/5: 个体感知推理 (每个智能体基于邻居数据做 OLS)")
        self._progress('个体感知推理...', 75)
        t_stage = time.perf_counter()
        compute_individual_inference(self.agents, on_progress=self._progress)
        _log.info("   ✓ 完成 — 耗时 %.0fms", (time.perf_counter() - t_stage) * 1000)

        # ── Aggregate perception ──
        _log.info("━━ 汇总感知结果 & 计算偏差")
        self._progress('汇总感知结果...', 90)
        t_stage = time.perf_counter()
        self._perception = compute_aggregate_perception(self.agents)
        n_infer = self._perception.get("n_agents_with_inference", 0)
        biases = self._perception.get("biases", {})
        _log.info("   ✓ 完成 — 耗时 %.0fms", (time.perf_counter() - t_stage) * 1000)
        _log.info("   ├─ 有效个体推理数: %d / %d", n_infer, n)
        _log.info("   ├─ 平均感知 Gini: %s",
                  f'{self._perception["perception_mean"]["mean_perceived_gini"]:.4f}'
                  if self._perception["perception_mean"]["mean_perceived_gini"] is not None
                  else 'N/A')
        _log.info("   ├─ Gini 偏差: %s",
                  f'{biases.get("gini_bias", "N/A"):.4f}'
                  if isinstance(biases.get("gini_bias"), float)
                  else str(biases.get("gini_bias", "N/A")))
        _log.info("   ├─ 种族系数偏差: %s",
                  f'{biases.get("race_coef_bias", "N/A"):.4f}'
                  if isinstance(biases.get("race_coef_bias"), float)
                  else str(biases.get("race_coef_bias", "N/A")))
        _log.info("   └─ 能力系数偏差: %s",
                  f'{biases.get("ability_coef_bias", "N/A"):.4f}'
                  if isinstance(biases.get("ability_coef_bias"), float)
                  else str(biases.get("ability_coef_bias", "N/A")))

        self._progress('完成', 100)
        t1 = time.perf_counter()
        self._runtime_ms = (t1 - t0) * 1000.0

        _log.info("══════════════════════════════════════════")
        _log.info("模拟全部完成 — 总耗时 %.0fms, %d agents, %d edges",
                  self._runtime_ms, n,
                  self._network_stats.get("total_edges", 0))
        _log.info("══════════════════════════════════════════")

    def get_results(self) -> dict:
        """
        Return all simulation results as a JSON-serializable dict.

        Structure:
        {
            "meta": {params, runtime_ms, n_agents},
            "agents": [{agent_dict}, ...],      # Full agent data
            "network": {nodes, edges},           # For 3D visualization
            "gods_eye": {...},                  # Ground truth stats
            "perception": {...},                # Aggregate perception
            "network_stats": {...}              # Network topology stats
        }
        """
        # Agent data
        agent_data = [a.to_dict(include_inference=True) for a in self.agents]

        # Network data for visualization
        nodes = []
        for a in self.agents:
            nodes.append({
                "id": a.agent_id,
                "race": a.race,
                "race_label": "多数群体" if a.race == 1 else "少数群体",
                "ability": round(a.ability, 4),
                "income": round(a.income, 4),
                "nhood_proper": a.nhood_proper,
                "school_proper": a.school_proper,
                "earnings": round(a.earnings, 4),
                "earnings_proper": a.earnings_proper,
                "degree": len(a.neighbors),
                "perceived_gini": round(a.perceived_gini, 4) if a.perceived_gini is not None else None,
            })

        # Edges (as pairs for efficient transfer)
        edges = []
        for i, a in enumerate(self.agents):
            for nb in a.neighbors:
                if i < nb:  # Each edge once
                    edges.append([i, nb])

        return {
            "meta": {
                "params": self.params.to_dict(),
                "runtime_ms": round(self._runtime_ms, 2),
                "n_agents": len(self.agents),
                "n_edges": len(edges),
                "scenario_label": self._infer_scenario(),
            },
            "agents": agent_data,
            "network": {
                "nodes": nodes,
                "edges": edges,
            },
            "gods_eye": self._gods_eye,
            "perception": self._perception,
            "network_stats": self._network_stats,
        }

    def _infer_scenario(self) -> str:
        """Try to identify which scenario preset the current params match."""
        p = self.params
        if p.beta_race_nhood == 0 and p.beta_race_school == 0 and p.beta_race_earnings == 0 and p.network_stage == "random":
            return "平等理想社会"
        if p.beta_race_nhood >= 0.15 and p.beta_race_earnings >= 0.15:
            return "高度隔离社会"
        if p.beta_race_nhood == 0.075 and p.beta_race_school == 0.075:
            return "美国现状"
        if p.network_stage == "school" and p.beta_race_school > 0.075:
            return "精英主义幻觉"
        if p.beta_race_earnings >= 0.2:
            return "种族隔离最大化"
        if p.beta_income_nhood >= 2.0:
            return "阶层决定论"
        return "自定义参数"


def run_simulation_from_dict(params_dict: dict, on_progress=None) -> dict:
    """
    Convenience function: run a simulation from a raw parameter dict
    (e.g., received from WebSocket) and return results.

    Parameters
    ----------
    params_dict : dict
        Raw parameter dictionary from frontend.
    on_progress : callable or None
        Optional callback(phase: str, pct: float) for progress reporting.
    """
    params = SimulationParams.from_dict(params_dict)
    model = SimulationModel(params, on_progress=on_progress)
    model.run()
    return model.get_results()
