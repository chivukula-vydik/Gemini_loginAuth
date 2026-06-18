// Human-friendly name for a person. Prefer an explicit displayName; otherwise
// derive a readable name from the email's local part so the UI never shows a
// raw address like "varun@example.org".
type NameLike = { displayName?: string | null; email?: string | null };

export function nameFromEmail(email?: string | null): string {
  const local = (email ?? '').split('@')[0];
  if (!local) return '';
  return local
    .split(/[._\-+]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function personName(person?: NameLike | null): string {
  if (!person) return '—';
  const display = person.displayName?.trim();
  if (display) return display;
  return nameFromEmail(person.email) || person.email || '—';
}

// Up to two initials for an avatar, derived from the resolved name.
export function initials(person?: NameLike | null): string {
  const name = personName(person);
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
