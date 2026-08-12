const express = require("express");

const app = express();
const PORT = process.env.PORT || 8000;
const VERSION = process.env.VERSION || "dev";
const FAIL_MODE = (process.env.FAIL_MODE || "false").toLowerCase() === "true";
const LATENCY_MS = parseInt(process.env.LATENCY_MS || "0", 10);
const SERVICE_NAME = "accounts-service";

app.get("/healthz", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.get("/version", (req, res) => {
  res.status(200).json({ version: VERSION, service: SERVICE_NAME });
});

app.get("/account", async (req, res, next) => {
  try {
    if (LATENCY_MS > 0) {
      await sleep(LATENCY_MS);
    }
    if (FAIL_MODE) {
      throw new Error("simulated failure: FAIL_MODE=true");
    }
    res.status(200).json({
      balance: 8452.17,
      currency: "USD",
      transactions: [
        { date: "2026-08-10", description: "Whole Foods Market", amount: -84.23 },
        { date: "2026-08-08", description: "Payroll Deposit", amount: 3200.0 },
        { date: "2026-08-05", description: "Netflix Subscription", amount: -15.99 },
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
