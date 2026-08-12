import os
import time

import uvicorn
from fastapi import FastAPI

app = FastAPI()

PORT = int(os.environ.get("PORT", 8000))
VERSION = os.environ.get("VERSION", "dev")
FAIL_MODE = os.environ.get("FAIL_MODE", "false").lower() == "true"
LATENCY_MS = int(os.environ.get("LATENCY_MS", "0"))
SERVICE_NAME = "investments-service"


@app.get("/healthz")
def healthz():
    return {"status": "ok"}


@app.get("/version")
def version():
    return {"version": VERSION, "service": SERVICE_NAME}


@app.get("/portfolio")
def portfolio():
    if LATENCY_MS > 0:
        time.sleep(LATENCY_MS / 1000)
    if FAIL_MODE:
        raise RuntimeError("simulated failure: FAIL_MODE=true")
    return {
        "totalValue": 48213.55,
        "holdings": [
            {"symbol": "VTI", "shares": 120, "value": 28900.00},
            {"symbol": "AAPL", "shares": 40, "value": 9800.00},
            {"symbol": "BND", "shares": 150, "value": 9513.55},
        ],
    }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=PORT)
