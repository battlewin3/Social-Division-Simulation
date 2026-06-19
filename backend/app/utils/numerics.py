"""
Numerical utilities: vectorized Gini coefficient, quantile cut,
and other statistical helpers used throughout the simulation.
"""

import numpy as np
from numpy.typing import NDArray


def gini(x: NDArray[np.float64]) -> float:
    """
    Compute the Gini coefficient of a 1-D array.

    Uses the standard formula on non-negative values.
    If x contains negative values (e.g. standardized data),
    applies exp() transform to produce positive values while
    preserving the Lorenz curve ordering.
    """
    x = np.asarray(x, dtype=np.float64)
    if len(x) == 0:
        return 0.0

    # If data contains negatives, transform to log-normal scale
    if np.min(x) < 0:
        x = np.exp(x)

    if np.all(x == 0) or np.sum(x) <= 1e-15:
        return 0.0

    x_sorted = np.sort(x)
    n = len(x_sorted)
    index = np.arange(1, n + 1, dtype=np.float64)
    sum_x = np.sum(x_sorted)
    if sum_x <= 1e-15:
        return 0.0
    return float((2.0 * np.sum(index * x_sorted)) / (n * sum_x) - (n + 1.0) / n)


def quantile_cut(x: NDArray[np.float64], n_groups: int = 10) -> NDArray[np.int64]:
    """
    Assign each element to a quantile-based group (1..n_groups).

    Returns an integer array of group labels (1-indexed).
    """
    x = np.asarray(x, dtype=np.float64)
    # Handle edge case: all values equal
    if np.ptp(x) == 0:
        return np.ones(len(x), dtype=np.int64)
    labels = np.arange(1, n_groups + 1)
    # Use qcut logic: assign based on rank
    ranks = np.argsort(np.argsort(x))
    out = np.floor(ranks * n_groups / len(x)).astype(np.int64) + 1
    # Clip to handle borderline cases
    return np.clip(out, 1, n_groups)


def standardized_moment(x: NDArray[np.float64], order: int = 3) -> float:
    """Skewness (order=3) or kurtosis (order=4)."""
    x = np.asarray(x, dtype=np.float64)
    mu = np.mean(x)
    sigma = np.std(x)
    if sigma == 0:
        return 0.0
    return float(np.mean(((x - mu) / sigma) ** order))


def variance_decomposition(x: NDArray[np.float64], groups: NDArray[np.int64]) -> dict:
    """
    Decompose total variance into between-group and within-group components.

    Returns dict with keys: total_var, between_var, within_var, between_share.
    """
    x = np.asarray(x, dtype=np.float64)
    groups = np.asarray(groups, dtype=np.int64)
    grand_mean = np.mean(x)
    total_ss = np.sum((x - grand_mean) ** 2)
    n = len(x)

    unique_groups = np.unique(groups)
    between_ss = 0.0
    for g in unique_groups:
        mask = groups == g
        group_mean = np.mean(x[mask])
        between_ss += np.sum(mask) * (group_mean - grand_mean) ** 2

    within_ss = total_ss - between_ss

    return {
        "total_var": float(total_ss / n),
        "between_var": float(between_ss / n),
        "within_var": float(within_ss / n),
        "between_share": float(between_ss / total_ss) if total_ss > 0 else 0.0,
    }


def weighted_mean(x: NDArray[np.float64], w: NDArray[np.float64]) -> float:
    """Weighted mean."""
    x = np.asarray(x, dtype=np.float64)
    w = np.asarray(w, dtype=np.float64)
    if w.sum() == 0:
        return float(np.mean(x))
    return float(np.sum(x * w) / np.sum(w))


def ols_coefficients(
    X: NDArray[np.float64], y: NDArray[np.float64]
) -> tuple[NDArray[np.float64], float]:
    """
    Ordinary least squares coefficients and R-squared.

    X: design matrix (n x p) — should NOT include intercept column
    y: dependent variable (n,)

    Returns (betas, r_squared) where betas includes intercept as first element.
    """
    X = np.asarray(X, dtype=np.float64)
    y = np.asarray(y, dtype=np.float64)
    n, p = X.shape

    # Add intercept
    X_design = np.column_stack([np.ones(n), X])

    # Solve normal equations
    try:
        betas = np.linalg.lstsq(X_design, y, rcond=None)[0]
    except np.linalg.LinAlgError:
        betas = np.zeros(p + 1)

    y_pred = X_design @ betas
    ss_res = np.sum((y - y_pred) ** 2)
    ss_tot = np.sum((y - np.mean(y)) ** 2)
    r_squared = float(1.0 - ss_res / ss_tot) if ss_tot > 0 else 0.0

    return betas, r_squared
