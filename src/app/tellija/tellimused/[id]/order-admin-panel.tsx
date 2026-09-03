'use client';

/**
 * What can still happen to a confirmed order [E-07].
 *
 * The order is a hankeleping, so neither side can simply undo it. The buyer can
 * cancel a training with a reason, and can record that a partner withdrew —
 * which is deliberately a *record*, flagged for contract follow-up outside this
 * tool, rather than a state the cascade absorbs silently.
 */

import { ActionButton, Disclosure } from '@/components/action-form';
import {
  cancelOrderTrainingAction,
  markTrainingCompletedAction,
  recordPartnerWithdrawalAction,
} from '@/server/actions/rounds-buyer';

export function OrderAdminPanel({
  orderId,
  trainings,
}: {
  orderId: string;
  trainings: Array<{ id: string; code: string; status: string }>;
}) {
  if (trainings.length === 0) return null;

  return (
    <section className="kh-no-print space-y-3">
      <h2>Tellimuse haldus</h2>
      <div className="overflow-x-auto">
        <table className="w-full kh-card">
          <thead>
            <tr>
              <th className="kh-th">Koolitus</th>
              <th className="kh-th">Läbiviidud</th>
              <th className="kh-th">Tellija tühistab</th>
              <th className="kh-th">Partner loobus</th>
            </tr>
          </thead>
          <tbody>
            {trainings.map((training) => (
              <tr key={training.id}>
                <td className="kh-td font-semibold whitespace-nowrap">{training.code}</td>
                <td className="kh-td">
                  {training.status === 'completed' ? (
                    <span className="text-[13px]" style={{ color: 'var(--color-success)' }}>
                      läbi viidud
                    </span>
                  ) : (
                    <ActionButton
                      action={markTrainingCompletedAction}
                      label="Märgi läbiviiduks"
                      hidden={{ trainingId: training.id }}
                    />
                  )}
                </td>
                <td className="kh-td">
                  <ActionButton
                    action={cancelOrderTrainingAction}
                    label="Tühista koolitus"
                    variant="danger"
                    hidden={{ orderId, trainingId: training.id }}
                    reasonLabel="Tühistamise põhjendus"
                    reasonRequired
                  />
                </td>
                <td className="kh-td">
                  <ActionButton
                    action={recordPartnerWithdrawalAction}
                    label="Registreeri loobumine"
                    hidden={{ orderId, trainingId: training.id }}
                    reasonLabel="Partneri selgitus"
                    reasonName="note"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Disclosure summary="Miks tellimust ei saa lihtsalt tagasi võtta?">
        <p className="text-[13px]">
          Raamlepingu järgi on kinnitatud tellimus käsitletav hankelepinguna. Seetõttu ei ole siin
          „tühista tellimus“ nuppu: koolitusi tühistatakse ükshaaval põhjendusega, ja partneri
          loobumine pärast kinnitamist registreeritakse eraldi sündmusena, mille lepingulise poole
          menetlemine toimub väljaspool seda rakendust.
        </p>
      </Disclosure>
    </section>
  );
}
