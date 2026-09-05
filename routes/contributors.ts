import path from "path";
import fs from "fs";
import * as yaml from "js-yaml";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_TTL_MS = 60000;
let contributorsCache = { expiresAt: 0, contributors: [] };

function loadContributors() {
  if (Date.now() < contributorsCache.expiresAt) {
    return contributorsCache.contributors;
  }

  const contributorsPath = path.join(__dirname, "../public/contributors.yml");
  const contributorsDir = path.join(__dirname, "../public/contributors");
  const contributors = (
    yaml.load(fs.readFileSync(contributorsPath, "utf8")) || []
  ).map((contributor) => {
    const imageName = path.basename(contributor.Image || "");
    return {
      ...contributor,
      localImageName:
        imageName && fs.existsSync(path.join(contributorsDir, imageName))
          ? imageName
          : null,
    };
  });

  contributorsCache = {
    contributors,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };
  return contributors;
}

export default async function registerContributorsRoutes(app) {
  const handleContributorsRequest = async (request, reply) => {
    const baseUrl = `https://${request.headers.host || ""}`;

    try {
      return loadContributors().map(({ localImageName, ...contributor }) => {
        const imagePath = localImageName
          ? `${baseUrl}/public/contributors/${localImageName}`
          : `https://ui-avatars.com/api/?name=${encodeURIComponent(contributor.Name)}&background=random&size=256`;
        return { ...contributor, Image: imagePath };
      });
    } catch {
      return reply.code(500).send({ error: "Failed to load contributors." });
    }
  };

  app.get("/", handleContributorsRequest);
  app.get("/index", handleContributorsRequest);
}
