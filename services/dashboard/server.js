const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const VERSION = process.env.VERSION || "dev";
const FAIL_MODE = (process.env.FAIL_MODE || "false").toLowerCase() === "true";
const SERVICES = parseServices(process.env.SERVICES || "");

const ICONS = {
  accounts: "💰",
  investments: "📈",
  insurance: "🛡️",
  loans: "🏦",
};
const DEFAULT_ICON = "💠";

// "name:url,name2:url2" -> [{ name, url }]. Split each entry on the FIRST colon
// only, since the url itself contains colons (http://host:port).
function parseServices(raw) {
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const separatorIndex = entry.indexOf(":");
      return {
        name: entry.slice(0, separatorIndex),
        url: entry.slice(separatorIndex + 1),
      };
    });
}

async function fetchJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
  if (!response.ok) throw new Error(`unexpected status ${response.status}`);
  return response.json();
}

// Separate from "/", which is just the static page and always 200s. This is
// the endpoint deliberately capable of reporting real failure (FAIL_MODE) —
// used by Argo Rollouts canary analysis, not by the Deployment's own probes.
app.get("/healthz", (req, res) => {
  if (FAIL_MODE) {
    return res.status(500).json({ status: "fail" });
  }
  res.status(200).json({ status: "ok" });
});

// The dashboard polls each backend service server-side and exposes the result
// on a single same-origin endpoint. The browser can't resolve internal service
// DNS names (accounts-service, etc.) or call them directly without CORS, so the
// client-side poller (public/index.html) hits this endpoint instead.
app.get("/api/tiles", async (req, res) => {
  const tiles = await Promise.all(
    SERVICES.map(async ({ name, url }) => {
      const icon = ICONS[name.toLowerCase()] || DEFAULT_ICON;
      try {
        const [health, version] = await Promise.all([
          fetchJson(`${url}/healthz`),
          fetchJson(`${url}/version`),
        ]);
        const healthy = health.status === "ok";
        return {
          name,
          icon,
          healthy,
          status: healthy ? "ok" : "unreachable",
          version: version.version || null,
        };
      } catch (err) {
        return { name, icon, healthy: false, status: "unreachable", version: null };
      }
    })
  );
  res.json({ dashboardVersion: VERSION, tiles });
});

app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, () => {
  const names = SERVICES.map((s) => s.name).join(", ") || "(none)";
  console.log(`dashboard ${VERSION} listening on :${PORT}, tracking services: ${names} (FAIL_MODE=${FAIL_MODE})`);
});
