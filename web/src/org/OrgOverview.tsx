import { useEffect, useState } from 'react';
import { getOverview, OrgOverview as OV } from './orgApi';

const tiles: { key: keyof OV; label: string; cls: string }[] = [
  { key: 'employees', label: 'Employees', cls: 'ts-tile-accent' },
  { key: 'departments', label: 'Departments', cls: 'stat-done' },
  { key: 'businessUnits', label: 'Business Units', cls: 'stat-logged' },
  { key: 'locations', label: 'Locations', cls: 'stat-est' },
  { key: 'legalEntities', label: 'Legal Entities', cls: 'stat-tasks' },
  { key: 'designations', label: 'Designations', cls: 'stat-done' },
  { key: 'managers', label: 'Managers', cls: 'stat-logged' },
];

export function OrgOverview() {
  const [data, setData] = useState<OV | null>(null);

  useEffect(() => { getOverview().then(setData).catch(() => {}); }, []);

  if (!data) return <p className="ts-sub">Loading…</p>;

  return (
    <>
      <div className="ts-tiles">
        {tiles.map((t) => (
          <div key={t.key} className={`ts-tile ${t.cls}`}>
            <span className="ts-tile-label">{t.label}</span>
            <span className="ts-tile-value">{data[t.key]}</span>
          </div>
        ))}
      </div>
    </>
  );
}
