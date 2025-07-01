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
  const contributorsDir = path.join(__dirname, '../public/contributors');
  try {
    const file = fs.readFileSync(contributorsPath, 'utf8');
    let contributors = yaml.load(file) || [];
    contributors = contributors.map(contributor => {
      let imagePath = contributor.Image;
      if (imagePath) {
        const absPath = path.join(contributorsDir, path.basename(imagePath));
        if (!fs.existsSync(absPath)) {
          // Use a placeholder API (ui-avatars.com) if image file does not exist
          imagePath = `https://ui-avatars.com/api/?name=${encodeURIComponent(contributor.Name)}&background=random&size=256`;
        }
      } else {
        imagePath = `https://ui-avatars.com/api/?name=${encodeURIComponent(contributor.Name)}&background=random&size=256`;
      }
      return { ...contributor, Image: imagePath };
    });
    res.json(contributors);
  } catch (e) {
    res.status(500).json({ error: 'Failed to load contributors.' });
  }
});

export default router;
