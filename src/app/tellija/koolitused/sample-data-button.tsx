'use client';

import { ActionForm } from '@/components/action-form';
import { loadSampleTrainingsAction } from '@/server/actions/imports';

/**
 * Demo-only: load the committed sample koolituskalender straight from the
 * repository — the "load from database" path, running the same import code an
 * upload would.
 */
export function SampleDataButton() {
  return (
    <ActionForm
      action={loadSampleTrainingsAction}
      submitLabel="Laadi näidisandmed"
      testId="load-sample-data"
    />
  );
}
