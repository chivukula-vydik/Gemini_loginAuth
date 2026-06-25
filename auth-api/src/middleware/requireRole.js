// Maps elevated roles to the base roles they inherit access from.
// e.g. a 'director' can do anything an 'admin' or 'pm' can do.
const ROLE_INHERITS = {
  vp:           ['admin', 'pm', 'reporting_manager'],
  director:     ['admin', 'pm', 'reporting_manager'],
  hr:           ['admin', 'reporting_manager'],
  team_lead:    ['reporting_manager'],
  finance:      ['pm'],
};

function expandRoles(roles) {
  const expanded = new Set(roles);
  for (const r of roles) {
    const inherits = ROLE_INHERITS[r];
    if (inherits) for (const ir of inherits) expanded.add(ir);
  }
  return [...expanded];
}

export function requireRole(...allowed) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'missing token' });
    const raw = req.user.roles || [req.user.role || 'employee'];
    const roles = expandRoles(raw);
    req.user.roles = roles;
    if (!roles.some((r) => allowed.includes(r))) return res.status(403).json({ error: 'forbidden' });
    next();
  };
}
