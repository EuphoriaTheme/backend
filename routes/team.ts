import path from "path";
import fs from "fs";
import * as yaml from "js-yaml";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_TTL_MS = 60000;
let teamCache = { expiresAt: 0, team: [] };

function loadTeam() {
  if (Date.now() < teamCache.expiresAt) {
    return teamCache.team;
  }

  const teamPath = path.join(__dirname, "../public/team.yml");
  const teamDir = path.join(__dirname, "../public/team");
  const team = (yaml.load(fs.readFileSync(teamPath, "utf8")) || []).map(
    (member) => {
      const imageName = path.basename(member.Image || "");
      return {
        ...member,
        localImageName:
          imageName && fs.existsSync(path.join(teamDir, imageName))
            ? imageName
            : null,
      };
    },
  );

  teamCache = {
    team,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };
  return team;
}

export default async function registerTeamRoutes(app) {
  const handleTeamRequest = async (request, reply) => {
    const baseUrl = `https://${request.headers.host || ""}`;

    try {
      return loadTeam().map(({ localImageName, ...member }) => {
        const imagePath = localImageName
          ? `${baseUrl}/public/team/${localImageName}`
          : `https://ui-avatars.com/api/?name=${encodeURIComponent(member.Name)}&background=random&size=256`;
        return { ...member, Image: imagePath };
      });
    } catch {
      return reply.code(500).send({ error: "Failed to load team." });
    }
  };

  app.get("/", handleTeamRequest);
  app.get("/index", handleTeamRequest);
}
