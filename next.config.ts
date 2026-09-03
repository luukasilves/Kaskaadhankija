import type { NextConfig } from 'next';

const config: NextConfig = {
  // One self-contained server bundle for the Docker image.
  output: 'standalone',
  // Node-only packages that must not be bundled: better-sqlite3 is a native
  // module, and nodemailer and exceljs both reach for Node built-ins through
  // `require`, which the bundler cannot resolve — it breaks `next dev` outright.
  serverExternalPackages: ['better-sqlite3', 'nodemailer', 'exceljs'],
  experimental: {
    // Table uploads (koolituskalender) exceed the 1 MB default.
    serverActions: { bodySizeLimit: '5mb' },
  },
  // Migrations and the sample datasets are read at runtime, so the file tracer
  // must copy them into the standalone output.
  outputFileTracingIncludes: {
    '/**': ['./drizzle/**', './seed/**'],
  },
};

export default config;
