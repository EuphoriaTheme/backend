import path from "path";
import fs from "fs";
import { dirname } from "path";
import { fileURLToPath } from "url";
import { getRuntimeMetrics } from "../config/runtimeMetrics.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BLUEPRINT_CACHE_TTL_MS = 60000;
let blueprintStatsCache = { expiresAt: 0, extensions: [], installs: 0 };

function loadBlueprintStats() {
  if (Date.now() < blueprintStatsCache.expiresAt) {
    return blueprintStatsCache;
  }

  const blueprintPath = path.join(__dirname, "../public/blueprint.json");
  const data = JSON.parse(fs.readFileSync(blueprintPath, "utf8"));
  const extensions = Array.isArray(data)
    ? data.filter((item) => item.author?.name === "repgraphics")
    : [];
  const installs = extensions.reduce(
    (sum, ext) => sum + (ext.stats?.panels || 0),
    0,
  );

  blueprintStatsCache = {
    expiresAt: Date.now() + BLUEPRINT_CACHE_TTL_MS,
    extensions,
    installs,
  };
  return blueprintStatsCache;
}

export default async function registerStatsRoutes(app) {
  const handleStatsRequest = async () => {
    const count = app.getApiRequestCount?.() || 0;

    try {
      const blueprintStats = loadBlueprintStats();
      return {
        totalApiCalls: count,
        blueprintExtensions: blueprintStats.extensions,
        totalInstalls: blueprintStats.installs,
        runtime: getRuntimeMetrics(),
      };
    } catch {
      return {
        totalApiCalls: count,
        blueprintExtensions: [],
        totalInstalls: 0,
        error: "Failed to fetch Blueprint stats.",
      };
    }
  };

  app.get("/", handleStatsRequest);
  app.get("/index", handleStatsRequest);
}
