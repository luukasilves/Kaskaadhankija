import type { NextConfig } from 'next';

const config: NextConfig = {
  // One self-contained server bundle for the Docker image.
  output: 'standalone',
  // Node-only packages that must not be bundled: better-sqlite3 is a native
  // module, and nodemailer, exceljs and pdfmake all reach for Node built-ins
  // through `require`, which the bundler cannot resolve — it breaks `next dev`
  // outright. pdfmake additionally reads pdfkit's `.afm` font metrics from
  // disk at render time, which only works if the package stays on disk.
  serverExternalPackages: ['better-sqlite3', 'nodemailer', 'exceljs', 'pdfmake'],
  experimental: {
    // Table uploads (koolituskalender) exceed the 1 MB default.
    serverActions: { bodySizeLimit: '5mb' },
  },
  // Migrations and the sample datasets are read at runtime, so the file tracer
  // must copy them into the standalone output. So are pdfkit's standard-font
  // metrics: the protocol PDF opens `Helvetica.afm` and friends by name, which
  // the tracer cannot see because the path is computed [L-22]. The Dockerfile
  // asserts the file is really there, so a missing trace fails the build rather
  // than the first download.
  outputFileTracingIncludes: {
    '/**': ['./drizzle/**', './seed/**', './node_modules/.pnpm/pdfkit*/**/js/data/*.afm'],
  },
};

export default config;
