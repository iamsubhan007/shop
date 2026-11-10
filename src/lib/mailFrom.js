// Decides the From header for outgoing mail. Pure function (no server-only import) so it can be tested.
//
// Mail providers want the visible sender to be the account that actually sends the message: SPF/DKIM are then
// aligned and DMARC passes. Gmail's SMTP only sends as the logged-in account (it silently rewrites anything
// else), and a From that does not match the sending account is a classic spam signal. So for Gmail we always
// use the SMTP login as the address and keep only the display name from SMTP_FROM.

export const DEFAULT_NAME = 'Haq Bahu Tandoor';

/** Accepts `Name <addr@x.com>`, `"Name" <addr@x.com>` or a bare address. Returns null if unusable. */
export function parseFrom(raw) {
  const v = String(raw || '').trim();
  const m = v.match(/^"?([^"<]*?)"?\s*<([^<>\s]+@[^<>\s]+)>$/);
  if (m) return { name: m[1].trim() || DEFAULT_NAME, address: m[2] };
  if (/^[^\s<>@]+@[^\s<>@]+$/.test(v)) return { name: DEFAULT_NAME, address: v };
  return null;
}

export function resolveFrom({ user, host = 'smtp.gmail.com', from }) {
  const parsed = parseFrom(from) || { name: DEFAULT_NAME, address: user };
  const h = String(host).toLowerCase();
  const isGmail = h.endsWith('gmail.com') || h.endsWith('googlemail.com');
  if (isGmail && String(parsed.address).toLowerCase() !== String(user).toLowerCase()) {
    return { name: parsed.name, address: user, rewritten: true };
  }
  return { name: parsed.name, address: parsed.address, rewritten: false };
}
