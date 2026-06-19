"""
Agent definition for the social simulation.

Each agent carries attributes across four life stages and maintains
a list of network neighbors for inference computation.
"""

from dataclasses import dataclass, field
from typing import Optional
import numpy as np


@dataclass
class Agent:
    """A single agent in the social simulation.

    Attributes are populated progressively across life stages.
    `_raw` suffix = continuous latent variable; `_proper` suffix = discrete group label.
    """

    agent_id: int

    # Stage 0: Initialization
    race: int = 0  # 0 = minority, 1 = majority (White)
    ability: float = 0.0  # Innate ability ~ N(0, 1)

    # Stage 1: Inherited class
    income: float = 0.0  # Inherited social class (continuous)

    # Stage 2: Neighborhood
    nhood_raw: float = 0.0  # Neighborhood quality (continuous)
    nhood_proper: int = 1  # Neighborhood group (1-10)

    # Stage 3: School
    school_raw: float = 0.0  # School quality (continuous)
    school_proper: int = 1  # School group (1-10)

    # Stage 4: Final earnings
    earnings: float = 0.0  # Final labor income (continuous)
    earnings_proper: int = 1  # Earnings group (1-10)

    # Network
    neighbors: list[int] = field(default_factory=list)  # Agent IDs of network neighbors

    # Inference (computed post-simulation)
    perceived_gini: Optional[float] = None
    perceived_race_gap: Optional[float] = None
    perceived_betas: Optional[list[float]] = None
    perceived_r_squared: Optional[float] = None

    def to_dict(self, include_inference: bool = True) -> dict:
        """Serialize agent to a JSON-compatible dict."""
        d = {
            "agent_id": self.agent_id,
            "race": self.race,
            "race_label": "多数群体" if self.race == 1 else "少数群体",
            "ability": round(self.ability, 4),
            "income": round(self.income, 4),
            "nhood_raw": round(self.nhood_raw, 4),
            "nhood_proper": self.nhood_proper,
            "school_raw": round(self.school_raw, 4),
            "school_proper": self.school_proper,
            "earnings": round(self.earnings, 4),
            "earnings_proper": self.earnings_proper,
            "neighbor_count": len(self.neighbors),
            "neighbors": self.neighbors,
        }
        if include_inference:
            d["perceived_gini"] = round(self.perceived_gini, 4) if self.perceived_gini is not None else None
            d["perceived_race_gap"] = round(self.perceived_race_gap, 4) if self.perceived_race_gap is not None else None
            d["perceived_betas"] = [round(b, 4) for b in self.perceived_betas] if self.perceived_betas else None
            d["perceived_r_squared"] = round(self.perceived_r_squared, 4) if self.perceived_r_squared is not None else None
        return d


def create_agents(
    n_agents: int,
    race_dist: float,
    rng: np.random.Generator,
) -> list[Agent]:
    """
    Initialize N agents with race and ability (Stage 0).

    Parameters
    ----------
    n_agents : int
        Number of agents to create.
    race_dist : float
        Proportion of minority group (0..1).
    rng : np.random.Generator
        Seeded random number generator.

    Returns
    -------
    list[Agent]
    """
    races = rng.binomial(1, 1.0 - race_dist, size=n_agents).astype(int)
    abilities = rng.normal(0.0, 1.0, size=n_agents)

    agents = []
    for i in range(n_agents):
        a = Agent(agent_id=i)
        a.race = int(races[i])
        a.ability = float(abilities[i])
        agents.append(a)

    return agents


def get_agent_array(agents: list[Agent], attr: str) -> np.ndarray:
    """Extract a single attribute from all agents as a NumPy array."""
    return np.array([getattr(a, attr) for a in agents], dtype=np.float64)


def get_agent_array_int(agents: list[Agent], attr: str) -> np.ndarray:
    """Extract a single integer attribute from all agents as a NumPy array."""
    return np.array([getattr(a, attr) for a in agents], dtype=np.int64)


def set_agent_array(agents: list[Agent], attr: str, values: np.ndarray) -> None:
    """Set a single attribute on all agents from a NumPy array."""
    for a, v in zip(agents, values):
        setattr(a, attr, float(v))
