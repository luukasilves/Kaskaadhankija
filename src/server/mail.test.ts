/**
 * The recipient allowlist — the rule that keeps the test environment from
 * mailing the fictional partners, or anyone else not on the team's list.
 */

import { describe, expect, it } from 'vitest';
import { parseAllowlist, recipientAllowed } from './mail';

describe('[D-10] EMAIL_ALLOWED_RECIPIENTS', () => {
  it('parses addresses and domains, lowercased, on any separator', () => {
    expect(parseAllowlist(' @AgenticState.org, keegi@riik.ee;  teine@riik.ee ')).toEqual([
      '@agenticstate.org',
      'keegi@riik.ee',
      'teine@riik.ee',
    ]);
    expect(parseAllowlist(undefined)).toEqual([]);
  });

  it('in the test environment an empty list suppresses everything', () => {
    const verdict = recipientAllowed('keegi@riik.ee', { demoMode: true, allowlist: [] });
    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) expect(verdict.reason).toMatch(/EMAIL_ALLOWED_RECIPIENTS/);
  });

  it('in production an empty list allows everyone', () => {
    expect(recipientAllowed('keegi@riik.ee', { demoMode: false, allowlist: [] })).toEqual({
      allowed: true,
    });
  });

  it('matches a whole domain or an exact address, nothing looser', () => {
    const allowlist = ['@agenticstate.org', 'peeter.saar@digioskus-naidis.ee'];
    const check = (address: string) => recipientAllowed(address, { demoMode: true, allowlist }).allowed;
    expect(check('Luukas@AgenticState.org')).toBe(true);
    expect(check('peeter.saar@digioskus-naidis.ee')).toBe(true);
    expect(check('x@sub.agenticstate.org')).toBe(false);
    expect(check('x@agenticstate.org.evil.example')).toBe(false);
    expect(check('liis.magi@ai-akadeemia-naidis.ee')).toBe(false);
  });

  it('refuses an address that is not one', () => {
    expect(recipientAllowed('kontakt', { demoMode: false, allowlist: [] }).allowed).toBe(false);
  });

  it('* opens the list, explicitly', () => {
    expect(recipientAllowed('anyone@anywhere.ee', { demoMode: true, allowlist: ['*'] }).allowed).toBe(true);
  });
  it('takes the framework’s own addresses as part of the same list [L-19]', () => {
    // How `sendMail` composes it: the configured list plus the derived one. An
    // unset secret therefore means „only the framework's own contacts", not
    // „nobody" — which is the whole point of the change.
    const known = ['jaan.kask@tehisaru.ee', 'kontakt@digioskus.ee'];
    expect(recipientAllowed('jaan.kask@tehisaru.ee', { demoMode: true, allowlist: [...known] }).allowed).toBe(true);
    expect(recipientAllowed('JAAN.KASK@Tehisaru.ee', { demoMode: true, allowlist: [...known] }).allowed).toBe(true);

    // A colleague at the same domain is *not* admitted: the derived set is
    // exact addresses, and every message the system sends a bidder is
    // addressed from the same rows it was built from.
    expect(recipientAllowed('keegi.muu@tehisaru.ee', { demoMode: true, allowlist: [...known] }).allowed).toBe(false);

    // The buyer's own side still needs the configured half.
    const merged = ['@riigikantselei.ee', ...known];
    expect(recipientAllowed('luukas@riigikantselei.ee', { demoMode: true, allowlist: merged }).allowed).toBe(true);
    expect(recipientAllowed('luukas@riigikantselei.ee', { demoMode: true, allowlist: [...known] }).allowed).toBe(false);
  });

  it('says which rule refused, and still names the variable', () => {
    // The reason reaches the buyer as the delivery row's detail, so it has to
    // name both halves — and the env var, so somebody can act on it.
    const refused = recipientAllowed('keegi@mujal.ee', { demoMode: true, allowlist: ['@riik.ee'] });
    expect(refused.allowed).toBe(false);
    if (refused.allowed) return;
    expect(refused.reason).toContain('raamlepingu kontaktisik');
    expect(refused.reason).toContain('EMAIL_ALLOWED_RECIPIENTS');

    // Both halves empty is the one case that still means silence: a fresh
    // volume with no framework data and no configured list.
    const empty = recipientAllowed('keegi@riik.ee', { demoMode: true, allowlist: [] });
    expect(empty.allowed).toBe(false);
    if (empty.allowed) return;
    expect(empty.reason).toContain('raamlepingu andmed on tühjad');
    expect(empty.reason).toContain('EMAIL_ALLOWED_RECIPIENTS');
  });
});
