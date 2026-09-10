'use client';

/**
 * Write the protocol of a round that ended before protocols existed [L-22].
 *
 * The only hand-operated path to a protocol, and it exists solely for the
 * rounds already in the database when the feature arrived — hence the
 * confirmation: the document is dated by the moment it is written, and the row
 * cannot then be replaced.
 */

import { ActionForm } from '@/components/action-form';
import { generateProtocolAction } from '@/server/actions/rounds-buyer';

export function GenerateProtocolForm({ roundId }: { roundId: string }) {
  return (
    <ActionForm
      action={generateProtocolAction}
      submitLabel="Koosta protokoll"
      variant="primary"
      confirm="Koostada selle vooru protokoll salvestatud andmetest? Protokolli saab koostada ainult üks kord."
      hidden={{ roundId }}
      testId="generate-protocol"
    />
  );
}
