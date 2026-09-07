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
  /**
   * Who may receive real mail: addresses and `@domain` entries, comma-separated.
   * In the test environment (DEMO_MODE) an unset list means nothing is sent —
   * the seeded partners have fictional addresses. `*` opens it to everyone.
   */
  EMAIL_ALLOWED_RECIPIENTS: z.string().optional(),
  SMTP_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  /** log emails to the console instead of sending, for local work */
  EMAIL_DEV_MODE: booleanish,
  /** signs one-time sign-in codes and session tokens */
  AUTH_SECRET: z.string().optional(),
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

/** How e-mail leaves the system, if at all. */
export type MailMode = 'smtp' | 'dev' | 'off';

export function mailMode(): MailMode {
  if (env.EMAIL_DEV_MODE) return 'dev';
  return env.SMTP_HOST ? 'smtp' : 'off';
}

/** True when SMTP is configured well enough to attempt a send. */
export const hasSmtp = mailMode() === 'smtp';

/** Guard for actions that must never exist in production. */
export function assertDemoMode(): void {
  if (!isDemoMode) {
    throw new Error('See toiming on saadaval ainult testkeskkonnas (DEMO_MODE).');
  }
}
