import fs from "fs";
import path from "path";
import * as yaml from "js-yaml";
import https from "https";
import sharp from "sharp";

const API_KEY = "475935e9d35926c5acdf0d87f3c07db4";
const GAMES_YML = path.resolve("public/games.yml");
const IMAGES_DIR = path.resolve("public/games");
const SEARCH_URL = "https://www.steamgriddb.com/api/v2/search/autocomplete/";
const GRIDS_URL = "https://www.steamgriddb.com/api/v2/grids/game/";
const STEAM_STORE_SEARCH_URL = "https://store.steampowered.com/api/storesearch/";
const STEAM_APP_DETAILS_URL = "https://store.steampowered.com/api/appdetails";
const CURATED_COVER_URLS = {
  ventrilo:
    "https://upload.wikimedia.org/wikipedia/commons/e/e9/Ventrilo_Windows_10.png",
  aosc: "https://images.igdb.com/igdb/image/upload/t_cover_big_2x/co976f.jpg",
  t1s: "https://images.igdb.com/igdb/image/upload/t_cover_big_2x/co2eoi.jpg",
  mutantfactions:
    "https://lutris.net/media/games/screenshots/mutantfactions018.jpg",
  netpanzer:
    "https://a.fsdn.com/con/app/proj/netpanzer.berlios/screenshots/netPanzer1.jpg/max/max/1",
  asr08:
    "https://cdn.gamebezz.com/games/games/cover/arca-sim-racing-08/arca-sim-racing-08-cover-gamebezz-com.jpg",
  bas: "https://images.igdb.com/igdb/image/upload/t_cover_big_2x/co976f.jpg",
  americasarmy:
    "https://cdn.mobygames.com/covers/3887961-americas-army-operations-front-cover.jpg",
};
const GAME_ICON_FETCH_CONCURRENCY = 20;

if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });

function fetchJSON(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers }, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode !== 200) {
            return reject(
              new Error(`HTTP ${res.statusCode}: ${data.slice(0, 100)}`),
            );
          }
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}

async function findSteamStoreCoverUrl(name) {
  const searchUrl = `${STEAM_STORE_SEARCH_URL}?term=${encodeURIComponent(name)}&cc=us&l=en`;
  const searchResult = await fetchJSON(searchUrl);
  const appId = searchResult.items?.[0]?.id;
  if (!appId) {
    return null;
  }

  const details = await fetchJSON(
    `${STEAM_APP_DETAILS_URL}?appids=${appId}&cc=us&l=en`,
  );
  const app = details[String(appId)];
  return app?.success ? app.data?.header_image || null : null;
}

function findCuratedCoverUrl(id) {
  return CURATED_COVER_URLS[String(id).toLowerCase()] || null;
}

function downloadImageAsWebp(url, dest) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "ed-api-icon-fetcher/1.0" } }, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error("Image not found"));
        }

        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", async () => {
          try {
            const webp = await sharp(Buffer.concat(chunks))
              .webp({ quality: 82, effort: 4 })
              .toBuffer();
            fs.writeFileSync(dest, webp);
            resolve();
          } catch (error) {
            reject(error);
          }
        });
      })
      .on("error", reject);
  });
}

async function main() {
  const games = yaml.load(fs.readFileSync(GAMES_YML, "utf8"));
  const pendingGames = Object.entries(games).filter(([, id]) => {
    const imagePath = path.join(IMAGES_DIR, `${id}.webp`);
    return !fs.existsSync(imagePath);
  });
  let nextGameIndex = 0;

  async function fetchGameIcon([name, id]) {
    const imagePath = path.join(IMAGES_DIR, `${id}.webp`);
    try {
      let imageUrl = null;
      let source = "SteamGridDB";
      try {
        const searchUrl = `${SEARCH_URL}${encodeURIComponent(name)}`;
        const searchRes = await fetchJSON(searchUrl, {
          Authorization: `Bearer ${API_KEY}`,
        });
        if (searchRes.success && searchRes.data.length) {
          const gameId = searchRes.data[0].id;
          const gridsRes = await fetchJSON(
            `${GRIDS_URL}${gameId}?dimensions=600x900`,
            { Authorization: `Bearer ${API_KEY}` },
          );
          imageUrl = gridsRes.success ? gridsRes.data[0]?.url : null;
        }
      } catch {
        // Steam Store is the credential-free fallback for unavailable SGDB data.
      }

      if (!imageUrl) {
        try {
          imageUrl = await findSteamStoreCoverUrl(name);
          source = "Steam Store";
        } catch {
          // Curated artwork is the final fallback for delisted and freeware titles.
        }
      }
      if (!imageUrl) {
        imageUrl = findCuratedCoverUrl(id);
        source = "curated fallback";
      }
      if (!imageUrl) {
        throw new Error(
          "No cover art found in SteamGridDB, Steam Store, or curated fallbacks",
        );
      }

      await downloadImageAsWebp(imageUrl, imagePath);
      console.log(`Downloaded WebP cover art for ${name} (${id}) from ${source}`);
    } catch (e) {
      console.log(`No cover art for ${name} (${id}): ${e.message}`);
    }
  }

  async function worker() {
    while (nextGameIndex < pendingGames.length) {
      const game = pendingGames[nextGameIndex];
      nextGameIndex += 1;
      await fetchGameIcon(game);
    }
  }

  const workerCount = Math.min(
    GAME_ICON_FETCH_CONCURRENCY,
    pendingGames.length,
  );
  console.log(
    `Fetching ${pendingGames.length} game icons with ${workerCount} concurrent workers.`,
  );
  await Promise.all(Array.from({ length: workerCount }, worker));
}

main();
