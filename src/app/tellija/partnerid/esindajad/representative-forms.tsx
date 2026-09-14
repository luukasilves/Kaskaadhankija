'use client';

import { ActionForm } from '@/components/action-form';
import { setRepresentativeActiveAction } from '@/server/actions/representatives';

export function RepresentativeActiveToggle({ id, active }: { id: string; active: boolean }) {
  return (
    <ActionForm
      action={setRepresentativeActiveAction}
      submitLabel={active ? 'Lõpeta esindus' : 'Taasta'}
      variant={active ? 'default' : 'success'}
      confirm={active ? 'Lõpetada selle isiku esindusõigus? Ta ei saa enam sisse logida ega teateid.' : undefined}
      hidden={{ id, active: active ? '0' : '1' }}
      className="inline"
    />
  );
}
