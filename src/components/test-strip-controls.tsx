'use client';

/**
 * The interactive parts of the test strip.
 *
 * Kept in its own client component so the strip itself stays a server component
 * that reads the clock and the persona roster directly.
 */

import { useTransition, useState } from 'react';
import { logoutAction } from '@/server/actions/auth';
import { clearPersona, switchPersona } from '@/server/actions/persona';
import { advanceOneDay, advanceOneHour, advanceToNextDeadline } from '@/server/actions/clock';
import { resetDemoData } from '@/server/actions/demo';

export interface PersonaOption {
  key: string;
  group: string;
  label: string;
}

export function TestStripControls({
  personas,
  currentKey,
  signedInLabel = null,
  clockLabel,
  offsetDays,
  hasPendingDeadline,
}: {
  personas: PersonaOption[];
  currentKey: string | null;
  /** set when the identity comes from a real session rather than a persona */
  signedInLabel?: string | null;
  clockLabel: string;
  offsetDays: number;
  hasPendingDeadline: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const groups = Array.from(new Set(personas.map((p) => p.group)));

  const run = (fn: () => Promise<{ message: string; redirectTo?: string }>) => {
    startTransition(async () => {
      try {
        const result = await fn();
        setMessage(result.message);
        // A reset mints new ids, so it hands back where to go next.
        if (result.redirectTo) window.location.assign(result.redirectTo);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Toiming ebaõnnestus.');
      }
    });
  };

  return (
    <div className="flex items-center gap-x-3 gap-y-1.5 sm:flex-wrap">
      <label className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
        <span className="hidden font-mono text-[11px] tracking-wider uppercase opacity-80 sm:inline">
          Persoon
        </span>
        <select
          className="kh-input min-w-0 max-w-[22rem] flex-1 py-1"
          value={currentKey ?? ''}
          disabled={pending}
          onChange={(event) => {
            const key = event.target.value;
            if (!key) return;
            startTransition(async () => {
              await switchPersona(key);
            });
          }}
        >
          {currentKey === null && <option value="">— vali persoon —</option>}
          {groups.map((group) => (
            <optgroup key={group} label={group}>
              {personas
                .filter((p) => p.group === group)
                .map((persona) => (
                  <option key={persona.key} value={persona.key}>
                    {persona.label}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </label>

      <div className="flex items-center gap-1.5 sm:flex-wrap">
        <span className="hidden font-mono text-[11px] tracking-wider uppercase opacity-80 sm:inline">
          Kell
        </span>
        <span className="font-semibold tabular-nums">{clockLabel}</span>
        {offsetDays !== 0 && (
          <span className="kh-badge bg-[var(--color-warning-soft)] text-[var(--color-warning)]">
            {offsetDays > 0 ? '+' : ''}
            {offsetDays} p
          </span>
        )}
        <button type="button" className="kh-btn text-xs" disabled={pending} onClick={() => run(advanceOneHour)}>
          +1 h
        </button>
        <button type="button" className="kh-btn text-xs" disabled={pending} onClick={() => run(advanceOneDay)}>
          +1 päev
        </button>
        <button
          type="button"
          className="kh-btn kh-btn-primary text-xs"
          disabled={pending || !hasPendingDeadline}
          title={
            hasPendingDeadline
              ? 'Keri aega kuni järgmise vastamistähtaja möödumiseni'
              : 'Ükski voor ei oota praegu vastust'
          }
          onClick={() => run(advanceToNextDeadline)}
        >
          Järgmise tähtajani
        </button>
      </div>

      <div className="flex items-center gap-2 sm:flex-wrap">
        {signedInLabel && (
          <>
            <span
              data-testid="signed-in-badge"
              className="kh-badge bg-[var(--color-brand-soft)] text-[var(--color-brand)]"
              title="Identiteet tuleb e-posti koodiga avatud sessioonist; persooni valimine lõpetab sessiooni"
            >
              Sisse logitud: {signedInLabel}
            </span>
            <button
              type="button"
              className="kh-btn text-xs"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await logoutAction();
                })
              }
            >
              Logi välja
            </button>
          </>
        )}
        {currentKey !== null && (
          <button
            type="button"
            className="kh-btn text-xs"
            disabled={pending}
            title="Tagasi persoonivaliku lehele"
            onClick={() =>
              startTransition(async () => {
                await clearPersona();
              })
            }
          >
            Vaheta persooni
          </button>
        )}

        <button
          type="button"
          className="kh-btn text-xs"
          disabled={pending}
          onClick={() => {
            if (!window.confirm('Kustutada kõik näidise andmed ja alustada algusest?')) return;
            run(resetDemoData);
          }}
        >
          Lähtesta näidisandmed
        </button>
      </div>

      {message && (
        <span
          role="status"
          className="rounded bg-[var(--color-surface)] px-2 py-1 text-xs font-semibold text-[var(--color-text)]"
        >
          {message}
        </span>
      )}
      {pending && <span className="text-xs opacity-70">töötleb…</span>}
    </div>
  );
}
