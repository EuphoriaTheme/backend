import express from 'express';
import path from 'path';
import fs from 'fs';
import yaml from 'js-yaml';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { authenticateLicense } from '../middleware/auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const router = express.Router();

router.get('/', authenticateLicense, (req, res) => {
  const versionsPath = path.join(__dirname, '../public/versions.yml');
  try {
    const file = fs.readFileSync(versionsPath, 'utf8');
    const versions = yaml.load(file) || [];
    res.json(versions);
  } catch (e) {
    res.status(500).json({ error: 'Failed to load versions.' });
  }
});

export default router;
