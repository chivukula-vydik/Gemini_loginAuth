export function requireRole(...allowed) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'missing token' });
    const roles = req.user.roles || [req.user.role || 'employee'];
    if (!roles.some((r) => allowed.includes(r))) return res.status(403).json({ error: 'forbidden' });
    next();
  };
}
