import type { NextConfig } from 'next';

const config: NextConfig = {
  // One self-contained server bundle for the Docker image.
  output: 'standalone',
  // better-sqlite3 is a native module: it must stay external to the bundle.
  serverExternalPackages: ['better-sqlite3'],
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
