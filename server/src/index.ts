import 'dotenv/config';
import express, { type Express } from 'express';
import cors from 'cors';
import { healthRouter } from './routes/health';
import { leadsRouter } from './routes/leads';

const app: Express = express();
const PORT = process.env.PORT ?? 3001;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000' }));
app.use(express.json());

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api', healthRouter);
app.use('/api/leads', leadsRouter);

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Not found' });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[server] running on http://localhost:${PORT}`);
});

export { app };
