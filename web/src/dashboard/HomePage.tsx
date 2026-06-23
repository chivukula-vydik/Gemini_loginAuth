import type { NavKey } from '../pm/nav';

type Props = { onNavigate: (key: NavKey) => void };

export function HomePage({ onNavigate }: Props) {
  return <div className="ts-page">Loading dashboard...</div>;
}
