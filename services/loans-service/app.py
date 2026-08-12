import os
import time

import uvicorn
from fastapi import FastAPI

app = FastAPI()

PORT = int(os.environ.get("PORT", 8000))
VERSION = os.environ.get("VERSION", "dev")
FAIL_MODE = os.environ.get("FAIL_MODE", "false").lower() == "true"
LATENCY_MS = int(os.environ.get("LATENCY_MS", "0"))
SERVICE_NAME = "loans-service"


@app.get("/healthz")
def healthz():
    return {"status": "ok"}


@app.get("/version")
def version():
    return {"version": VERSION, "service": SERVICE_NAME}


@app.get("/loans")
def loans():
    if LATENCY_MS > 0:
        time.sleep(LATENCY_MS / 1000)
    if FAIL_MODE:
        raise RuntimeError("simulated failure: FAIL_MODE=true")
    return {
        "balance": 18420.00,
        "nextPaymentDate": "2026-09-01",
        "nextPaymentAmount": 412.50,
    }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=PORT)
