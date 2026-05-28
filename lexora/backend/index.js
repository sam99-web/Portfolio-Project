import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import tachesRouter      from './routes/taches.js';
import facturesRouter    from './routes/factures.js';
import planningRouter    from './routes/planning.js';
import assistantRouter   from './routes/assistant.js';
import todosRouter       from './routes/todos.js';
import clientsRouter     from './routes/clients.js';
import employesRouter    from './routes/employes.js';
import automationsRouter from './routes/automations.js';
import evenementsRouter  from './routes/evenements.js';
import documentsRouter   from './routes/documents.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

const app  = express();
const PORT = process.env.PORT || 3000;

// Sécurité : Headers HTTP
app.use(helmet());

// Sécurité : CORS strict
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map(o => o.trim());

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS bloqué pour l'origine : ${origin}`));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// Sécurité : Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requêtes, veuillez réessayer dans 15 minutes.' },
});
app.use('/api/', limiter);

app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/taches',      tachesRouter);
app.use('/api/factures',    facturesRouter);
app.use('/api/planning',    planningRouter);
app.use('/api/assistant',   assistantRouter);
app.use('/api/todos',       todosRouter);
app.use('/api/clients',     clientsRouter);
app.use('/api/employes',    employesRouter);
app.use('/api/automations', automationsRouter);
app.use('/api/evenements',  evenementsRouter);
app.use('/api/documents',   documentsRouter);

app.listen(PORT, () => {
  console.log(`Lexora backend running on port ${PORT}`);
});
