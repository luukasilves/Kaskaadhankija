/**
 * `SEED_TEAM` — the buyer team a fresh volume boots with.
 *
 * Worth a test of its own for one reason: the role a malformed or role-less
 * entry lands in used to be **admin**, so that somebody could still manage the
 * team after a reset. The sign-in allowlist now does that job [L-08], and a
 * default that quietly hands out administration rights would undo the whole
 * point of narrowing it [R-01].
 */

import { describe, expect, it } from 'vitest';
import { parseSeedTeam } from './seed';

describe('parseSeedTeam', () => {
  it('makes a member with no stated role a hankija', () => {
    expect(parseSeedTeam('Kirke Kask,kirke@riik.ee')).toEqual([
      { name: 'Kirke Kask', email: 'kirke@riik.ee', role: 'member' },
    ]);
  });

  it('gives out admin only when the entry asks for it by name', () => {
    expect(parseSeedTeam('Luukas Ilves,luukas@riik.ee,admin;Kirke Kask,kirke@riik.ee,hankija')).toEqual([
      { name: 'Luukas Ilves', email: 'luukas@riik.ee', role: 'admin' },
      { name: 'Kirke Kask', email: 'kirke@riik.ee', role: 'member' },
    ]);
    // `liige` and `member` are what the secret used to say; both still read as
    // the non-admin role rather than falling through to admin.
    expect(parseSeedTeam('A B,a@riik.ee,liige')[0]?.role).toBe('member');
    expect(parseSeedTeam('A B,a@riik.ee,member')[0]?.role).toBe('member');
    // An unrecognised role is a typo in a secret, and a typo must not promote.
    expect(parseSeedTeam('A B,a@riik.ee,ADMINISTRAATOR')[0]?.role).toBe('member');
  });

  it('drops an entry it cannot read rather than failing the boot', () => {
    expect(parseSeedTeam('ainult nimi;,puudub@riik.ee;Kirke Kask,kirke@riik.ee')).toEqual([
      { name: 'Kirke Kask', email: 'kirke@riik.ee', role: 'member' },
    ]);
    expect(parseSeedTeam(undefined)).toEqual([]);
    expect(parseSeedTeam('   ')).toEqual([]);
  });
});
