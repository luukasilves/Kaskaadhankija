/**
 * The test-harness strip.
 *
 * Rendered above the application, not inside it: a hazard-striped bar with a
 * monospace TESTKESKKOND label, so nobody can mistake acting as somebody else
 * for part of the tool itself. It carries the two things a tester needs at all
 * times — who they really are, and whose view they are looking at.
 *
 * Only in the test environment, and only inside the buyer and partner areas:
 * the sign-in and the act-as screen are chrome-free, because harness controls
 * above a screen whose whole job is a choice would offer a way to skip it.
 *
 * A tester without the admin role sees the label alone. There is nothing for
 * them to switch — acting as a participant is an admin's right [L-08] — and a
 * strip full of disabled controls would suggest otherwise.
 */

import { isDemoMode } from '@/lib/env';
import { listActAsOptions } from '@/server/act-as';
import { resolveIdentity } from '@/server/auth/actor';
import { mayActAs } from '@/server/auth/identity';
import { TestStripControls } from './test-strip-controls';

function Frame({ testId, children }: { testId: string; children: React.ReactNode }) {
  return (
    <div
      data-testid={testId}
      className="kh-no-print border-b-2 border-[var(--color-demo)] bg-[var(--color-demo-soft)] px-4 py-1.5 text-[var(--color-text)]"
      style={{
        backgroundImage:
          'repeating-linear-gradient(135deg, transparent 0 14px, color-mix(in srgb, var(--color-demo) 8%, transparent) 14px 28px)',
      }}
    >
      {/*
        One swipeable row on a phone, wrapping rows on wider screens. Four
        wrapped rows of test controls took 191px — a fifth of a phone screen.
      */}
      <div className="mx-auto flex max-w-[1600px] items-center gap-x-3 gap-y-1.5 overflow-x-auto whitespace-nowrap sm:flex-wrap sm:overflow-visible">
        <span className="rounded border border-[var(--color-demo)] px-2 py-0.5 font-mono text-[11px] font-bold tracking-widest text-[var(--color-demo)] uppercase">
          Testkeskkond
        </span>
        {children}
      </div>
    </div>
  );
}

export async function TestStrip() {
  if (!isDemoMode) return null;

  const { signedIn, acting, actingKey } = await resolveIdentity();
  if (!signedIn) return null;

  if (!mayActAs(signedIn, isDemoMode)) {
    return (
      <Frame testId="test-strip-readonly">
        <span className="text-[12.5px]">
          Katsetuskeskkond raamlepingu voorude läbimängimiseks. Andmed on päris kujul, aga
          katsetamiseks.
        </span>
      </Frame>
    );
  }

  let options: Array<{ key: string; group: string; label: string }> = [];
  try {
    options = listActAsOptions();
  } catch {
    // The strip must not be what stops the app booting on an empty database.
    options = [];
  }

  return (
    <Frame testId="test-strip">
      <TestStripControls
        options={options}
        currentKey={actingKey}
        signedInName={signedIn.name}
        actingLabel={acting && acting.via ? acting.label : null}
      />
    </Frame>
  );
}
