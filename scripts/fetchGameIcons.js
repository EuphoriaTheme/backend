import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import https from 'https';

const API_KEY = '475935e9d35926c5acdf0d87f3c07db4';
const GAMES_YML = path.resolve('public/games.yml');
const IMAGES_DIR = path.resolve('public/games');
const SEARCH_URL = 'https://www.steamgriddb.com/api/v2/search/autocomplete/';
const ICONS_URL = 'https://www.steamgriddb.com/api/v2/icons/game/';

if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });

function fetchJSON(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 100)}`));
        }
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

function downloadImage(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        return reject(new Error('Image not found'));
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', (err) => {
      file.close();
      fs.unlinkSync(dest);
      reject(err);
    });
  });
}

async function main() {
  const games = yaml.load(fs.readFileSync(GAMES_YML, 'utf8'));
  for (const [name, id] of Object.entries(games)) {
    const imagePath = path.join(IMAGES_DIR, `${id}.png`);
    if (fs.existsSync(imagePath)) continue;
    try {
      // 1. Search for the game
      const searchUrl = `${SEARCH_URL}${encodeURIComponent(name)}`;
      const searchRes = await fetchJSON(searchUrl, { 'Authorization': `Bearer ${API_KEY}` });
      if (!searchRes.success || !searchRes.data.length) throw new Error('No SGDB match');
      const gameId = searchRes.data[0].id;
      // 2. Get icons for the game
      const iconsRes = await fetchJSON(`${ICONS_URL}${gameId}`, { 'Authorization': `Bearer ${API_KEY}` });
      if (!iconsRes.success || !iconsRes.data.length) throw new Error('No icon found');
      // 3. Download the first icon
      await downloadImage(iconsRes.data[0].url, imagePath);
      console.log(`Downloaded icon for ${name} (${id})`);
    } catch (e) {
      console.log(`No icon for ${name} (${id}): ${e.message}`);
    }
  }
}

main();