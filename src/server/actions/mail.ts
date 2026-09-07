'use server';

/**
 * A deliberate re-send of one e-mail by the buyer, from the notification log.
 *
 * The automatic retries give up after three attempts; this is the human
 * override, and it is recorded on the same delivery row as another attempt.
 */

import { revalidatePath } from 'next/cache';
import { requireBuyer } from '../auth/actor';
import { resendDelivery } from '../notify';
import { fieldText } from './helpers';

export async function resendDeliveryAction(form: FormData): Promise<void> {
  await requireBuyer();
  const deliveryId = fieldText(form, 'deliveryId');
  if (deliveryId) await resendDelivery(deliveryId);
  revalidatePath('/tellija/teavitused');
}
