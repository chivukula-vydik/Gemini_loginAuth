import { createApp } from './app.js';
import { connectDb } from './db/connect.js';

const PORT = process.env.PORT || 4000;

async function main() {
  await connectDb(process.env.MONGO_URL);
  const app = createApp();
  app.listen(PORT, () => console.log(`[auth-api] listening on ${PORT}`));
}

main().catch((err) => {
  console.error('[auth-api] fatal', err);
  process.exit(1);
});
