"""
FastAPI application entry point.

Provides:
- WebSocket endpoint for real-time simulation
- REST endpoints for parameter constraints, scenarios, and health check
"""

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .websocket_handler import handle_websocket
from .simulation.parameters import PARAMETER_CONSTRAINTS, SCENARIO_PRESETS

app = FastAPI(
    title=settings.APP_NAME,
    version="0.1.0",
    description="ABM社会模拟后端API — Mijs & Usmani (2024) 复现",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# === REST endpoints ===

@app.get("/api/health")
async def health_check():
    """Health check."""
    return {"status": "ok", "app": settings.APP_NAME}


@app.get("/api/constraints")
async def get_constraints():
    """Get parameter slider constraints."""
    return {"constraints": PARAMETER_CONSTRAINTS}


@app.get("/api/scenarios")
async def get_scenarios():
    """Get scenario presets."""
    result = []
    for name, config in SCENARIO_PRESETS.items():
        result.append({
            "name": name,
            "description": config["description"],
            "params": config["params"],
        })
    return {"scenarios": result}


# === WebSocket ===

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """Main WebSocket endpoint for real-time simulation."""
    await handle_websocket(websocket)


# === Startup ===

@app.on_event("startup")
async def startup_event():
    """Start background warm-up without blocking server startup."""
    import asyncio
    import time
    from .simulation.model import SimulationModel
    from .simulation.parameters import SimulationParams
    from .utils.logging import logger

    logger.info("%s v%s 启动中...", settings.APP_NAME, "0.1.0")

    async def warmup():
        """Run a warm-up simulation in background to compile JIT paths."""
        loop = asyncio.get_event_loop()
        t0 = time.perf_counter()
        await loop.run_in_executor(
            None,
            lambda: SimulationModel(SimulationParams()).run(),
        )
        t1 = time.perf_counter()
        logger.info("预热完成 — %.0fms (默认参数)", (t1 - t0) * 1000)

    # Fire-and-forget — server starts listening immediately
    asyncio.create_task(warmup())
    logger.info("%s 就绪 → ws://0.0.0.0:8000/ws", settings.APP_NAME)
