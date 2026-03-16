import path from 'path';
import fs from 'fs';
import yaml from 'js-yaml';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default async function registerContributorsRoutes(app) {
  const handleContributorsRequest = async (request, reply) => {
    const contributorsPath = path.join(__dirname, '../public/contributors.yml');
    const contributorsDir = path.join(__dirname, '../public/contributors');
    const baseUrl = `https://${request.headers.host || ''}`;

    try {
      const file = fs.readFileSync(contributorsPath, 'utf8');
      let contributors = yaml.load(file) || [];
      contributors = contributors.map((contributor) => {
        let imagePath = contributor.Image;
        if (imagePath) {
          const absPath = path.join(contributorsDir, path.basename(imagePath));
          if (fs.existsSync(absPath)) {
            imagePath = `${baseUrl}/public/contributors/${path.basename(imagePath)}`;
          } else {
            imagePath = `https://ui-avatars.com/api/?name=${encodeURIComponent(contributor.Name)}&background=random&size=256`;
          }
        } else {
          imagePath = `https://ui-avatars.com/api/?name=${encodeURIComponent(contributor.Name)}&background=random&size=256`;
        }
        return { ...contributor, Image: imagePath };
      });

      return contributors;
    } catch {
      return reply.code(500).send({ error: 'Failed to load contributors.' });
    }
  };

  app.get('/', handleContributorsRequest);
  app.get('/index', handleContributorsRequest);
}