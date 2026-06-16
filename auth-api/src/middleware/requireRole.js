export function requireRole(...allowed) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'missing token' });
    if (!allowed.includes(req.user.role)) return res.status(403).json({ error: 'forbidden' });
    next();
  };
}
