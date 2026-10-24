import express from 'express';

const app = express();

app.get('/health', (_request, response) => {
  response.json({ status: 'ok' });
});

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => {
  console.log(`FaultDeck API listening on http://localhost:${port}`);
});
