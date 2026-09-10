/**
 * Environment configuration, parsed once and typed.
 *
 * `DEMO_MODE` marks this deployment as the **test environment**. It no longer
 * switches on a harness — there is no virtual clock and no sample-data button
 * since v2.3 [L-23] — but four things still read it: the act-as picker for
 * admins, the TESTKESKKOND badge, the mail allowlist [L-19], and the relaxed
 * deadline floor below. Nothing else in the codebase reads `process.env`
 * directly.
 */

import { z } from 'zod';

const booleanish = z
  .string()
  .optional()
  .transform((v) => v === '1' || v?.toLowerCase() === 'true');

const schema = z.object({
  DATABASE_PATH: z.string().default('./data/kaskaadhankija.db'),
  /** this is the test environment: act-as picker, badge, mail allowlist, short deadlines */
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
  /**
   * Who may sign in as a buyer admin without being added to the team first
   * [L-08]. Comma-separated, and each entry is either a **named address**
   * (`luukas.ilves@riigikantselei.ee`) or a **whole domain** (`@naidis.ee`,
   * which a test environment wants so nobody has to maintain a roster).
   *
   * Empty means only people already on the team or the representatives list can
   * sign in. The user row is created when a code is verified, never when one is
   * requested, so requesting codes for invented colleagues cannot populate the
   * team.
   */
  AUTO_ADMIN_ALLOWLIST: z.string().optional(),
  /** first buyer persona created by the seed */
  SEED_ADMIN_EMAIL: z.string().default('mari.tamm@naidis.riigikantselei.ee'),
  SEED_ADMIN_NAME: z.string().default('Mari Tamm'),
  /**
   * The buyer team's own members, added when the seed runs, so a fresh volume
   * already has the people who sign in: `nimi,e-post[,roll];…`, **hankija**
   * unless the role says `admin` [R-01]. Partner representatives are *not*
   * seeded from a secret any more — they come with the framework data [L-21].
   */
  SEED_TEAM: z.string().optional(),
  /**
   * How far in the future a test round's response deadline must be, in
   * seconds. Only read in DEMO_MODE, where the point is that a whole cascade
   * can be walked in an afternoon [L-23]; production always uses the lot's own
   * working-day window and can never be shortened by an environment variable
   * [V-04]. The browser suites set it to a few seconds so a walk does not
   * spend five minutes waiting.
   */
  TEST_DEADLINE_FLOOR_SECONDS: z.coerce.number().int().positive().default(300),
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
