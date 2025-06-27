import express from 'express';
import session from 'express-session';
import dotenv from 'dotenv';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import licenseRoutes from './routes/license.js';
import gameApiRoutes from './routes/gameapi.js';
import translationApiRoutes from './routes/translations.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(cors());

app.use(session({
  secret: process.env.SESSION_SECRET || 'secret',
  resave: false,
  saveUninitialized: false
}));

// Serve static files from /public
app.use('/public', express.static(path.join(__dirname, 'public')));

app.use('/license', licenseRoutes);
app.use('/gameapi', gameApiRoutes);
app.use('/translations', translationApiRoutes);

app.get('/', (req, res) => res.send('API Running'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
