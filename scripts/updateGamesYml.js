import fs from "fs";
import path from "path";
import https from "https";
import yaml from "js-yaml";

const GAMES_LIST_URL =
  "https://raw.githubusercontent.com/gamedig/node-gamedig/master/GAMES_LIST.md";
const OUTPUT_PATH = path.resolve("public/games.yml");

function parseGamesListMarkdown(markdown) {
  const lines = markdown.split("\n");
  const games = {};
  let inTable = false;
  for (const line of lines) {
    // Detect the start of the table
    if (line.match(/^\|\s*GameDig Type ID\s*\|\s*Name\s*\|/)) {
      inTable = true;
      continue;
    }
    // End of the table: next non-table line after table started
    if (inTable && (!line.trim().startsWith("|") || line.trim() === "")) break;
    if (inTable && line.trim().startsWith("|-")) continue;
    if (inTable && line.trim().startsWith("|")) {
      // Remove leading/trailing pipes and split
      const cols = line
        .replace(/^\||\|$/g, "")
        .split("|")
        .map((col) => col.trim());
      // Table columns: GameDig Type ID | Name | See Also
      if (
        cols.length >= 2 &&
        cols[0] &&
        cols[1] &&
        cols[0] !== "GameDig Type ID"
      ) {
        const id = cols[0];
        const name = cols[1];
        if (name && id && id !== "-") games[name] = id;
      }
    }
  }
  return games;
}

function updateGamesYml() {
  https
    .get(GAMES_LIST_URL, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        const games = parseGamesListMarkdown(data);
        const yml =
          "# GameDig Supported Games\n# Name: GameDig ID\n\n" +
          yaml.dump(games);
        fs.writeFileSync(OUTPUT_PATH, yml, "utf8");
        console.log("games.yml updated successfully!");
      });
    })
    .on("error", (err) => {
      console.error("Failed to fetch GAMES_LIST.md:", err.message);
    });
}

updateGamesYml();
