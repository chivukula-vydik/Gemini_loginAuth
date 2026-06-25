import './env.js';
import { createApp } from './app.js';
import { connectDb } from './db/connect.js';
import { loadConfig } from './config/configLoader.js';
import { reconcileAbsentDays } from './services/absentReconcile.js';

const PORT = process.env.PORT || 4000;
const ONE_DAY = 24 * 60 * 60 * 1000;

async function scheduleReconcile() {
  try {
    await reconcileAbsentDays();
  } catch (e) {
    console.error('[reconcile] error:', e.message);
  } finally {
    setTimeout(scheduleReconcile, ONE_DAY);
  }
}

async function main() {
  if (!process.env.JWT_ACCESS_SECRET || !process.env.JWT_REFRESH_SECRET) {
    console.error('[auth-api] fatal: JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be set');
    process.exit(1);
  }
  const config = loadConfig();
  await connectDb(process.env.MONGO_URL);
  const app = createApp(config);
  app.listen(PORT, () => console.log(`[auth-api] listening on ${PORT}`));

  setTimeout(scheduleReconcile, 5000);
}

main().catch((err) => {
  console.error('[auth-api] fatal', err);
  process.exit(1);
});
