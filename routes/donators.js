import express from 'express';
import path from 'path';
import fs from 'fs';
import yaml from 'js-yaml';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const router = express.Router();

router.get('/', (req, res) => {
  const donatorsPath = path.join(__dirname, '../public/donators.yml');
  const donatorsDir = path.join(__dirname, '../public/donators');
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  try {
    const file = fs.readFileSync(donatorsPath, 'utf8');
    let donators = yaml.load(file) || [];
    donators = donators.map(donator => {
      let imagePath = donator.Image;
      if (imagePath) {
        const absPath = path.join(donatorsDir, path.basename(imagePath));
        if (fs.existsSync(absPath)) {
          // Remove '/public' and prepend the domain
          imagePath = `${baseUrl}/donators/${path.basename(imagePath)}`;
        } else {
          // Use a placeholder API if image file does not exist
          imagePath = `https://ui-avatars.com/api/?name=${encodeURIComponent(donator.Name)}&background=random&size=256`;
        }
      } else {
        imagePath = `https://ui-avatars.com/api/?name=${encodeURIComponent(donator.Name)}&background=random&size=256`;
      }
      return { ...donator, Image: imagePath };
    });
    res.json(donators);
  } catch (e) {
    res.status(500).json({ error: 'Failed to load donators.' });
  }
});

export default router;
