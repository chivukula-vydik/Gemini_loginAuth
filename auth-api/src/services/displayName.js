// Turn an email's local part into a readable name.
// "varun@example.org" -> "Varun", "john.doe@x.com" -> "John Doe".
// Used as the displayName fallback so users are never shown a raw email.
export function nameFromEmail(email) {
  const local = String(email ?? '').split('@')[0];
  if (!local) return '';
  return local
    .split(/[._\-+]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
