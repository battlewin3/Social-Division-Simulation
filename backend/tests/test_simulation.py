"""
Tests for the simulation engine.

Run with: python -m pytest backend/tests/ -v
"""

import pytest
import numpy as np
from app.simulation.parameters import SimulationParams
from app.simulation.agents import create_agents, get_agent_array
from app.simulation.stages import (
    run_stage_1_inherited_class,
    run_stage_2_neighborhood,
    run_stage_3_school,
    run_stage_4_earnings,
    run_all_stages,
)
from app.simulation.network import build_social_network, compute_network_statistics
from app.simulation.inference import (
    compute_gods_eye,
    compute_individual_inference,
    compute_aggregate_perception,
)
from app.simulation.model import SimulationModel
from app.utils.numerics import gini, quantile_cut, variance_decomposition, ols_coefficients


class TestNumerics:
    def test_gini_perfect_equality(self):
        x = np.ones(100)
        assert gini(x) == 0.0

    def test_gini_perfect_inequality(self):
        x = np.array([0] * 99 + [100])
        assert gini(x) > 0.95

    def test_quantile_cut(self):
        x = np.arange(100, dtype=np.float64)
        labels = quantile_cut(x, 10)
        assert set(labels) == set(range(1, 11))
        # Check roughly equal group sizes
        _, counts = np.unique(labels, return_counts=True)
        assert all(8 <= c <= 12 for c in counts)

    def test_variance_decomposition(self):
        x = np.array([-1, -0.5, 0, 0.5, 1.0])
        groups = np.array([0, 0, 1, 1, 1])
        result = variance_decomposition(x, groups)
        assert 0 <= result["between_share"] <= 1.0

    def test_ols_coefficients(self):
        rng = np.random.default_rng(42)
        X = rng.normal(0, 1, (100, 3))
        true_betas = np.array([1.0, 2.0, -0.5])
        y = true_betas @ X.T + rng.normal(0, 0.1, 100)
        betas, r2 = ols_coefficients(X, y)
        assert len(betas) == 4  # intercept + 3 features
        assert r2 > 0.9


class TestAgents:
    def test_create_agents(self):
        rng = np.random.default_rng(99)
        agents = create_agents(n_agents=100, race_dist=0.36, rng=rng)
        assert len(agents) == 100
        races = get_agent_array(agents, "race")
        minority_share = 1.0 - np.mean(races)
        assert 0.25 < minority_share < 0.50


class TestStages:
    @pytest.fixture
    def default_agents(self):
        rng = np.random.default_rng(123)
        return create_agents(n_agents=500, race_dist=0.36, rng=rng)

    @pytest.fixture
    def default_params(self):
        return SimulationParams(seed=123)

    def test_stage_1(self, default_agents, default_params):
        rng = np.random.default_rng(123)
        run_stage_1_inherited_class(default_agents, default_params, rng)
        income = get_agent_array(default_agents, "income")
        assert abs(np.mean(income)) < 0.1  # Should be approximately standardized
        # Majority should have higher income on average
        race = get_agent_array(default_agents, "race")
        majority_income = income[race == 1].mean()
        minority_income = income[race == 0].mean()
        assert majority_income > minority_income  # Due to beta_race_income > 0

    def test_stage_2(self, default_agents, default_params):
        rng = np.random.default_rng(123)
        run_stage_1_inherited_class(default_agents, default_params, rng)
        run_stage_2_neighborhood(default_agents, default_params, rng)
        nhood = get_agent_array(default_agents, "nhood_raw")
        assert abs(np.mean(nhood)) < 0.1
        for a in default_agents:
            assert 1 <= a.nhood_proper <= 10

    def test_full_pipeline(self, default_agents, default_params):
        rng = np.random.default_rng(123)
        run_all_stages(default_agents, default_params, rng)
        earnings = get_agent_array(default_agents, "earnings")
        assert abs(np.mean(earnings)) < 0.1
        assert np.std(earnings) > 0.5
        for a in default_agents:
            assert 1 <= a.earnings_proper <= 10


class TestNetwork:
    @pytest.fixture
    def staged_agents(self):
        rng = np.random.default_rng(42)
        params = SimulationParams(seed=42, n_agents=200)
        agents = create_agents(n_agents=200, race_dist=0.36, rng=rng)
        run_all_stages(agents, params, rng)
        return agents, params, rng

    def test_network_build(self, staged_agents):
        agents, params, rng = staged_agents
        build_social_network(agents, params.network_stage, params.net_size, params.friend_size, rng)
        degrees = [len(a.neighbors) for a in agents]
        assert all(d > 0 for d in degrees)
        assert np.mean(degrees) > 0

    def test_network_stats(self, staged_agents):
        agents, params, rng = staged_agents
        build_social_network(agents, params.network_stage, params.net_size, params.friend_size, rng)
        stats = compute_network_statistics(agents)
        assert "modularity_race" in stats
        assert "homophily_race" in stats


class TestInference:
    @pytest.fixture
    def full_agents(self):
        rng = np.random.default_rng(42)
        params = SimulationParams(seed=42, n_agents=300)
        agents = create_agents(n_agents=300, race_dist=0.36, rng=rng)
        run_all_stages(agents, params, rng)
        build_social_network(agents, params.network_stage, params.net_size, params.friend_size, rng)
        return agents

    def test_gods_eye(self, full_agents):
        result = compute_gods_eye(full_agents)
        assert result["gini"] > 0
        assert "ols_full" in result

    def test_individual_inference(self, full_agents):
        compute_individual_inference(full_agents)
        agents_with_inference = sum(1 for a in full_agents if a.perceived_gini is not None)
        assert agents_with_inference > 100

    def test_aggregate_perception(self, full_agents):
        compute_individual_inference(full_agents)
        result = compute_aggregate_perception(full_agents)
        assert "gods_eye" in result
        assert "biases" in result


class TestSimulationModel:
    def test_full_run(self):
        params = SimulationParams(n_agents=200, seed=1)
        model = SimulationModel(params)
        model.run()
        results = model.get_results()
        assert "meta" in results
        assert "agents" in results
        assert len(results["agents"]) == 200
        assert "network" in results
        assert len(results["network"]["nodes"]) == 200
        assert "gods_eye" in results
        assert "perception" in results

    def test_deterministic(self):
        p1 = SimulationParams(seed=42, n_agents=100)
        p2 = SimulationParams(seed=42, n_agents=100)
        m1 = SimulationModel(p1)
        m1.run()
        r1 = m1.get_results()
        m2 = SimulationModel(p2)
        m2.run()
        r2 = m2.get_results()
        assert r1["gods_eye"]["gini"] == r2["gods_eye"]["gini"]

    def test_different_seeds_different_results(self):
        p1 = SimulationParams(seed=1, n_agents=500)
        p2 = SimulationParams(seed=2, n_agents=500)
        m1 = SimulationModel(p1); m1.run()
        m2 = SimulationModel(p2); m2.run()
        # Earnings should differ (stochastic)
        e1 = np.array([a.earnings for a in m1.agents])
        e2 = np.array([a.earnings for a in m2.agents])
        assert not np.allclose(e1, e2)
