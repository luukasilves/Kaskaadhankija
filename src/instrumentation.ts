/**
 * Next's start-up hook. Runs once per server process, before the first request.
 * Guarded to the Node runtime: the edge runtime cannot open SQLite.
 */

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { boot } = await import('./server/boot');
  await boot();
}
