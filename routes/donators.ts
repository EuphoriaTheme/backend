import path from "path";
import fs from "fs";
import * as yaml from "js-yaml";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_TTL_MS = 60000;
let donatorsCache = { expiresAt: 0, donators: [] };

function loadDonators() {
  if (Date.now() < donatorsCache.expiresAt) {
    return donatorsCache.donators;
  }

  const donatorsPath = path.join(__dirname, "../public/donators.yml");
  const donatorsDir = path.join(__dirname, "../public/donators");
  const donators = (yaml.load(fs.readFileSync(donatorsPath, "utf8")) || []).map(
    (donator) => {
      const imageName = path.basename(donator.Image || "");
      return {
        ...donator,
        localImageName:
          imageName && fs.existsSync(path.join(donatorsDir, imageName))
            ? imageName
            : null,
      };
    },
  );

  donatorsCache = {
    donators,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };
  return donators;
}

export default async function registerDonatorsRoutes(app) {
  const handleDonatorsRequest = async (request, reply) => {
    const baseUrl = `https://${request.headers.host || ""}`;

    try {
      return loadDonators().map(({ localImageName, ...donator }) => {
        const imagePath = localImageName
          ? `${baseUrl}/public/donators/${localImageName}`
          : `https://ui-avatars.com/api/?name=${encodeURIComponent(donator.Name)}&background=random&size=256`;
        return { ...donator, Image: imagePath };
      });
    } catch {
      return reply.code(500).send({ error: "Failed to load donators." });
    }
  };

  app.get("/", handleDonatorsRequest);
  app.get("/index", handleDonatorsRequest);
}
