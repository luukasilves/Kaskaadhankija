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
});
