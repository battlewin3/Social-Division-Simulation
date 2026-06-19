"""
Social network formation using Watts-Strogatz small-world model.

Networks can be formed based on different social spaces:
- random: completely random connections, no segregation
- nhood: agents connect within same neighborhood group
- school: agents connect within same school group
- earnings: agents connect within same earnings group
"""

import logging
import numpy as np
from numpy.typing import NDArray

from .agents import Agent
from .parameters import NetworkStage

_log = logging.getLogger("abm")


def build_social_network(
    agents: list[Agent],
    network_stage: NetworkStage,
    net_size: int,
    friend_size: float,
    rng: np.random.Generator,
    on_progress = None,
) -> None:
    """
    Build a segregated small-world network for all agents.

    The network is constructed by:
    1. Grouping agents by the social space indicated by network_stage.
    2. Connecting agents within the same group (high probability).
    3. Adding cross-group connections (low probability, controlled by friend_size).
    4. Applying Watts-Strogatz rewiring with probability friend_size.

    Parameters
    ----------
    agents : list[Agent]
        All agents (must have *_proper attributes already computed).
    network_stage : str
        Social space for grouping: 'random', 'nhood', 'school', 'earnings'.
    net_size : int
        Target number of neighbors per agent.
    friend_size : float
        Probability of rewiring an edge (small-world parameter).
        Higher = more random mixing; Lower = more clustered/segregated.
    rng : np.random.Generator
    """
    n = len(agents)
    net_size = min(net_size, n - 1, 200)  # Cap for performance

    # Determine group labels
    if network_stage == "random":
        # All agents in one group → random network
        groups = np.zeros(n, dtype=np.int64)
    elif network_stage == "nhood":
        groups = np.array([a.nhood_proper for a in agents], dtype=np.int64)
    elif network_stage == "school":
        groups = np.array([a.school_proper for a in agents], dtype=np.int64)
    elif network_stage == "earnings":
        groups = np.array([a.earnings_proper for a in agents], dtype=np.int64)
    else:
        groups = np.zeros(n, dtype=np.int64)

    unique_groups = np.unique(groups)
    n_groups = len(unique_groups)

    # Build group index: {group_id: [agent_indices]}
    group_members: dict[int, list[int]] = {g: [] for g in unique_groups}
    for i, g in enumerate(groups):
        group_members[int(g)].append(i)

    # Initialize adjacency list
    adjacency: list[set[int]] = [set() for _ in range(n)]

    # Step 1: Within-group connections (ring topology per group)
    for g in unique_groups:
        members = group_members[int(g)]
        n_g = len(members)
        if n_g < 3:
            # Fully connect small groups
            for i_idx, i in enumerate(members):
                for j in members[i_idx + 1:]:
                    adjacency[i].add(j)
                    adjacency[j].add(i)
            continue

        # Ring lattice: each agent connects to net_size//2 neighbors on each side
        # within the group
        half_k = max(1, min(net_size // 2, (n_g - 1) // 2))

        for pos, agent_idx in enumerate(members):
            for offset in range(1, half_k + 1):
                neighbor_pos = (pos + offset) % n_g
                neighbor_idx = members[neighbor_pos]
                adjacency[agent_idx].add(neighbor_idx)
                adjacency[neighbor_idx].add(agent_idx)

    if on_progress:
        on_progress('构建群内连接...', 30)

    # Step 2: Watts-Strogatz rewiring within groups
    for g in unique_groups:
        members = group_members[int(g)]
        n_g = len(members)
        if n_g < 3:
            continue

        half_k = max(1, min(net_size // 2, (n_g - 1) // 2))

        for pos, agent_idx in enumerate(members):
            for offset in range(1, half_k + 1):
                if rng.random() < friend_size:
                    neighbor_pos = (pos + offset) % n_g
                    old_neighbor = members[neighbor_pos]

                    # Remove old edge if it exists
                    if old_neighbor in adjacency[agent_idx]:
                        adjacency[agent_idx].discard(old_neighbor)
                        adjacency[old_neighbor].discard(agent_idx)

                        # Rewire to a random agent within the same group
                        # (with friend_size controlling randomness within group)
                        candidates = [m for m in members if m != agent_idx and m not in adjacency[agent_idx]]
                        if not candidates:
                            # Reconnect the original edge
                            adjacency[agent_idx].add(old_neighbor)
                            adjacency[old_neighbor].add(agent_idx)
                            continue

                        new_neighbor = int(rng.choice(candidates))
                        adjacency[agent_idx].add(new_neighbor)
                        adjacency[new_neighbor].add(agent_idx)

    # Step 3: Cross-group connections (controlled by friend_size)
    # Higher friend_size → more cross-group ties
    if on_progress:
        on_progress('构建跨群连接...', 38)

    cross_group_prob = friend_size * 0.15  # Scaled down for cross-group

    for g1_idx, g1 in enumerate(unique_groups):
        for g2 in unique_groups[g1_idx + 1:]:
            members1 = group_members[int(g1)]
            members2 = group_members[int(g2)]

            # Expected number of cross-group edges
            n_cross = max(1, int(cross_group_prob * min(len(members1), len(members2))))

            for _ in range(n_cross):
                i = int(rng.choice(members1))
                j = int(rng.choice(members2))
                if j not in adjacency[i]:
                    adjacency[i].add(j)
                    adjacency[j].add(i)

    # Store neighbors on each agent
    for i in range(n):
        agents[i].neighbors = sorted(list(adjacency[i]))

    if on_progress:
        on_progress('网络构建完成', 45)

    # Log summary
    total_edges = sum(len(adjacency[i]) for i in range(n)) // 2
    degrees = [len(adjacency[i]) for i in range(n)]
    _log.debug("   ├─ 网络组数: %d, 总边数: %d, 平均度数: %.1f (目标=%d)",
               n_groups, total_edges, float(np.mean(degrees)), net_size)


def compute_network_statistics(agents: list[Agent]) -> dict:
    """
    Compute basic network statistics for the simulation.
    """
    n = len(agents)
    neighbor_counts = np.array([len(a.neighbors) for a in agents])
    total_edges = int(neighbor_counts.sum() / 2)

    # Compute modularity (simplified: by race)
    races = np.array([a.race for a in agents])
    m = total_edges

    if m == 0:
        return {
            "total_edges": 0,
            "avg_degree": 0.0,
            "modularity_race": 0.0,
            "homophily_race": 0.0,
        }

    modularity = 0.0
    for i in range(n):
        for j in agents[i].neighbors:
            if i < j:  # Count each edge once
                same_race = 1.0 if races[i] == races[j] else 0.0
                expected = (neighbor_counts[i] * neighbor_counts[j]) / (2.0 * m)
                modularity += (same_race - expected)

    modularity /= (2.0 * m)

    # Homophily: proportion of same-race neighbors
    same_race_counts = []
    for a in agents:
        if len(a.neighbors) > 0:
            same = sum(1 for nb in a.neighbors if agents[nb].race == a.race)
            same_race_counts.append(same / len(a.neighbors))
        else:
            same_race_counts.append(0.5)

    return {
        "total_edges": total_edges,
        "avg_degree": float(np.mean(neighbor_counts)),
        "modularity_race": float(modularity),
        "homophily_race": float(np.mean(same_race_counts)),
    }
