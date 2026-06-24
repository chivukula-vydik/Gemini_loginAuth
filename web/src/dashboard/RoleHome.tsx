import { useAuth } from '../authContext';
import { HomePage } from './HomePage';
import { RMDashboard } from './RMDashboard';
import { ManagerHome } from './ManagerHome';

function primaryRole(roles: string[]): string {
  if (roles.includes('admin')) return 'admin';
  if (roles.includes('pm')) return 'pm';
  if (roles.includes('reporting_manager')) return 'reporting_manager';
  return 'employee';
}

export function RoleHome() {
  const { user } = useAuth();
  const role = primaryRole(user?.roles ?? []);
  if (role === 'reporting_manager') return <RMDashboard />;
  if (role === 'admin' || role === 'pm') return <ManagerHome />;
  return <HomePage />;
}
