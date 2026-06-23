export function requireFeature(flagName) {
  return (req, res, next) => {
    const flags = req.app?.locals?.featureFlags || {};
    if (!flags[flagName]) return res.status(404).json({ error: 'not found' });
    return next();
  };
}
1













