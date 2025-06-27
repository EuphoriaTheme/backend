import express from 'express';
import path from 'path';
import fs from 'fs';
import yaml from 'js-yaml';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const router = express.Router();

router.get('/', (req, res) => {
  const productsPath = path.join(__dirname, '../public/products.yml');
  try {
    const file = fs.readFileSync(productsPath, 'utf8');
    const products = yaml.load(file) || [];
    res.json(products);
  } catch (e) {
    res.status(500).json({ error: 'Failed to load products.' });
  }
});

export default router;
