/**
 * Scenario rounds for the mock database.
 *
 * Built by replaying real engine calls against a rewound virtual clock, so the
 * audit trail, notifications and frozen snapshots a tester sees are genuine.
 * Filled in once the round engine exists (Phase 5); the seed calls this hook
 * from the start so the wiring is in place.
 */

import type { Tx } from '@/server/context';

export function seedScenarios(_tx: Tx): void {
  // Populated in Phase 8, after the round engine lands.
}
