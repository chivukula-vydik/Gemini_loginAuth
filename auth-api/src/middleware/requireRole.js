const ROLE_ALIASES = {
  director: 'executive',
  vp: 'executive',
};

function normalizeRoles(roles) {
  const result = new Set(roles);
  for (const r of roles) {
    const alias = ROLE_ALIASES[r];
    if (alias) result.add(alias);
  }
  return [...result];
}

export function requireRole(...allowed) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'missing token' });
    const raw = req.user.roles || [req.user.role || 'employee'];
    const roles = normalizeRoles(raw);
    req.user.roles = roles;
    if (!roles.some((r) => allowed.includes(r))) return res.status(403).json({ error: 'forbidden' });
    next();
  };
}
