const express = require("express");

const app = express();
const PORT = process.env.PORT || 8000;
const VERSION = process.env.VERSION || "dev";
const FAIL_MODE = (process.env.FAIL_MODE || "false").toLowerCase() === "true";
const LATENCY_MS = parseInt(process.env.LATENCY_MS || "0", 10);
const SERVICE_NAME = "insurance-service";

app.get("/healthz", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.get("/version", (req, res) => {
  res.status(200).json({ version: VERSION, service: SERVICE_NAME });
});

app.get("/policies", async (req, res, next) => {
  try {
    if (LATENCY_MS > 0) {
      await sleep(LATENCY_MS);
    }
    if (FAIL_MODE) {
      throw new Error("simulated failure: FAIL_MODE=true");
    }
    res.status(200).json({
      policies: [
        { type: "Auto", provider: "Finovra Auto Shield", premium: 89.5, renewalDate: "2027-01-15" },
        { type: "Home", provider: "Finovra Home Guard", premium: 145.0, renewalDate: "2026-11-02" },
      ],
    });
  } catch (err) {
    next(err);
  }
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

app.listen(PORT, () => {
  console.log(
    `${SERVICE_NAME} ${VERSION} listening on :${PORT} (FAIL_MODE=${FAIL_MODE}, LATENCY_MS=${LATENCY_MS})`
  );
});
