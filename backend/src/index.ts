import pg from 'pg';
import { createApp } from './app.js';

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const app = createApp(db);

const port = Number(process.env.PORT ?? 3001);
const server = app.listen(port, () => {
  console.log(`FaultDeck API listening on http://localhost:${port}`);
});

process.on('SIGTERM', () => {
  server.close(() => {
    void db.end();
  });
});
