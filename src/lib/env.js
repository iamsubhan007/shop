// Reads an environment value defensively. Pasting values into a hosting dashboard often adds a trailing
// newline/space or wraps the value in quotes; either one silently breaks SMTP logins and secrets.
export function cleanEnv(value) {
  if (value == null) return '';
  let v = String(value).trim();
  const quoted = v.match(/^(["'])([\s\S]*)\1$/);
  if (quoted) v = quoted[2].trim();
  return v;
}
