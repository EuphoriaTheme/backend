import path from 'path';
import fs from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default async function registerStatsRoutes(app) {
  app.get('/', async () => {
    const statsPath = path.join(__dirname, '../api_stats.json');
    let count = 0;
    if (fs.existsSync(statsPath)) {
      try {
        const stats = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
        count = stats.count || 0;
      } catch {
        count = 0;
      }
    }

    try {
      const blueprintPath = path.join(__dirname, '../public/blueprint.json');
      const data = JSON.parse(fs.readFileSync(blueprintPath, 'utf8'));
      const filtered = Array.isArray(data) ? data.filter((item) => item.author?.name === 'repgraphics') : [];
      const installs = filtered.reduce((sum, ext) => sum + (ext.stats?.panels || 0), 0);
      return {
        totalApiCalls: count,
        blueprintExtensions: filtered,
        totalInstalls: installs,
      };
    } catch {
      return {
        totalApiCalls: count,
        blueprintExtensions: [],
        totalInstalls: 0,
        error: 'Failed to fetch Blueprint stats.',
      };
    }
  });
}
