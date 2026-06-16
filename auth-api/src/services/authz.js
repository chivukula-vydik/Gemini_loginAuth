function userId(user) {
  return String(user.sub ?? user.id ?? user._id ?? '');
}

export function resolveRole(user, env = process.env) {
  const adminEmail = String(env.ADMIN_EMAIL || '').toLowerCase().trim();
  if (adminEmail && String(user.email || '').toLowerCase().trim() === adminEmail) return 'admin';
  return user.role || 'employee';
}

export function canViewProject(user, project) {
  if (user.role === 'admin') return true;
  const uid = userId(user);
  if (String(project.ownerPm) === uid) return true;
  return (project.members || []).some((m) => String(m) === uid);
}

export function canEditProject(user, project) {
  if (user.role === 'admin') return true;
  return user.role === 'pm' && String(project.ownerPm) === userId(user);
}

export function canCreateTask(user, project) {
  return canEditProject(user, project);
}
