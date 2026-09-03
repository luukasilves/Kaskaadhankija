'use client';

/**
 * The actions available on a round, by state.
 *
 * A draft can be edited freely and published. An open round can only *shrink*
 * or gain time — extend the deadline, withdraw a training, or cancel — because
 * partners have already been offered the published terms and may have confirmed
 * against them [V-04].
 */

import { ActionButton, ActionForm, Disclosure } from '@/components/action-form';
import {
  cancelRoundAction,
  extendDeadlineAction,
  publishRoundAction,
  removeDraftTrainingAction,
  withdrawTrainingAction,
} from '@/server/actions/rounds-buyer';

export interface TrainingRef {
  id: string;
  code: string;
  title: string;
  eventDate?: string;
}

export function DraftRoundPanel({
  roundId,
  lotResponseDays,
  lotDeadlineTime,
  visibilityMode,
  trainings,
}: {
  roundId: string;
  lotResponseDays: number;
  lotDeadlineTime: string;
  visibilityMode: 'dynamic' | 'sealed';
  trainings: TrainingRef[];
}) {
  return (
    <div className="space-y-4">
      <div
        className="rounded-[10px] border p-4"
        style={{ borderColor: 'var(--color-brand)', background: 'var(--color-brand-soft)' }}
      >
        <h2 style={{ color: 'var(--color-brand)' }}>Avalda voor</h2>
        <p className="mt-1 max-w-[80ch] text-[13px]">
          Avaldamine saadab vooru <strong>korraga kõigile</strong> hankeosa aktiivsetele
          partneritele ja külmutab järjestuse. Pärast avaldamist saab koolitusi ainult tagasi võtta
          ja tähtaega pikendada — lisada ega muuta ei saa.
        </p>

        <ActionForm
          action={publishRoundAction}
          submitLabel="Avalda kõigile partneritele"
          variant="primary"
          confirm="Avaldada voor kõigile hankeosa partneritele? Seda ei saa tagasi võtta."
          hidden={{ roundId }}
          className="mt-3 space-y-3"
          testId="publish-round"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-[12.5px] font-semibold">Vastamistähtaeg</span>
              <select name="extraWorkingDays" defaultValue="0" className="kh-input mt-1">
                <option value="0">
                  Hankeosa vaikimisi — {lotResponseDays} tööpäeva, kell {lotDeadlineTime}
                </option>
                <option value="1">{lotResponseDays + 1} tööpäeva (+1)</option>
                <option value="2">{lotResponseDays + 2} tööpäeva (+2)</option>
                <option value="5">{lotResponseDays + 5} tööpäeva (+5)</option>
              </select>
              <span className="mt-1 block text-[12px] text-[var(--color-muted)]">
                Tähtaega saab hiljem ainult pikendada.
              </span>
            </label>
            <label className="block">
              <span className="text-[12.5px] font-semibold">Nähtavusrežiim</span>
              <select name="visibilityMode" defaultValue={visibilityMode} className="kh-input mt-1">
                <option value="dynamic">Dünaamiline</option>
                <option value="sealed">Suletud</option>
              </select>
            </label>
          </div>
        </ActionForm>
      </div>

      {trainings.length > 0 && (
        <Disclosure summary={`Muuda mustandi koosseisu (${trainings.length} koolitust)`}>
          <ul className="space-y-2">
            {trainings.map((training) => (
              <li key={training.id} className="flex flex-wrap items-center gap-3">
                <span className="font-semibold">{training.code}</span>
                <span className="text-[13px] text-[var(--color-muted)]">{training.title}</span>
                <ActionButton
                  action={removeDraftTrainingAction}
                  label="Eemalda"
                  hidden={{ roundId, trainingId: training.id }}
                />
              </li>
            ))}
          </ul>
        </Disclosure>
      )}

      <Disclosure summary="Tühista voor" tone="danger">
        <ActionButton
          action={cancelRoundAction}
          label="Tühista voor"
          variant="danger"
          hidden={{ roundId }}
          reasonLabel="Tühistamise põhjus"
          reasonRequired
        />
      </Disclosure>
    </div>
  );
}

export function OpenRoundPanel({
  roundId,
  trainings,
}: {
  roundId: string;
  trainings: TrainingRef[];
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Disclosure summary="Pikenda tähtaega">
        <ActionForm
          action={extendDeadlineAction}
          submitLabel="Pikenda ja teavita partnereid"
          hidden={{ roundId }}
          className="space-y-2"
        >
          <label className="block">
            <span className="text-[12.5px] font-semibold">Kui palju juurde</span>
            <select name="addWorkingDays" defaultValue="1" className="kh-input mt-1">
              <option value="1">1 tööpäev</option>
              <option value="2">2 tööpäeva</option>
              <option value="3">3 tööpäeva</option>
              <option value="5">5 tööpäeva</option>
            </select>
          </label>
          <label className="block">
            <span className="text-[12.5px] font-semibold">Põhjendus</span>
            <textarea name="reason" rows={2} maxLength={400} className="kh-input mt-1" />
          </label>
        </ActionForm>
      </Disclosure>

      <Disclosure summary="Võta koolitus tagasi">
        <ActionForm
          action={withdrawTrainingAction}
          submitLabel="Võta tagasi ja teavita"
          hidden={{ roundId }}
          className="space-y-2"
        >
          <label className="block">
            <span className="text-[12.5px] font-semibold">Koolitus</span>
            <select name="trainingId" className="kh-input mt-1" required>
              {trainings.map((training) => (
                <option key={training.id} value={training.id}>
                  {training.code} — {training.title}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[12.5px] font-semibold">Põhjendus (kohustuslik)</span>
            <textarea name="reason" rows={2} maxLength={400} required className="kh-input mt-1" />
          </label>
          <p className="text-[12px] text-[var(--color-muted)]">
            Partnerite kinnitusi ei muudeta — tagasi võetud koolitust lihtsalt ei jaotata.
          </p>
        </ActionForm>
      </Disclosure>

      <Disclosure summary="Tühista voor" tone="danger">
        <ActionButton
          action={cancelRoundAction}
          label="Tühista voor"
          variant="danger"
          confirm="Tühistada voor? Kõiki partnereid teavitatakse ja märked kaotavad kehtivuse."
          hidden={{ roundId }}
          reasonLabel="Tühistamise põhjus"
          reasonRequired
        />
      </Disclosure>
    </div>
  );
}
