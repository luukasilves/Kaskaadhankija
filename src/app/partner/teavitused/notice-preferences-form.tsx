'use client';

import { ActionForm } from '@/components/action-form';
import { setInformationalMailAction } from '@/server/actions/notice-preferences';

export function InformationalMailToggle({ on }: { on: boolean }) {
  return (
    <ActionForm
      action={setInformationalMailAction}
      submitLabel={on ? 'Lülita teabekirjad välja' : 'Lülita teabekirjad sisse'}
      variant={on ? 'default' : 'success'}
      hidden={{ on: on ? '0' : '1' }}
      className="inline"
      testId="informational-mail-toggle"
    />
  );
}
