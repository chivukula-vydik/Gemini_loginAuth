function userId(user) {
  return String(user.sub ?? user.id ?? user._id ?? '');
}

function userRoles(user) {
  return user.roles?.length ? user.roles : [user.role || 'employee'];
}

export function resolveRoles(user, env = process.env) {
  const adminEmail = String(env.ADMIN_EMAIL || '').toLowerCase().trim();
  const roles = [...(user.roles?.length ? user.roles : [user.role || 'employee'])];
  if (adminEmail && String(user.email || '').toLowerCase().trim() === adminEmail && !roles.includes('admin')) {
    roles.unshift('admin');
  }
  return roles;
}

export function canViewProject(user, project) {
  const roles = userRoles(user);
  if (roles.includes('admin')) return true;
  const uid = userId(user);
  if (String(project.ownerPm) === uid) return true;
  return (project.members || []).some((m) => String(m) === uid);
}

export function canEditProject(user, project) {
  const roles = userRoles(user);
  if (roles.includes('admin')) return true;
  return roles.includes('pm') && String(project.ownerPm) === userId(user);
}

export function canCreateTask(user, project) {
  return canEditProject(user, project);
}

export function canLogProgress(user, task) {
  const uid = userId(user);
  return Array.isArray(task.assignees) && task.assignees.some((a) => String(a.user) === uid);
}
