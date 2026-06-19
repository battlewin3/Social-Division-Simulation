"""
Life-stage transition functions for the social simulation.

Each function takes the agent list + parameters and updates agent attributes
in-place using vectorized NumPy operations.
"""

import numpy as np
from numpy.typing import NDArray

from .agents import Agent, get_agent_array, set_agent_array
from .parameters import SimulationParams
from ..utils.numerics import quantile_cut


def rescale_to_unit_normal(x: NDArray[np.float64]) -> NDArray[np.float64]:
    """Rescale array to mean 0, std 1."""
    std = np.std(x)
    if std < 1e-12:
        return np.zeros_like(x)
    return (x - np.mean(x)) / std


def run_stage_1_inherited_class(
    agents: list[Agent],
    params: SimulationParams,
    rng: np.random.Generator,
) -> None:
    """
    Stage 1: Inherited social class (income).

    income_i = beta_race_income * race_i + N(0, luck_sd^2)

    The resulting income is rescaled to N(0,1) if params.rescale is True.
    """
    race_arr = get_agent_array(agents, "race")
    n = len(agents)
    luck = rng.normal(0.0, params.luck_sd, size=n)

    income = params.beta_race_income * race_arr + luck

    if params.rescale:
        income = rescale_to_unit_normal(income)

    set_agent_array(agents, "income", income)


def run_stage_2_neighborhood(
    agents: list[Agent],
    params: SimulationParams,
    rng: np.random.Generator,
) -> None:
    """
    Stage 2: Neighborhood assignment.

    nhood_raw_i = beta_income_nhood * income_i + beta_race_nhood * race_i
                + beta_ability_nhood * ability_i + N(0, luck_sd^2)

    nhood_proper_i = quantile_cut(nhood_raw_i, 10)
    """
    race_arr = get_agent_array(agents, "race")
    income_arr = get_agent_array(agents, "income")
    ability_arr = get_agent_array(agents, "ability")
    n = len(agents)
    luck = rng.normal(0.0, params.luck_sd, size=n)

    nhood_raw = (
        params.beta_income_nhood * income_arr
        + params.beta_race_nhood * race_arr
        + params.beta_ability_nhood * ability_arr
        + luck
    )

    if params.rescale:
        nhood_raw = rescale_to_unit_normal(nhood_raw)

    nhood_proper = quantile_cut(nhood_raw, 10)

    set_agent_array(agents, "nhood_raw", nhood_raw)
    for a, v in zip(agents, nhood_proper):
        a.nhood_proper = int(v)


def run_stage_3_school(
    agents: list[Agent],
    params: SimulationParams,
    rng: np.random.Generator,
) -> None:
    """
    Stage 3: School assignment.

    school_raw_i = beta_nhood_school * nhood_raw_i + beta_ability_school * ability_i
                 + beta_race_school * race_i + beta_income_school * income_i
                 + N(0, luck_sd^2)

    school_proper_i = quantile_cut(school_raw_i, 10)
    """
    race_arr = get_agent_array(agents, "race")
    income_arr = get_agent_array(agents, "income")
    ability_arr = get_agent_array(agents, "ability")
    nhood_raw_arr = get_agent_array(agents, "nhood_raw")
    n = len(agents)
    luck = rng.normal(0.0, params.luck_sd, size=n)

    school_raw = (
        params.beta_nhood_school * nhood_raw_arr
        + params.beta_ability_school * ability_arr
        + params.beta_race_school * race_arr
        + params.beta_income_school * income_arr
        + luck
    )

    if params.rescale:
        school_raw = rescale_to_unit_normal(school_raw)

    school_proper = quantile_cut(school_raw, 10)

    set_agent_array(agents, "school_raw", school_raw)
    for a, v in zip(agents, school_proper):
        a.school_proper = int(v)


def run_stage_4_earnings(
    agents: list[Agent],
    params: SimulationParams,
    rng: np.random.Generator,
) -> None:
    """
    Stage 4: Final labor earnings.

    earnings_i = beta_school_earnings * school_raw_i + beta_ability_earnings * ability_i
               + beta_race_earnings * race_i + beta_nhood_earnings * nhood_raw_i
               + beta_income_earnings * income_i + N(0, luck_sd^2)

    earnings_proper_i = quantile_cut(earnings_i, 10)
    """
    race_arr = get_agent_array(agents, "race")
    income_arr = get_agent_array(agents, "income")
    ability_arr = get_agent_array(agents, "ability")
    nhood_raw_arr = get_agent_array(agents, "nhood_raw")
    school_raw_arr = get_agent_array(agents, "school_raw")
    n = len(agents)
    luck = rng.normal(0.0, params.luck_sd, size=n)

    earnings = (
        params.beta_school_earnings * school_raw_arr
        + params.beta_ability_earnings * ability_arr
        + params.beta_race_earnings * race_arr
        + params.beta_nhood_earnings * nhood_raw_arr
        + params.beta_income_earnings * income_arr
        + luck
    )

    if params.rescale:
        earnings = rescale_to_unit_normal(earnings)

    earnings_proper = quantile_cut(earnings, 10)

    set_agent_array(agents, "earnings", earnings)
    for a, v in zip(agents, earnings_proper):
        a.earnings_proper = int(v)


def run_all_stages(
    agents: list[Agent],
    params: SimulationParams,
    rng: np.random.Generator,
) -> None:
    """Execute all four life stages in sequence."""
    import logging
    _log = logging.getLogger("abm")
    import time

    t0 = time.perf_counter()
    run_stage_1_inherited_class(agents, params, rng)
    _log.debug("   ├─ 阶段 1/4 继承阶层 (β_race=%.2f, luck_sd=%.2f) — %.0fms",
               params.beta_race_income, params.luck_sd,
               (time.perf_counter() - t0) * 1000)

    t1 = time.perf_counter()
    run_stage_2_neighborhood(agents, params, rng)
    _log.debug("   ├─ 阶段 2/4 社区分配 (β_race=%.3f, β_income=%.1f, β_ability=%.1f) — %.0fms",
               params.beta_race_nhood, params.beta_income_nhood, params.beta_ability_nhood,
               (time.perf_counter() - t1) * 1000)

    t2 = time.perf_counter()
    run_stage_3_school(agents, params, rng)
    _log.debug("   ├─ 阶段 3/4 学校分配 (β_race=%.3f, β_nhood=%.1f, β_ability=%.2f) — %.0fms",
               params.beta_race_school, params.beta_nhood_school, params.beta_ability_school,
               (time.perf_counter() - t2) * 1000)

    t3 = time.perf_counter()
    run_stage_4_earnings(agents, params, rng)
    _log.debug("   └─ 阶段 4/4 劳动收入 (β_race=%.3f, β_school=%.1f, β_ability=%.2f) — %.0fms",
               params.beta_race_earnings, params.beta_school_earnings, params.beta_ability_earnings,
               (time.perf_counter() - t3) * 1000)
