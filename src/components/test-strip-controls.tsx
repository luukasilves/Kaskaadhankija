'use client';

/**
 * The interactive parts of the test strip.
 *
 * Kept in its own client component so the strip itself stays a server component
 * that reads the identity and the participant list directly.
 */

import { useTransition } from 'react';
import { logoutAction } from '@/server/actions/auth';
import { stopActingAs, switchActingAs } from '@/server/actions/act-as';

export interface ActAsOption {
  key: string;
  group: string;
  label: string;
}

export function TestStripControls({
  options,
  currentKey,
  signedInName,
  actingLabel,
}: {
  options: ActAsOption[];
  /** the act-as choice in force, or null when the admin is themselves */
  currentKey: string | null;
  signedInName: string;
  /** set only while acting as somebody else */
  actingLabel: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const groups = Array.from(new Set(options.map((o) => o.group)));

  return (
    <div className="flex items-center gap-x-3 gap-y-1.5 sm:flex-wrap">
      <span
        data-testid="signed-in-badge"
        className="kh-badge bg-[var(--color-brand-soft)] text-[var(--color-brand)]"
        title="Sinu enda sessioon, avatud e-posti koodiga. Teise osalejana tegutsemine seda ei lõpeta."
      >
        Sisse logitud: {signedInName}
      </span>

      {actingLabel && (
        <span
          data-testid="acting-as"
          className="kh-badge bg-[var(--color-warning-soft)] text-[var(--color-warning)]"
          title="Toimingud salvestatakse selle osaleja nimel, auditijälge märgitakse ka sinu nimi"
        >
          Tegutseb kui: {actingLabel}
        </span>
      )}

      <label className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
        <span className="hidden font-mono text-[11px] tracking-wider uppercase opacity-80 sm:inline">
          Tegutse kui
        </span>
        <select
          className="kh-input min-w-0 max-w-[22rem] flex-1 py-1"
          value={currentKey ?? ''}
          disabled={pending || options.length === 0}
          onChange={(event) => {
            const key = event.target.value;
            if (!key) return;
            startTransition(async () => {
              await switchActingAs(key);
            });
          }}
        >
          {currentKey === null && <option value="">— sina ise —</option>}
          {groups.map((group) => (
            <optgroup key={group} label={group}>
              {options
                .filter((o) => o.group === group)
                .map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </label>

      {currentKey !== null && (
        <button
          type="button"
          className="kh-btn text-xs"
          disabled={pending}
          title="Tagasi valikulehele, oma sessiooniga"
          onClick={() =>
            startTransition(async () => {
              await stopActingAs();
            })
          }
        >
          Vaheta
        </button>
      )}

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

      {pending && <span className="text-xs opacity-70">töötleb…</span>}
    </div>
  );
}
