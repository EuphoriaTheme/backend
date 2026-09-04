import path from "path";
import fs from "fs";
import * as yaml from "js-yaml";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default async function registerDonatorsRoutes(app) {
  const handleDonatorsRequest = async (request, reply) => {
    const donatorsPath = path.join(__dirname, "../public/donators.yml");
    const donatorsDir = path.join(__dirname, "../public/donators");
    const baseUrl = `https://${request.headers.host || ""}`;

    try {
      const file = fs.readFileSync(donatorsPath, "utf8");
      let donators = yaml.load(file) || [];
      donators = donators.map((donator) => {
        let imagePath = donator.Image;
        if (imagePath) {
          const absPath = path.join(donatorsDir, path.basename(imagePath));
          if (fs.existsSync(absPath)) {
            imagePath = `${baseUrl}/public/donators/${path.basename(imagePath)}`;
          } else {
            imagePath = `https://ui-avatars.com/api/?name=${encodeURIComponent(donator.Name)}&background=random&size=256`;
          }
        } else {
          imagePath = `https://ui-avatars.com/api/?name=${encodeURIComponent(donator.Name)}&background=random&size=256`;
        }
        return { ...donator, Image: imagePath };
      });

      return donators;
    } catch {
      return reply.code(500).send({ error: "Failed to load donators." });
    }
  };

  app.get("/", handleDonatorsRequest);
  app.get("/index", handleDonatorsRequest);
}
