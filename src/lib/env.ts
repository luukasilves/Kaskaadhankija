/**
 * Environment configuration, parsed once and typed.
 *
 * `DEMO_MODE` is the single switch between the test harness (persona picker,
 * virtual clock, sample-data actions) and production behaviour. Nothing else
 * in the codebase reads `process.env` directly.
 */

import { z } from 'zod';

const booleanish = z
  .string()
  .optional()
  .transform((v) => v === '1' || v?.toLowerCase() === 'true');

const schema = z.object({
  DATABASE_PATH: z.string().default('./data/kaskaadhankija.db'),
  /** persona picker + virtual clock + reset/sample actions */
  DEMO_MODE: booleanish,
  /** absolute base for links inside notifications */
  APP_BASE_URL: z.string().default('http://localhost:3000'),
  /** SMTP is optional: without a host, notifications stay in the in-app log */
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_SECURE: booleanish,
  EMAIL_FROM: z.string().default('Kaskaadhankija <tellimused@example.ee>'),
  TEAM_NOTIFICATIONS_EMAIL: z.string().optional(),
  /** log emails to the console instead of sending, for local work */
  EMAIL_DEV_MODE: booleanish,
  /** first buyer persona created by the seed */
  SEED_ADMIN_EMAIL: z.string().default('mari.tamm@naidis.riigikantselei.ee'),
  SEED_ADMIN_NAME: z.string().default('Mari Tamm'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
  throw new Error(`Keskkonnamuutujad on vigased: ${issues}`);
}

export const env = parsed.data;

/** True when the test harness is enabled. */
export const isDemoMode = env.DEMO_MODE;

/** True when SMTP is configured well enough to attempt a send. */
export const hasSmtp = Boolean(env.SMTP_HOST) && !env.EMAIL_DEV_MODE;

/** Guard for actions that must never exist in production. */
export function assertDemoMode(): void {
  if (!isDemoMode) {
    throw new Error('See toiming on saadaval ainult testkeskkonnas (DEMO_MODE).');
  }
}
