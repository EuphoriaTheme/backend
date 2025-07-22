import express from 'express';
import session from 'express-session';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// --- Logging and Stats Middleware ---
const statsFile = path.join(__dirname, 'api_stats.json');
function incrementApiCounter() {
  let stats = { count: 0 };
  if (fs.existsSync(statsFile)) {
    try { stats = JSON.parse(fs.readFileSync(statsFile, 'utf8')); } catch {}
  }
  stats.count = (stats.count || 0) + 1;
  fs.writeFileSync(statsFile, JSON.stringify(stats));
}

function logApiCall(req) {
  const now = new Date();
  const logDir = path.join(__dirname, 'logs');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  const logFile = path.join(logDir, `${now.toISOString().slice(0,10)}.log`);
  const sourceDomain = req.headers['origin'] || req.headers['referer'] || '';
  const sourceIp = req.ip || req.connection?.remoteAddress || '';
  const target = req.originalUrl;
  const body = req.body && Object.keys(req.body).length ? JSON.stringify(req.body) : null;
  const logEntry = {
    time: now.toISOString(),
    source: { domain: sourceDomain, ip: sourceIp },
    target,
    body
  };
  fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
}

app.use((req, res, next) => {
  incrementApiCounter();
  logApiCall(req);
  next();
});

app.use(session({
  secret: process.env.SESSION_SECRET || 'secret',
  resave: false,
  saveUninitialized: false
}));

// Serve static files from /public
app.use('/public', express.static(path.join(__dirname, 'public')));

import licenseRoutes from './routes/license.js';
import gameApiRoutes from './routes/gameapi.js';
import translationApiRoutes from './routes/translations.js';
import productsRoutes from './routes/products.js';
import donatorsRoutes from './routes/donators.js';
import contributorsRoutes from './routes/contributors.js';
import versionsRoutes from './routes/versions.js';
import statsRoutes from './routes/stats.js';

app.use('/license', licenseRoutes);
app.use('/gameapi', gameApiRoutes);
app.use('/translations', translationApiRoutes);
app.use('/products', productsRoutes);
app.use('/donators', donatorsRoutes);
app.use('/contributors', contributorsRoutes);
app.use('/versions', versionsRoutes);
app.use('/stats', statsRoutes);

app.get('/', (req, res) => res.send('API Running'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
