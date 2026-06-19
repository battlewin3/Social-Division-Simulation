"""
WebSocket handler: receives simulation parameters from frontend,
runs the simulation, and streams results back.
"""

import json
import hashlib
import asyncio
import queue
import time
from typing import Optional

from fastapi import WebSocket, WebSocketDisconnect

from .config import settings
from .simulation.model import run_simulation_from_dict
from .simulation.parameters import (
    SimulationParams,
    PARAMETER_CONSTRAINTS,
    SCENARIO_PRESETS,
)
from .simulation.sensitivity import run_sensitivity_sweep
from .utils.logging import (
    ws_subscribe,
    ws_unsubscribe,
    log_connect,
    log_disconnect,
    log_sim_start,
    log_sim_done,
    log_sim_cache,
    log_sim_error,
    log_sweep_start,
    log_sweep_done,
)


# In-memory cache: param_hash → result_json
_result_cache: dict[str, str] = {}


def _params_hash(params_dict: dict) -> str:
    """Compute a deterministic hash of parameters for caching."""
    raw = json.dumps(params_dict, sort_keys=True, default=str)
    return hashlib.sha256(raw.encode()).hexdigest()


async def _log_pump(websocket: WebSocket, log_queue) -> None:
    """Pump log entries from the queue to the WebSocket as a background task.

    log_queue is a threading.Queue (thread-safe, fed from logging threads).
    Uses non-blocking get_nowait() + asyncio.sleep() so the event loop stays
    responsive and the task is immediately cancellable.
    """
    try:
        while True:
            try:
                entry = log_queue.get_nowait()
                await websocket.send_json({"type": "log", "entry": entry})
            except queue.Empty:
                await asyncio.sleep(0.1)
    except (WebSocketDisconnect, asyncio.CancelledError, RuntimeError):
        pass


async def handle_websocket(websocket: WebSocket) -> None:
    """
    Main WebSocket connection handler.

    Message types from client:
    - {"type": "run", "params": {...}}     → run full simulation
    - {"type": "sweep", "param": "...", ...} → run sensitivity sweep
    - {"type": "get_scenarios"}            → return scenario presets
    - {"type": "get_constraints"}          → return parameter constraints
    """
    await websocket.accept()

    # Get client IP for logging
    client_ip = websocket.client.host if websocket.client else "unknown"
    log_connect(client_ip)

    # Subscribe to log stream
    log_queue = ws_subscribe()

    # Start background log pump
    pump_task = asyncio.create_task(_log_pump(websocket, log_queue))

    # Send initial handshake with available metadata
    await websocket.send_json({
        "type": "connected",
        "scenarios": _serialize_scenarios(),
        "constraints": PARAMETER_CONSTRAINTS,
    })

    try:
        while True:
            raw = await websocket.receive_text()
            message = json.loads(raw)
            msg_type = message.get("type", "")

            if msg_type == "run":
                await _handle_run(websocket, message)
            elif msg_type == "sweep":
                await _handle_sweep(websocket, message)
            elif msg_type == "get_scenarios":
                await websocket.send_json({
                    "type": "scenarios",
                    "data": _serialize_scenarios(),
                })
            elif msg_type == "get_constraints":
                await websocket.send_json({
                    "type": "constraints",
                    "data": PARAMETER_CONSTRAINTS,
                })
            elif msg_type == "health":
                await websocket.send_json({"type": "health", "status": "ok"})
            else:
                await websocket.send_json({
                    "type": "error",
                    "message": f"未知消息类型: {msg_type}",
                })

    except WebSocketDisconnect:
        log_disconnect(client_ip)
    except Exception as e:
        log_sim_error(str(e))
        try:
            await websocket.send_json({
                "type": "error",
                "message": str(e),
            })
        except Exception:
            pass
    finally:
        # Cleanup: stop log pump, unsubscribe
        pump_task.cancel()
        try:
            await pump_task
        except asyncio.CancelledError:
            pass
        ws_unsubscribe(log_queue)


async def _handle_run(websocket: WebSocket, message: dict) -> None:
    """Handle a simulation run request."""
    params_dict = message.get("params", {})

    # Merge with defaults
    defaults = SimulationParams().to_dict()
    defaults.update(params_dict)

    # Build a short summary for logging
    n = defaults.get("n_agents", "?")
    stage = defaults.get("network_stage", "?")
    log_sim_start(f"n={n}, stage={stage}")

    # Check cache
    cache_key = _params_hash(defaults)
    if cache_key in _result_cache:
        log_sim_cache(True)
        import json as _json
        cached_data = _json.loads(_result_cache[cache_key])
        await websocket.send_json({
            "type": "cached",
            "message": "返回缓存结果（相同参数5分钟内有效）",
        })
        # Wrap in the same envelope as non-cached results so the
        # frontend's 'result' handler picks it up correctly.
        await websocket.send_json({
            "type": "result",
            "data": cached_data,
        })
        return

    log_sim_cache(False)
    t0 = time.perf_counter()

    # Progress queue: worker thread pushes (phase, pct), event loop polls
    progress_queue: queue.Queue = queue.Queue()

    def on_progress(phase: str, pct: float) -> None:
        progress_queue.put(("progress", phase, pct))

    # Run simulation in thread pool to avoid blocking the event loop
    loop = asyncio.get_event_loop()
    future = loop.run_in_executor(None, run_simulation_from_dict, defaults, on_progress)

    # Poll for progress using NON-BLOCKING get_nowait() so the event loop
    # stays responsive. queue.Queue is thread-safe: the simulation thread
    # calls put(), the event-loop thread calls get_nowait().
    while not future.done():
        try:
            msg_type, phase, pct = progress_queue.get_nowait()
            if msg_type == "progress":
                await websocket.send_json({
                    "type": "progress",
                    "phase": phase,
                    "pct": pct,
                })
        except queue.Empty:
            await asyncio.sleep(0.05)

    # Drain any remaining progress messages
    while not progress_queue.empty():
        try:
            msg_type, phase, pct = progress_queue.get_nowait()
            if msg_type == "progress":
                await websocket.send_json({
                    "type": "progress",
                    "phase": phase,
                    "pct": pct,
                })
        except queue.Empty:
            break

    result = future.result()
    t1 = time.perf_counter()
    elapsed = (t1 - t0) * 1000.0

    log_sim_done(elapsed, result["meta"]["n_agents"], result["meta"]["n_edges"])

    # Serialize
    result_json = json.dumps(result, ensure_ascii=False)

    # Cache
    _result_cache[cache_key] = result_json
    # Simple cache eviction: if cache gets too large, clear oldest half
    if len(_result_cache) > 100:
        keys = list(_result_cache.keys())
        for k in keys[:50]:
            del _result_cache[k]

    # Send final 100% progress then the result
    try:
        await websocket.send_json({
            "type": "progress",
            "phase": "完成",
            "pct": 100,
        })
    except Exception:
        pass

    try:
        await websocket.send_json({"type": "result", "data": result})
    except Exception as exc:
        log_sim_error(f"无法发送结果到前端: {exc}")


async def _handle_sweep(websocket: WebSocket, message: dict) -> None:
    """Handle a sensitivity sweep request."""
    sweep_param = message.get("sweep_param", "beta_race_earnings")
    sweep_values = message.get("sweep_values", None)
    network_stages = message.get("network_stages", None)
    base_params = message.get("base_params", {})

    n_values = len(sweep_values) if sweep_values else 10
    log_sweep_start(sweep_param, n_values)

    # Send progress notification
    await websocket.send_json({
        "type": "sweep_start",
        "param": sweep_param,
    })

    t0 = time.perf_counter()

    # Run sweep
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None,
        lambda: run_sensitivity_sweep(
            sweep_param=sweep_param,
            sweep_values=sweep_values,
            network_stages=network_stages,
            base_params=base_params,
        ),
    )

    t1 = time.perf_counter()
    log_sweep_done((t1 - t0) * 1000.0)

    await websocket.send_json({
        "type": "sweep_result",
        "data": result,
    })


def _serialize_scenarios() -> list[dict]:
    """Convert scenario presets to frontend-friendly format."""
    result = []
    for name, config in SCENARIO_PRESETS.items():
        result.append({
            "name": name,
            "description": config["description"],
            "params": config["params"],
        })
    return result
