import './env.js';
import { createApp } from './app.js';
import { connectDb } from './db/connect.js';
import { loadConfig } from './config/configLoader.js';
import { reconcileAbsentDays } from './services/absentReconcile.js';

const PORT = process.env.PORT || 4000;
const ONE_DAY = 24 * 60 * 60 * 1000;

async function main() {
  const config = loadConfig();
  await connectDb(process.env.MONGO_URL);
  const app = createApp(config);
  app.listen(PORT, () => console.log(`[auth-api] listening on ${PORT}`));

  reconcileAbsentDays().catch((e) => console.error('[reconcile] error:', e.message));
  setInterval(() => {
    reconcileAbsentDays().catch((e) => console.error('[reconcile] error:', e.message));
  }, ONE_DAY);
}

main().catch((err) => {
  console.error('[auth-api] fatal', err);
  process.exit(1);
});
