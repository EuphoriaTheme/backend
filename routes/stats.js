import express from 'express';
import path from 'path';
import fs from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const router = express.Router();

router.get('/', (req, res) => {
  const statsPath = path.join(__dirname, '../api_stats.json');
  let count = 0;
  if (fs.existsSync(statsPath)) {
    try {
      const stats = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
      count = stats.count || 0;
    } catch {}
  }
  res.json({ totalApiCalls: count });
});

export default router;
