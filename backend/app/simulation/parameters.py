"""
Simulation parameters: dataclass holding all tunable parameters,
parameter constraints, and scenario presets.
"""

from dataclasses import dataclass, field
from typing import Literal

NetworkStage = Literal["random", "nhood", "school", "earnings"]


@dataclass
class SimulationParams:
    """All tunable parameters for the social simulation."""

    # === Agent population ===
    n_agents: int = 1000  # Number of agents (200-2000)
    race_dist: float = 0.36  # Proportion of minority (0.1-0.5)
    seed: int = 42  # Random seed

    # === Discrimination coefficients ===
    beta_race_income: float = 0.75  # Race -> inherited class
    beta_race_nhood: float = 0.075  # Race -> neighborhood (discrimination)
    beta_race_school: float = 0.075  # Race -> school (discrimination)
    beta_race_earnings: float = 0.075  # Race -> final earnings (discrimination)

    # === Class / ability effects ===
    beta_income_nhood: float = 1.0  # Class -> neighborhood
    beta_ability_nhood: float = 0.0  # Ability -> neighborhood
    beta_income_school: float = 0.0  # Class -> school
    beta_ability_school: float = 0.3  # Ability -> school
    beta_nhood_school: float = 1.0  # Neighborhood -> school
    beta_income_earnings: float = 0.0  # Class -> earnings
    beta_ability_earnings: float = 0.3  # Ability -> earnings
    beta_nhood_earnings: float = 0.0  # Neighborhood -> earnings
    beta_school_earnings: float = 1.0  # School -> earnings

    # === Network ===
    network_formation: str = "smallworld"  # smallworld (only supported)
    network_stage: NetworkStage = "nhood"  # Basis for network: random/nhood/school/earnings
    net_size: int = 100  # Target network size per agent
    friend_size: float = 0.8  # Rewiring probability (small-world)

    # === Stochasticity ===
    luck_sd: float = 1.0  # Standard deviation of luck/noise at each stage

    # === Processing ===
    rescale: bool = True  # Rescale continuous variables to N(0,1) after each stage

    def to_dict(self) -> dict:
        """Export parameters as a JSON-serializable dict."""
        return {
            "n_agents": self.n_agents,
            "race_dist": self.race_dist,
            "seed": self.seed,
            "beta_race_income": self.beta_race_income,
            "beta_race_nhood": self.beta_race_nhood,
            "beta_race_school": self.beta_race_school,
            "beta_race_earnings": self.beta_race_earnings,
            "beta_income_nhood": self.beta_income_nhood,
            "beta_ability_nhood": self.beta_ability_nhood,
            "beta_income_school": self.beta_income_school,
            "beta_ability_school": self.beta_ability_school,
            "beta_nhood_school": self.beta_nhood_school,
            "beta_income_earnings": self.beta_income_earnings,
            "beta_ability_earnings": self.beta_ability_earnings,
            "beta_nhood_earnings": self.beta_nhood_earnings,
            "beta_school_earnings": self.beta_school_earnings,
            "network_formation": self.network_formation,
            "network_stage": self.network_stage,
            "net_size": self.net_size,
            "friend_size": self.friend_size,
            "luck_sd": self.luck_sd,
            "rescale": self.rescale,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "SimulationParams":
        """Create params from a dict (e.g., from WebSocket JSON)."""
        valid_keys = {f.name for f in cls.__dataclass_fields__.values()}
        filtered = {k: v for k, v in d.items() if k in valid_keys}
        return cls(**filtered)


# === Parameter constraints (for UI slider ranges) ===

PARAMETER_CONSTRAINTS: dict[str, dict] = {
    "n_agents": {"min": 100, "max": 2000, "step": 50, "label": "智能体数量"},
    "race_dist": {"min": 0.05, "max": 0.50, "step": 0.01, "label": "少数群体比例"},
    "luck_sd": {"min": 0.1, "max": 3.0, "step": 0.1, "label": "运气标准差"},
    # Discrimination
    "beta_race_income": {"min": 0.0, "max": 1.5, "step": 0.01, "label": "种族→继承阶层"},
    "beta_race_nhood": {"min": 0.0, "max": 0.5, "step": 0.005, "label": "种族→社区 (住房歧视)"},
    "beta_race_school": {"min": 0.0, "max": 0.5, "step": 0.005, "label": "种族→学校 (教育歧视)"},
    "beta_race_earnings": {"min": 0.0, "max": 0.5, "step": 0.005, "label": "种族→收入 (劳动力歧视)"},
    # Class / ability
    "beta_income_nhood": {"min": 0.0, "max": 3.0, "step": 0.1, "label": "阶层→社区"},
    "beta_ability_school": {"min": 0.0, "max": 1.0, "step": 0.05, "label": "能力→学校"},
    "beta_ability_earnings": {"min": 0.0, "max": 1.0, "step": 0.05, "label": "能力→收入"},
    "beta_nhood_school": {"min": 0.0, "max": 3.0, "step": 0.1, "label": "社区→学校"},
    "beta_school_earnings": {"min": 0.0, "max": 3.0, "step": 0.1, "label": "学校→收入"},
    "beta_ability_nhood": {"min": 0.0, "max": 1.0, "step": 0.01, "label": "能力→社区"},
    "beta_income_school": {"min": 0.0, "max": 1.0, "step": 0.01, "label": "阶层→学校 (跨阶段)"},
    "beta_income_earnings": {"min": 0.0, "max": 1.0, "step": 0.01, "label": "阶层→收入 (跨阶段)"},
    "beta_nhood_earnings": {"min": 0.0, "max": 1.0, "step": 0.01, "label": "社区→收入 (跨阶段)"},
    # Network
    "net_size": {"min": 10, "max": 300, "step": 5, "label": "网络规模"},
    "friend_size": {"min": 0.1, "max": 1.0, "step": 0.05, "label": "重连概率 (小世界)"},
}


# === Scenario presets ===

SCENARIO_PRESETS: dict[str, dict] = {
    "平等理想社会": {
        "description": "无种族歧视，随机社交网络。展示完全公平社会中的不平等基线。",
        "params": {
            "beta_race_income": 0.0,
            "beta_race_nhood": 0.0,
            "beta_race_school": 0.0,
            "beta_race_earnings": 0.0,
            "network_stage": "random",
        },
    },
    "美国现状": {
        "description": "温和的种族歧视贯穿各生命阶段，基于社区的社交网络。模拟美国居住隔离下的认知偏差。",
        "params": {
            "beta_race_income": 0.75,
            "beta_race_nhood": 0.075,
            "beta_race_school": 0.075,
            "beta_race_earnings": 0.075,
            "network_stage": "nhood",
        },
    },
    "高度隔离社会": {
        "description": "强种族歧视 + 社区隔离网络。认知偏差最大化。",
        "params": {
            "beta_race_income": 0.75,
            "beta_race_nhood": 0.15,
            "beta_race_school": 0.15,
            "beta_race_earnings": 0.15,
            "network_stage": "nhood",
        },
    },
    "精英主义幻觉": {
        "description": "歧视集中在教育阶段，社交网络基于学校。展示'能力决定论'错觉。",
        "params": {
            "beta_race_income": 0.75,
            "beta_race_nhood": 0.075,
            "beta_race_school": 0.10,
            "beta_race_earnings": 0.05,
            "network_stage": "school",
        },
    },
    "阶层决定论": {
        "description": "阶层继承效应远大于种族歧视。展示阶层固化如何掩盖种族问题。",
        "params": {
            "beta_race_income": 0.75,
            "beta_race_nhood": 0.04,
            "beta_race_school": 0.04,
            "beta_race_earnings": 0.04,
            "beta_income_nhood": 2.0,
            "beta_nhood_school": 2.0,
            "beta_school_earnings": 2.0,
            "network_stage": "earnings",
        },
    },
    "种族隔离最大化": {
        "description": "所有阶段强种族歧视，基于收入分组形成网络。收入隔离 + 种族隔离叠加。",
        "params": {
            "beta_race_income": 0.75,
            "beta_race_nhood": 0.20,
            "beta_race_school": 0.20,
            "beta_race_earnings": 0.20,
            "network_stage": "earnings",
        },
    },
}
