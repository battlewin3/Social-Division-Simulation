"""
Sensitivity analysis: pre-compute parameter sweep data for the
SensitivityView frontend chart.
"""

import numpy as np

from .model import SimulationModel
from .parameters import SimulationParams, NetworkStage


def run_sensitivity_sweep(
    sweep_param: str = "beta_race_earnings",
    sweep_values: list[float] | None = None,
    network_stages: list[NetworkStage] | None = None,
    base_params: dict | None = None,
) -> dict:
    """
    Run parameter sensitivity sweep.

    Varies `sweep_param` across `sweep_values` for each network stage,
    returning key outcome metrics.

    Returns a dict suitable for the SensitivityView multi-line chart.
    """
    if sweep_values is None:
        sweep_values = [0.0, 0.025, 0.05, 0.075, 0.10, 0.15, 0.20, 0.25]

    if network_stages is None:
        network_stages = ["random", "nhood", "school", "earnings"]

    if base_params is None:
        base_params = {}

    series = []

    for stage in network_stages:
        points = []
        for val in sweep_values:
            p = SimulationParams()
            # Apply base overrides
            for k, v in base_params.items():
                if hasattr(p, k):
                    setattr(p, k, v)
            # Set sweep parameter
            if hasattr(p, sweep_param):
                setattr(p, sweep_param, val)
            # Set network stage
            p.network_stage = stage
            # Use deterministic seed for reproducibility
            p.seed = 42

            model = SimulationModel(p)
            model.run()
            results = model.get_results()

            points.append({
                "param_value": val,
                "gini_true": results["gods_eye"]["gini"],
                "race_gap_true": results["gods_eye"]["race_gap"],
                "gini_perceived": results["perception"]["perception_mean"]["mean_perceived_gini"],
                "race_gap_perceived": results["perception"]["perception_mean"]["mean_perceived_race_gap"],
                "gini_bias": results["perception"]["biases"].get("gini_bias"),
                "race_gap_bias": results["perception"]["biases"].get("race_gap_bias"),
                "ability_coef_bias": results["perception"]["biases"].get("ability_coef_bias"),
                "network_modularity": results["network_stats"]["modularity_race"],
                "network_homophily": results["network_stats"]["homophily_race"],
            })

        series.append({
            "network_stage": stage,
            "stage_label": {
                "random": "随机网络",
                "nhood": "社区网络",
                "school": "学校网络",
                "earnings": "收入网络",
            }.get(stage, stage),
            "points": points,
        })

    # Compute summary analytics
    summary = _compute_sweep_summary(series)

    return {
        "sweep_param": sweep_param,
        "sweep_param_label": _param_label(sweep_param),
        "series": series,
        "summary": summary,
    }


def _param_label(param_name: str) -> str:
    """Human-readable label for a parameter."""
    labels = {
        "beta_race_income": "种族→继承阶层",
        "beta_race_nhood": "种族→社区 (住房歧视)",
        "beta_race_school": "种族→学校 (教育歧视)",
        "beta_race_earnings": "种族→收入 (劳动力歧视)",
        "beta_ability_school": "能力→学校",
        "beta_ability_earnings": "能力→收入",
        "luck_sd": "运气标准差",
        "friend_size": "网络重连概率",
    }
    return labels.get(param_name, param_name)


def _compute_sweep_summary(series: list[dict]) -> dict:
    """Compute summary statistics from sweep data."""
    # Find the point with maximum bias for each stage
    max_bias_stage = None
    max_bias_val = -float("inf")

    for s in series:
        for pt in s["points"]:
            if pt["gini_bias"] is not None and abs(pt["gini_bias"]) > max_bias_val:
                max_bias_val = abs(pt["gini_bias"])
                max_bias_stage = s["stage_label"]

    return {
        "max_gini_bias_stage": max_bias_stage,
        "max_gini_bias": max_bias_val if max_bias_val > -float("inf") else None,
    }
