"""
Structured logging for the ABM simulation backend.

Logs to both stderr (for terminal visibility) and an in-memory queue
for streaming to connected WebSocket clients.
"""

import logging
import sys
import time
import json
from datetime import datetime, timezone
from typing import Optional
import asyncio
import queue as _threading_queue  # thread-safe queue for cross-thread log transport

# ---------------------------------------------------------------------------
# Logger setup
# ---------------------------------------------------------------------------

_log_format = "%(asctime)s | %(levelname)-7s | %(name)s | %(message)s"
_date_format = "%H:%M:%S"

logger = logging.getLogger("abm")
logger.setLevel(logging.DEBUG)

# Console handler (stderr)
_console = logging.StreamHandler(sys.stderr)
_console.setLevel(logging.DEBUG)
_console.setFormatter(logging.Formatter(_log_format, _date_format))
logger.addHandler(_console)

# ---------------------------------------------------------------------------
# WebSocket broadcast
# ---------------------------------------------------------------------------

# List of threading.Queue instances — one per connected WebSocket client.
# We use queue.Queue (thread-safe) instead of asyncio.Queue because
# logging handlers can be invoked from ANY thread, and asyncio.Queue
# is NOT thread-safe. The _log_pump async task dequeues items via
# run_in_executor to bridge back to the event loop safely.
_ws_queues: list[_threading_queue.Queue] = []


def _ws_formatter(record: logging.LogRecord) -> dict:
    return {
        "t": datetime.now(timezone.utc).strftime("%H:%M:%S"),
        "level": record.levelname.lower(),
        "name": record.name,
        "msg": record.getMessage(),
    }


class _WSHandler(logging.Handler):
    """Pushes log records into registered threading queues (thread-safe)."""

    def emit(self, record: logging.LogRecord) -> None:
        try:
            data = _ws_formatter(record)
            for q in _ws_queues:
                try:
                    q.put_nowait(data)
                except _threading_queue.Full:
                    pass  # drop if client is too slow
        except Exception:
            pass


_ws_handler = _WSHandler()
_ws_handler.setLevel(logging.DEBUG)
logger.addHandler(_ws_handler)


def ws_subscribe() -> _threading_queue.Queue:
    """Register a new WebSocket client and return its log queue (max 200 entries).

    Returns a threading.Queue (NOT asyncio.Queue) — the caller must use
    run_in_executor to dequeue items without blocking the event loop.
    """
    q: _threading_queue.Queue = _threading_queue.Queue(maxsize=200)
    _ws_queues.append(q)
    return q


def ws_unsubscribe(q: _threading_queue.Queue) -> None:
    """Remove a WebSocket client's log queue."""
    if q in _ws_queues:
        _ws_queues.remove(q)


# ---------------------------------------------------------------------------
# Convenience helpers
# ---------------------------------------------------------------------------

def log_connect(client_ip: str) -> None:
    logger.info("WebSocket 连接: %s", client_ip)


def log_disconnect(client_ip: str) -> None:
    logger.info("WebSocket 断开: %s", client_ip)


def log_sim_start(params_summary: str) -> None:
    logger.info("模拟开始 — %s", params_summary)


def log_sim_done(runtime_ms: float, n_agents: int, n_edges: int) -> None:
    logger.info("模拟完成 — %.0fms, %d agents, %d edges", runtime_ms, n_agents, n_edges)


def log_sim_cache(hit: bool) -> None:
    if hit:
        logger.info("缓存命中 — 直接返回结果")


def log_sim_error(error: str) -> None:
    logger.error("模拟错误 — %s", error)


def log_sweep_start(param: str, n_values: int) -> None:
    logger.info("灵敏度扫描开始 — %s (%d 个值)", param, n_values)


def log_sweep_done(runtime_ms: float) -> None:
    logger.info("灵敏度扫描完成 — %.0fms", runtime_ms)
