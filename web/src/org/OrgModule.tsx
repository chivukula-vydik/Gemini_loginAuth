import { useState } from 'react';
import { useAuth } from '../authContext';
import { OrgOverview } from './OrgOverview';
import { OrgTree } from './OrgTree';
import { OrgDirectory } from './OrgDirectory';
import { OrgLegalEntities } from './OrgLegalEntities';
import { OrgBusinessUnits } from './OrgBusinessUnits';
import { OrgDepartments } from './OrgDepartments';
import { OrgLocations } from './OrgLocations';
import { OrgDesignations } from './OrgDesignations';

type Tab = 'overview' | 'tree' | 'employees' | 'legal-entities' | 'business-units' | 'departments' | 'locations' | 'designations';

const ALL_TABS: { key: Tab; label: string; adminOnly?: boolean }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'tree', label: 'Org Chart' },
  { key: 'employees', label: 'Employees' },
  { key: 'legal-entities', label: 'Legal Entities', adminOnly: true },
  { key: 'business-units', label: 'Business Units', adminOnly: true },
  { key: 'departments', label: 'Departments', adminOnly: true },
  { key: 'locations', label: 'Locations', adminOnly: true },
  { key: 'designations', label: 'Designations', adminOnly: true },
];

export function OrgModule() {
  const { user } = useAuth();
  const roles = user?.roles ?? [];
  const isAdmin = roles.includes('admin') || roles.includes('hr') || roles.includes('director') || roles.includes('vp');
  const [tab, setTab] = useState<Tab>('overview');
  const tabs = ALL_TABS.filter((t) => !t.adminOnly || isAdmin);

  return (
    <div className="ts-page">
      <header className="ts-header">
        <div>
          <h1 className="ts-h1">Organisation</h1>
          <p className="ts-sub">Manage your company structure, employees, and hierarchy</p>
        </div>
      </header>

      <div className="org-tabs">
        {tabs.map((t) => (
          <button key={t.key} className={`org-tab${tab === t.key ? ' org-tab-active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="org-tab-content">
        {tab === 'overview' && <OrgOverview />}
        {tab === 'tree' && <OrgTree />}
        {tab === 'employees' && <OrgDirectory />}
        {tab === 'legal-entities' && <OrgLegalEntities />}
        {tab === 'business-units' && <OrgBusinessUnits />}
        {tab === 'departments' && <OrgDepartments />}
        {tab === 'locations' && <OrgLocations />}
        {tab === 'designations' && <OrgDesignations />}
      </div>
    </div>
  );
}
