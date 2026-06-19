"""
Statistical inference engine.

Computes both:
1. God's-eye view (ground truth from all agents)
2. Individual-level inference (each agent observes only its network neighbors)

This is the core mechanism that demonstrates how segregation ruins inference.
"""

import numpy as np
from numpy.typing import NDArray

from .agents import Agent, get_agent_array
from ..utils.numerics import gini, variance_decomposition, ols_coefficients


def compute_gods_eye(agents: list[Agent]) -> dict:
    """
    Compute ground-truth statistics from the full population.

    Returns a dict with:
    - gini: Gini coefficient of earnings
    - race_gap: mean(earnings | majority) - mean(earnings | minority)
    - variance_decomp: between/within race variance decomposition
    - ols_full: coefficients and R² from earnings ~ race + ability + income + nhood + school
    - ols_race_only: coefficients and R² from earnings ~ race
    """
    n = len(agents)
    earnings = get_agent_array(agents, "earnings")
    race = get_agent_array(agents, "race")
    ability = get_agent_array(agents, "ability")
    income = get_agent_array(agents, "income")
    nhood_raw = get_agent_array(agents, "nhood_raw")
    school_raw = get_agent_array(agents, "school_raw")

    # Gini
    gini_val = gini(earnings)

    # Race gap
    majority_mask = race == 1
    minority_mask = race == 0
    majority_earnings = earnings[majority_mask]
    minority_earnings = earnings[minority_mask]

    race_gap = float(np.mean(majority_earnings) - np.mean(minority_earnings)) if len(majority_earnings) > 0 and len(minority_earnings) > 0 else 0.0

    # Variance decomposition by race
    var_decomp = variance_decomposition(earnings, race.astype(np.int64))

    # OLS: earnings ~ race + ability + income + nhood + school (full model)
    X_full = np.column_stack([race, ability, income, nhood_raw, school_raw])
    betas_full, r2_full = ols_coefficients(X_full, earnings)
    # betas_full order: [intercept, race, ability, income, nhood, school]

    # OLS: earnings ~ race (race-only model)
    X_race = race.reshape(-1, 1)
    betas_race_only, r2_race_only = ols_coefficients(X_race, earnings)

    return {
        "gini": round(gini_val, 6),
        "race_gap": round(race_gap, 6),
        "majority_mean_earnings": round(float(np.mean(majority_earnings)), 6) if len(majority_earnings) > 0 else None,
        "minority_mean_earnings": round(float(np.mean(minority_earnings)), 6) if len(minority_earnings) > 0 else None,
        "between_race_var_share": round(var_decomp["between_share"], 6),
        "ols_full": {
            "intercept": round(float(betas_full[0]), 6),
            "beta_race": round(float(betas_full[1]), 6),
            "beta_ability": round(float(betas_full[2]), 6),
            "beta_income": round(float(betas_full[3]), 6),
            "beta_nhood": round(float(betas_full[4]), 6),
            "beta_school": round(float(betas_full[5]), 6),
            "r_squared": round(r2_full, 6),
        },
        "ols_race_only": {
            "intercept": round(float(betas_race_only[0]), 6),
            "beta_race": round(float(betas_race_only[1]), 6),
            "r_squared": round(r2_race_only, 6),
        },
        "n_agents": n,
        "n_majority": int(np.sum(majority_mask)),
        "n_minority": int(np.sum(minority_mask)),
    }


def compute_individual_inference(
    agents: list[Agent],
    on_progress = None,
) -> None:
    """
    For each agent, compute their perceived statistics based ONLY on
    their network neighbors' data.

    This is the key mechanism: segregated networks → biased perception.

    Updates each agent's perceived_* attributes in-place.
    """
    n = len(agents)
    batch_size = max(1, n // 5)  # Report progress every ~20% of agents

    for idx, agent in enumerate(agents):
        neighbors = agent.neighbors

        if len(neighbors) < 5:
            # Too few neighbors for meaningful inference
            agent.perceived_gini = None
            agent.perceived_race_gap = None
            agent.perceived_betas = None
            agent.perceived_r_squared = None
            continue

        # Collect neighbor data
        nb_earnings = np.array([agents[j].earnings for j in neighbors], dtype=np.float64)
        nb_race = np.array([agents[j].race for j in neighbors], dtype=np.float64)

        # Perceived Gini
        agent.perceived_gini = gini(nb_earnings)

        # Perceived race gap
        nb_majority = nb_earnings[nb_race == 1]
        nb_minority = nb_earnings[nb_race == 0]
        if len(nb_majority) > 0 and len(nb_minority) > 0:
            agent.perceived_race_gap = float(np.mean(nb_majority) - np.mean(nb_minority))
        else:
            agent.perceived_race_gap = None

        # Perceived OLS (if enough data)
        if len(neighbors) >= 20:
            nb_ability = np.array([agents[j].ability for j in neighbors], dtype=np.float64)
            nb_income = np.array([agents[j].income for j in neighbors], dtype=np.float64)
            nb_nhood = np.array([agents[j].nhood_raw for j in neighbors], dtype=np.float64)
            nb_school = np.array([agents[j].school_raw for j in neighbors], dtype=np.float64)

            X_nb = np.column_stack([nb_race, nb_ability, nb_income, nb_nhood, nb_school])
            betas, r2 = ols_coefficients(X_nb, nb_earnings)

            agent.perceived_betas = [float(b) for b in betas]
            agent.perceived_r_squared = float(r2)
        else:
            agent.perceived_betas = None
            agent.perceived_r_squared = None

        # Report progress every batch
        if on_progress and (idx + 1) % batch_size == 0:
            pct = 75 + int(15 * (idx + 1) / n)
            on_progress(f'个体推理 ({idx+1}/{n})...', pct)


def compute_aggregate_perception(agents: list[Agent]) -> dict:
    """
    Aggregate individual-level perceptions into summary statistics.

    Returns a dict comparing ground truth (god's eye) to mean perception.
    """
    # God's eye
    gods_eye = compute_gods_eye(agents)

    # Aggregate perceptions
    perceived_ginis = []
    perceived_race_gaps = []
    perceived_beta_race = []
    perceived_beta_ability = []
    perceived_r2 = []

    for a in agents:
        if a.perceived_gini is not None:
            perceived_ginis.append(a.perceived_gini)
        if a.perceived_race_gap is not None:
            perceived_race_gaps.append(a.perceived_race_gap)
        if a.perceived_betas is not None and len(a.perceived_betas) >= 6:
            perceived_beta_race.append(a.perceived_betas[1])  # beta_race
            perceived_beta_ability.append(a.perceived_betas[2])  # beta_ability
        if a.perceived_r_squared is not None:
            perceived_r2.append(a.perceived_r_squared)

    perception = {
        "mean_perceived_gini": round(float(np.mean(perceived_ginis)), 6) if perceived_ginis else None,
        "mean_perceived_race_gap": round(float(np.mean(perceived_race_gaps)), 6) if perceived_race_gaps else None,
        "mean_perceived_beta_race": round(float(np.mean(perceived_beta_race)), 6) if perceived_beta_race else None,
        "mean_perceived_beta_ability": round(float(np.mean(perceived_beta_ability)), 6) if perceived_beta_ability else None,
        "mean_perceived_r_squared": round(float(np.mean(perceived_r2)), 6) if perceived_r2 else None,
    }

    # Compute biases
    biases = {}
    if perception["mean_perceived_gini"] is not None:
        biases["gini_bias"] = round(perception["mean_perceived_gini"] - gods_eye["gini"], 6)
    if perception["mean_perceived_race_gap"] is not None and gods_eye["race_gap"] != 0:
        biases["race_gap_bias"] = round(perception["mean_perceived_race_gap"] - gods_eye["race_gap"], 6)
    if perception["mean_perceived_beta_ability"] is not None:
        biases["ability_coef_bias"] = round(
            perception["mean_perceived_beta_ability"] - gods_eye["ols_full"]["beta_ability"], 6
        )
    if perception["mean_perceived_beta_race"] is not None:
        biases["race_coef_bias"] = round(
            perception["mean_perceived_beta_race"] - gods_eye["ols_full"]["beta_race"], 6
        )

    return {
        "gods_eye": gods_eye,
        "perception_mean": perception,
        "biases": biases,
        "n_agents_with_inference": len(perceived_ginis),
    }
