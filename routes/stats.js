import express from 'express';
import path from 'path';
import fs from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

const __dirname = dirname(fileURLToPath(import.meta.url));
const router = express.Router();

router.get('/', async (req, res) => {
  // Local API stats
  const statsPath = path.join(__dirname, '../api_stats.json');
  let count = 0;
  if (fs.existsSync(statsPath)) {
    try {
      const stats = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
      count = stats.count || 0;
    } catch {}
  }

  // External API stats
  try {
    const { data } = await axios.get('https://api.blueprintframe.work/api/extensions');
    // Filter by author.name === 'repgraphics'
    const filtered = Array.isArray(data) ? data.filter(item => item.author?.name === 'repgraphics') : [];
    // Sum up stats.panels for all filtered extensions
    const installs = filtered.reduce((sum, ext) => sum + (ext.stats?.panels || 0), 0);
    res.json({
      totalApiCalls: count,
      blueprintExtensions: filtered,
      totalInstalls: installs
    });
  } catch (err) {
    res.json({
      totalApiCalls: count,
      blueprintExtensions: [],
      totalInstalls: 0,
      error: 'Failed to fetch external stats.'
    });
  }
});

export default router;
