import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Pin the workspace root to this project. Without it, Next/Turbopack walks up and picks the nearest
// parent folder that has a lockfile (e.g. a stray ~/pnpm-lock.yaml) and then crashes with
// "Access is denied (os error 5)" while scanning the user's home directory.
const root = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: { root },
  outputFileTracingRoot: root,
};

export default nextConfig;
