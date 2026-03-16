import path from 'path';
import fs from 'fs';
import yaml from 'js-yaml';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
let productsCache = null;
let productsCacheMtimeMs = 0;

function loadProducts() {
  const productsPath = path.join(__dirname, '../public/products.yml');
  const stat = fs.statSync(productsPath);

  if (productsCache && productsCacheMtimeMs === stat.mtimeMs) {
    return productsCache;
  }

  const file = fs.readFileSync(productsPath, 'utf8');
  const parsed = yaml.load(file) || [];
  productsCache = parsed;
  productsCacheMtimeMs = stat.mtimeMs;
  return parsed;
}

export default async function registerProductsRoutes(app) {
  const handleProductsRequest = async (request, reply) => {
    try {
      return loadProducts();
    } catch {
      return reply.code(500).send({ error: 'Failed to load products.' });
    }
  };

  app.get('/', handleProductsRequest);
  app.get('/index', handleProductsRequest);
}
