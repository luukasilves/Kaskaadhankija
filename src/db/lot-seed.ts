/**
 * The sample procurement's lots, as rows of the framework workbook [L-21].
 *
 * Data, not code: the seed feeds these to the framework import — the same
 * function an upload calls — and `scripts/build-datasets.ts` writes them into
 * `seed/naidis-raamhange.xlsx`, so what a tester downloads and what the empty
 * database gets are the same four lots.
 *
 * OSA-2's threshold is deliberately 4 rather than 25 [L-14]: with a sample
 * calendar this small nobody would ever reach 25 trainings, and the [T-01]
 * workload warning is one of the things a tester needs to see. The screen
 * labels it as a test value.
 */

import type { LotRow } from '@/domain/framework-definition';

export const LOT_SEED: readonly LotRow[] = [
  {
    code: 'OSA-1',
    name: 'Koolitused ruumirendiga',
    description:
      'Töötubade läbiviimine koolitaja pakutud ruumides koos vajaliku tehnika ja ruumiteenustega.',
    responseDeadlineWorkingDays: 3,
    deadlineLocalTime: '17:00',
    reviewWorkingDays: 2,
    workloadThreshold: 25,
    defaultVisibilityMode: 'dynamic',
    defaultCapOptions: 'trainings',
    thresholdNote: '',
  },
  {
    code: 'OSA-2',
    name: 'Koolitused ruumirendita',
    description:
      'Töötubade läbiviimine tellija määratud asukohas. Koolitaja vastutab sisu ja läbiviimise eest, ruumi ei paku.',
    responseDeadlineWorkingDays: 3,
    deadlineLocalTime: '17:00',
    reviewWorkingDays: 2,
    workloadThreshold: 4,
    defaultVisibilityMode: 'dynamic',
    // Both cap kinds, so the seeded Lisa B round shows the choice [L-17].
    defaultCapOptions: 'both',
    thresholdNote: 'Näidise testväärtus — päris raamlepingus on lähtekohaks 25 koolitust.',
  },
  {
    code: 'OSA-3',
    name: 'Veebikoolitused',
    description:
      'Töötubade ettevalmistamine ja läbiviimine digikeskkonnas (Teams, Zoom või muu kokkulepitud platvorm).',
    responseDeadlineWorkingDays: 2,
    deadlineLocalTime: '17:00',
    reviewWorkingDays: 2,
    workloadThreshold: 25,
    defaultVisibilityMode: 'dynamic',
    defaultCapOptions: 'trainings',
    thresholdNote: '',
  },
  {
    code: 'OSA-4',
    name: 'Suursündmused',
    description:
      'Suurema osalejate arvuga sündmuste korraldamine ja läbiviimine (ettekanne, loeng, kaasloome või häkaton), sh tehniline koordineerimine, modereerimine, registreerimine ja logistika.',
    responseDeadlineWorkingDays: 5,
    deadlineLocalTime: '17:00',
    reviewWorkingDays: 2,
    workloadThreshold: 25,
    defaultVisibilityMode: 'dynamic',
    defaultCapOptions: 'trainings',
    thresholdNote: '',
  },
];

export const LOT_CODES: readonly string[] = LOT_SEED.map((lot) => lot.code);
