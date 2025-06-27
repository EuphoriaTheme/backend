import express from 'express';
import path from 'path';
import fs from 'fs';
import yaml from 'js-yaml';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const router = express.Router();

router.get('/', (req, res) => {
  const contributorsPath = path.join(__dirname, '../public/contributors.yml');
  try {
    const file = fs.readFileSync(contributorsPath, 'utf8');
    const contributors = yaml.load(file) || [];
    res.json(contributors);
  } catch (e) {
    res.status(500).json({ error: 'Failed to load contributors.' });
  }
});

export default router;
