import { readFileSync } from 'node:fs';

const VALID_IDS = ['local', 'google', 'saml'];

// Replace any "env:NAME" string value with process.env.NAME.
function resolveEnv(value) {
  if (typeof value === 'string' && value.startsWith('env:')) {
    return process.env[value.slice(4)] || '';
  }
  return value;
}

function resolveBlock(block) {
  const out = {};
  for (const [k, v] of Object.entries(block)) out[k] = resolveEnv(v);
  return out;
}

export function loadConfig(path = process.env.AUTH_CONFIG_PATH || 'auth.config.json') {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  if (!raw.providers || typeof raw.providers !== 'object') {
    throw new Error('[config] missing "providers" object');
  }

  const enabled = [];
  for (const [id, block] of Object.entries(raw.providers)) {
    if (!VALID_IDS.includes(id)) throw new Error(`[config] unknown provider "${id}"`);
    if (!block.enabled) continue;
    const resolved = resolveBlock(block);
    validateProvider(id, resolved);
    enabled.push({ id, ...resolved });
  }
  if (enabled.length === 0) throw new Error('[config] no providers enabled');
  return { enabled };
}

function validateProvider(id, c) {
  const need = (keys) => keys.forEach((k) => {
    if (!c[k]) throw new Error(`[config] provider "${id}" missing required "${k}" (check env vars)`);
  });
  if (id === 'google') need(['clientID', 'clientSecret', 'callbackURL']);
  if (id === 'saml') need(['entryPoint', 'issuer', 'callbackURL', 'cert']);
}
