/**
 * The identity rules [L-08].
 *
 * These are the decisions that used to live inside `getActor()` behind
 * `next/headers`, which is why they had no test at all. Pulled out, they are
 * ordinary functions: where a sign-in lands, who may act as somebody else, and
 * what a request runs as given the two cookies.
 */

import { describe, expect, it } from 'vitest';
import type { Actor, BuyerActor, PartnerActor } from './actor';
import {
  areaHome,
  evidenceLabel,
  landingAfterSignIn,
  mayActAs,
  mayAdminister,
  mayWriteProcurement,
  resolveActing,
  WRITE_REFUSED,
} from './identity';

const admin: BuyerActor = {
  kind: 'buyer',
  userId: 'u-mari',
  name: 'Mari Tamm',
  email: 'mari.tamm@riik.ee',
  role: 'admin',
  label: 'Mari Tamm (Tellija)',
};

/** A hankija: the role stored as `member` [R-01]. */
const hankija: BuyerActor = { ...admin, userId: 'u-kati', name: 'Kati Kask', role: 'member', label: 'Kati Kask (Tellija)' };

const partner: PartnerActor = {
  kind: 'partner',
  partnerId: 'p-1',
  partnerName: 'Tehisaru Koolitus OÜ',
  regCode: '10000001',
  contactName: 'Jaan Kask',
  contactEmail: 'jaan.kask@tehisaru-naidis.ee',
  lotPartnerIds: ['lp-1'],
  memberships: [{ lotPartnerId: 'lp-1', lotId: 'l-1', lotCode: 'OSA-1', rank: 1 }],
  label: 'Jaan Kask, Tehisaru Koolitus OÜ',
};

describe('[L-08] where a sign-in lands', () => {
  it('sends an admin to the act-as screen, but only in the test environment', () => {
    expect(landingAfterSignIn({ kind: 'buyer', role: 'admin' }, true)).toBe('/');
    expect(landingAfterSignIn({ kind: 'buyer', role: 'admin' }, false)).toBe('/tellija');
  });

  it('sends everyone else straight to their own area', () => {
    expect(landingAfterSignIn({ kind: 'buyer', role: 'member' }, true)).toBe('/tellija');
    expect(landingAfterSignIn({ kind: 'buyer', role: 'member' }, false)).toBe('/tellija');
    expect(landingAfterSignIn({ kind: 'representative' }, true)).toBe('/partner/voorud');
    expect(landingAfterSignIn({ kind: 'partner' }, false)).toBe('/partner/voorud');
  });

  it('knows where each kind of identity works', () => {
    expect(areaHome('buyer')).toBe('/tellija');
    expect(areaHome('partner')).toBe('/partner/voorud');
    expect(areaHome('representative')).toBe('/partner/voorud');
  });
});

describe('[L-08] who may act as somebody else', () => {
  it('is a signed-in buyer admin in the test environment, and nobody else', () => {
    expect(mayActAs(admin, true)).toBe(true);
    expect(mayActAs(admin, false)).toBe(false);
    expect(mayActAs(hankija, true)).toBe(false);
    expect(mayActAs(partner, true)).toBe(false);
    expect(mayActAs(null, true)).toBe(false);
  });
});

describe('[L-08] what a request runs as', () => {
  it('is nobody without a session, whatever cookie is presented', () => {
    expect(resolveActing(null, partner, true)).toBeNull();
    expect(resolveActing(null, admin, true)).toBeNull();
  });

  it('is the signed-in person when nobody may act as anyone', () => {
    expect(resolveActing(hankija, partner, true)).toBe(hankija);
    expect(resolveActing(admin, partner, false)).toBe(admin);
    expect(resolveActing(partner, admin, true)).toBe(partner);
  });

  it('is the chosen participant, carrying the admin as `via`', () => {
    const acting = resolveActing(admin, partner, true);
    expect(acting).toMatchObject({
      kind: 'partner',
      partnerId: 'p-1',
      via: { userId: 'u-mari', label: 'Mari Tamm' },
    });
    // The chosen actor is never mutated: it comes from a fresh database read,
    // but a shared object gaining a `via` would leak between requests.
    expect(partner.via).toBeUndefined();
  });

  it('treats choosing your own card as being yourself, with no `via`', () => {
    const acting = resolveActing(admin, { ...admin }, true) as Actor;
    expect(acting).toBe(admin);
    expect(acting.via).toBeUndefined();
  });

  it('falls back to the signed-in admin when the choice no longer resolves', () => {
    expect(resolveActing(admin, null, true)).toBe(admin);
  });
});

describe('[D-09] the evidence label', () => {
  it('names the acting admin beside the person who answered', () => {
    expect(evidenceLabel({ label: 'Jaan Kask, Tehisaru Koolitus OÜ' })).toBe(
      'Jaan Kask, Tehisaru Koolitus OÜ',
    );
    expect(
      evidenceLabel({
        label: 'Jaan Kask, Tehisaru Koolitus OÜ',
        via: { userId: 'u-mari', label: 'Mari Tamm' },
      }),
    ).toBe('Jaan Kask, Tehisaru Koolitus OÜ (testkeskkonnas tegutses: Mari Tamm)');
  });
});

describe('[R-01] what each buyer role may write', () => {
  it('lets both roles run the procurement', () => {
    // The whole point of the split: a hankija publishes rounds, reviews bids
    // and confirms allocations, exactly as an admin does.
    expect(mayWriteProcurement(admin)).toBe(true);
    expect(mayWriteProcurement(hankija)).toBe(true);
  });

  it('keeps the framework data and the team for an admin', () => {
    expect(mayAdminister(admin)).toBe(true);
    expect(mayAdminister(hankija)).toBe(false);
  });

  it('admits nobody else to either, signed in or not', () => {
    for (const decide of [mayWriteProcurement, mayAdminister]) {
      expect(decide(partner)).toBe(false);
      expect(decide(null)).toBe(false);
      expect(decide(undefined)).toBe(false);
    }
  });

  it('tells a hankija what they may still do, and never calls them a vaatleja', () => {
    // The read-only observer role is gone; a refusal that still described one
    // would be telling somebody they cannot do the job they were given.
    expect(WRITE_REFUSED.notAdmin).toContain('hankija');
    expect(WRITE_REFUSED.notAdmin).toContain('voore saad teha');
    expect(WRITE_REFUSED.notAdmin).not.toContain('vaatleja');
    expect(WRITE_REFUSED.notBuyer).not.toContain('vaatleja');
  });
});
