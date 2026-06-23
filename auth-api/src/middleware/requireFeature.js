export function requireFeature(flagName) {
  return (req, res, next) => {
    if (!req.app.locals.featureFlags?.[flagName]) return res.status(404).json({ error: 'not found' });
    return next();
  };
}















