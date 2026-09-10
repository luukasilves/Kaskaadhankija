'use client';

/**
 * The framework-data forms [L-21].
 *
 * Every one of these edits something the workbook can also express, and calls
 * the same server function the import does. The point of having both is that
 * fixing one address should not require opening Excel.
 */

import { useState } from 'react';
import { ActionButton, ActionForm } from '@/components/action-form';
import { UploadDropZone } from '@/components/upload-drop-zone';
import {
  addLotPartnerAction,
  addRepresentativeAction,
  confirmFrameworkImportAction,
  deactivateLotAction,
  discardFrameworkImportAction,
  moveLotPartnerRankAction,
  previewFrameworkAction,
  updateFrameworkIdentityAction,
  updateLotPartnerContactAction,
  updateRepresentativeAction,
} from '@/server/actions/framework';

export interface FrameworkIdentityFields {
  title: string;
  procurementReference: string;
  agreementReference: string;
  buyerName: string;
  /** ISO day, for the date input */
  validUntil: string;
}

function Field({
  label,
  name,
  value,
  hint,
  type = 'text',
  required = false,
  maxLength,
  step,
}: {
  label: string;
  name: string;
  value?: string | number;
  hint?: string;
  type?: string;
  required?: boolean;
  maxLength?: number;
  step?: string;
}) {
  return (
    <label className="block">
      <span className="text-[12.5px] font-semibold">{label}</span>
      <input
        type={type}
        name={name}
        defaultValue={value ?? ''}
        required={required}
        maxLength={maxLength}
        step={step}
        className="kh-input mt-1 w-full"
      />
      {hint && <span className="mt-0.5 block text-[11.5px] text-[var(--color-muted)]">{hint}</span>}
    </label>
  );
}

export function FrameworkIdentityForm({ identity }: { identity: FrameworkIdentityFields }) {
  return (
    <ActionForm
      action={updateFrameworkIdentityAction}
      submitLabel="Salvesta raamhanke andmed"
      variant="primary"
      className="kh-card p-4"
      testId="framework-identity-form"
    >
      <h2>Raamhange</h2>
      <p className="mt-1 max-w-[80ch] text-[13px] text-[var(--color-muted)]">
        Need andmed on kirjas igal teatel ja igal tellimusel. Juba loodud tellimustel jääb kehtima
        see sõnastus, mis kinnitamise hetkel külmutati.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Raamlepingu nimetus" name="title" value={identity.title} required maxLength={160} />
        <Field
          label="Riigihanke viitenumber"
          name="procurementReference"
          value={identity.procurementReference}
          hint="Ainult numbrid, nt 10567384"
          required
        />
        <Field
          label="Raamlepingu number"
          name="agreementReference"
          value={identity.agreementReference}
          hint="Kui tellija seda kasutab"
          maxLength={80}
        />
        <Field label="Tellija" name="buyerName" value={identity.buyerName} required maxLength={120} />
        <Field
          label="Kehtib kuni"
          name="validUntil"
          value={identity.validUntil}
          type="date"
          hint="Tühi tähendab tähtajatut"
        />
      </div>
    </ActionForm>
  );
}

export interface MemberRow {
  lotPartnerId: string;
  partnerName: string;
  regCode: string;
  rank: number;
  contactName: string;
  contactEmail: string;
  unitPriceEur: number;
  isActive: boolean;
  signIn: { active: boolean; reason: string };
}

/** One membership: the contact and price inline, the rank by two buttons. */
export function MemberRowForms({
  member,
  isFirst,
  isLast,
}: {
  member: MemberRow;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (!member.isActive) {
    return <span className="text-[12px] text-[var(--color-muted)]">osalus lõpetatud</span>;
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <ActionButton
          action={moveLotPartnerRankAction}
          label="↑"
          title="Tõsta kohta võrra kõrgemale"
          disabled={isFirst}
          hidden={{ lotPartnerId: member.lotPartnerId, direction: 'up' }}
        />
        <ActionButton
          action={moveLotPartnerRankAction}
          label="↓"
          title="Langeta kohta võrra madalamale"
          disabled={isLast}
          hidden={{ lotPartnerId: member.lotPartnerId, direction: 'down' }}
        />
        <button type="button" className="kh-btn text-xs" onClick={() => setOpen((v) => !v)}>
          {open ? 'Sulge' : 'Muuda kontakti'}
        </button>
      </div>

      {open && (
        <ActionForm
          action={updateLotPartnerContactAction}
          submitLabel="Salvesta"
          variant="primary"
          className="rounded-md border border-[var(--color-border)] p-3"
          hidden={{ lotPartnerId: member.lotPartnerId }}
          testId="member-contact-form"
        >
          <div className="grid gap-2 sm:grid-cols-3">
            <Field label="Kontaktisik" name="contactName" value={member.contactName} required />
            <Field
              label="E-post"
              name="contactEmail"
              value={member.contactEmail}
              type="email"
              hint="Sellega saab partner sisse logida"
              required
            />
            <Field
              label="Ühikhind (€)"
              name="unitPriceEur"
              value={member.unitPriceEur}
              type="number"
              step="0.01"
            />
          </div>
        </ActionForm>
      )}
    </div>
  );
}

export function AddLotPartnerForm({ lotId, lotCode }: { lotId: string; lotCode: string }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" className="kh-btn text-xs" onClick={() => setOpen(true)}>
        Lisa partner
      </button>
    );
  }
  return (
    <ActionForm
      action={addLotPartnerAction}
      submitLabel="Lisa järjestuse lõppu"
      variant="primary"
      className="rounded-md border border-[var(--color-border)] p-3"
      hidden={{ lotId }}
      testId="add-lot-partner"
    >
      <h3 className="text-[13px] font-semibold">Uus partner hankeosas {lotCode}</h3>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <Field label="Registrikood" name="regCode" hint="8 numbrit" required />
        <Field label="Partneri nimi" name="partnerName" hint="Uue ettevõtte puhul" />
        <Field label="Kontaktisik" name="contactName" required />
        <Field label="E-post" name="contactEmail" type="email" required />
        <Field label="Ühikhind (€)" name="unitPriceEur" type="number" step="0.01" />
      </div>
    </ActionForm>
  );
}

export function DeactivateLotButton({ lotId, blockers }: { lotId: string; blockers: string[] }) {
  if (blockers.length > 0) {
    return (
      <span className="text-[12px] text-[var(--color-muted)]">
        Ei saa välja arvata: voorud {blockers.join(', ')}
      </span>
    );
  }
  return (
    <ActionButton
      action={deactivateLotAction}
      label="Arva raamhankest välja"
      variant="danger"
      confirm="Arvata see hankeosa raamhankest välja? Andmed jäävad alles, aga uusi voore sellesse teha ei saa."
      hidden={{ lotId }}
      reasonLabel="Põhjendus"
      reasonRequired
    />
  );
}

export interface RepresentativeRowData {
  id: string;
  name: string;
  email: string;
  role: 'esindaja' | 'asendaja';
  phone: string;
  isActive: boolean;
  source: 'framework' | 'upload' | 'manual';
}

export function RepresentativeForms({
  partnerId,
  partnerName,
}: {
  partnerId: string;
  partnerName: string;
}) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" className="kh-btn text-xs" onClick={() => setOpen(true)}>
        Lisa esindaja
      </button>
    );
  }
  return (
    <ActionForm
      action={addRepresentativeAction}
      submitLabel="Lisa esindaja"
      variant="primary"
      className="rounded-md border border-[var(--color-border)] p-3"
      hidden={{ partnerId }}
      testId="add-representative"
    >
      <h3 className="text-[13px] font-semibold">Uus esindaja — {partnerName}</h3>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <Field label="Nimi" name="name" required />
        <Field label="E-post" name="email" type="email" required />
        <label className="block">
          <span className="text-[12.5px] font-semibold">Roll</span>
          <select name="role" className="kh-input mt-1 w-full" defaultValue="esindaja">
            <option value="esindaja">Esindaja</option>
            <option value="asendaja">Asendaja</option>
          </select>
        </label>
        <Field label="Telefon" name="phone" />
      </div>
    </ActionForm>
  );
}

export function EditRepresentativeForm({ representative }: { representative: RepresentativeRowData }) {
  const [open, setOpen] = useState(false);
  if (representative.source === 'framework') {
    return (
      <span className="text-[12px] text-[var(--color-muted)]">
        raamlepingu kontakt — muuda ülal järjestuse real
      </span>
    );
  }
  if (!open) {
    return (
      <button type="button" className="kh-btn text-xs" onClick={() => setOpen(true)}>
        Muuda
      </button>
    );
  }
  return (
    <ActionForm
      action={updateRepresentativeAction}
      submitLabel="Salvesta"
      variant="primary"
      className="rounded-md border border-[var(--color-border)] p-3"
      hidden={{ representativeId: representative.id }}
    >
      <div className="grid gap-2 sm:grid-cols-3">
        <Field label="Nimi" name="name" value={representative.name} required />
        <label className="block">
          <span className="text-[12.5px] font-semibold">Roll</span>
          <select name="role" className="kh-input mt-1 w-full" defaultValue={representative.role}>
            <option value="esindaja">Esindaja</option>
            <option value="asendaja">Asendaja</option>
          </select>
        </label>
        <Field label="Telefon" name="phone" value={representative.phone} />
      </div>
    </ActionForm>
  );
}

/* ------------------------------------------------------------------ *
 * the workbook
 * ------------------------------------------------------------------ */

export function FrameworkUploadForm() {
  const [pasting, setPasting] = useState(false);
  return (
    <ActionForm
      action={previewFrameworkAction}
      submitLabel="Vaata üle"
      variant="primary"
      className="kh-card p-4"
      testId="framework-upload"
    >
      <h2>Laadi raamhanke andmed üles</h2>
      <p className="mt-1 max-w-[80ch] text-[13px] text-[var(--color-muted)]">
        Lae kõigepealt alla praegused andmed, muuda failis seda, mida vaja, ja laadi tagasi. Tühi
        lahter tähendab „jäta muutmata“. Midagi ei kirjutata enne, kui oled eelvaate kinnitanud.
      </p>

      {pasting ? (
        <label className="mt-3 block">
          <span className="text-[12.5px] font-semibold">Kleebi read Excelist</span>
          <textarea
            name="pasted"
            rows={6}
            className="kh-input mt-1 w-full font-mono text-[12px]"
            placeholder={'partner\tregistrikood\thankeosa\tkoht\tkontaktisik\te_post\tuhikhind'}
          />
          <span className="mt-0.5 block text-[11.5px] text-[var(--color-muted)]">
            Esimene rida olgu veerunimed. Nii saab järjestuse ilma failita üle vaadata.
          </span>
        </label>
      ) : (
        <div className="mt-3">
          <UploadDropZone accept=".xlsx" label="Lohista töövihik siia või vali fail" />
        </div>
      )}

      <label className="mt-3 flex items-start gap-2 text-[13px]">
        <input type="checkbox" name="deactivateMissing" className="mt-0.5" />
        <span>
          Lõpeta need, keda failis ei ole — nii partnerite osalused puudutatud hankeosades kui
          hankeosad ise. Avatud voore see ei muuda.
        </span>
      </label>

      <button
        type="button"
        className="mt-3 text-[12.5px] font-semibold text-[var(--color-brand)]"
        onClick={() => setPasting((v) => !v)}
      >
        {pasting ? 'Laadi hoopis fail' : 'Või kleebi read Excelist'}
      </button>
    </ActionForm>
  );
}

export function FrameworkImportActions({ batchId, canApply }: { batchId: string; canApply: boolean }) {
  return (
    <div className="flex flex-wrap items-start gap-2">
      <ActionForm
        action={confirmFrameworkImportAction}
        submitLabel="Kinnita ja salvesta"
        variant="primary"
        disabled={!canApply}
        hidden={{ batchId }}
        testId="confirm-framework-import"
      />
      <ActionForm
        action={discardFrameworkImportAction}
        submitLabel="Jäta kõrvale"
        hidden={{ batchId }}
      />
    </div>
  );
}
