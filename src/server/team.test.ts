/**
 * The buyer team [R-01]: the two roles, and the guards on changing them.
 *
 * The role is what separates running a procurement from administering the
 * framework agreement, and moving somebody between them is now the mechanism
 * the narrowed sign-in allowlist depends on [L-08] — everybody arrives as a
 * hankija and is promoted on purpose. So the guards matter: a team that has
 * demoted its last admin can no longer promote anybody.
 */

import { eq } from 'drizzle-orm';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { auditEvents, users } from '@/db/schema';
import { addTeamMember, setTeamMemberActive, setTeamMemberRole } from './team';
import { createHarness, type TestHarness } from './test-support';

let harness: TestHarness;

beforeEach(() => {
  harness = createHarness();
});

afterEach(() => harness.close());

const add = (name: string, email: string, role: 'admin' | 'member') =>
  harness.write((ctx) => addTeamMember(ctx, { name, email, role }));

const roleOf = (id: string) =>
  harness.read((db) => db.select().from(users).where(eq(users.id, id)).get())?.role;

const lastAudit = () =>
  harness.read((db) => db.select().from(auditEvents).all()).at(-1);

describe('the two roles', () => {
  it('adds somebody as a hankija when that is what was asked for', () => {
    const id = add('Kirke Kask', 'kirke@riik.ee', 'member');
    expect(roleOf(id)).toBe('member');
    expect(lastAudit()?.eventType).toBe('team.member_added');
  });

  it('records a promotion as before → after, in the words a reader knows', () => {
    add('Mari Tamm', 'mari@riik.ee', 'admin');
    const id = add('Kirke Kask', 'kirke@riik.ee', 'member');

    harness.write((ctx) => setTeamMemberRole(ctx, id, 'admin'));

    expect(roleOf(id)).toBe('admin');
    const entry = lastAudit();
    expect(entry?.eventType).toBe('team.member_updated');
    // The stored value is `member`; nobody reading the log should have to know
    // that, so the summary uses the label the interface shows.
    expect(entry?.summary).toBe('Kirke Kask (kirke@riik.ee) roll: Hankija → Admin');
    expect(entry?.before).toMatchObject({ role: 'member' });
    expect(entry?.after).toMatchObject({ role: 'admin' });
  });

  it('writes nothing when the role is already what was asked for', () => {
    const id = add('Kirke Kask', 'kirke@riik.ee', 'member');
    const before = harness.read((db) => db.select().from(auditEvents).all()).length;
    harness.write((ctx) => setTeamMemberRole(ctx, id, 'member'));
    expect(harness.read((db) => db.select().from(auditEvents).all())).toHaveLength(before);
  });

  it('refuses a user it cannot find', () => {
    expect(() => harness.write((ctx) => setTeamMemberRole(ctx, 'ei-ole', 'admin'))).toThrow(
      /ei leitud/,
    );
  });
});

describe('the last active admin', () => {
  it('cannot be demoted', () => {
    const admin = add('Mari Tamm', 'mari@riik.ee', 'admin');
    add('Kirke Kask', 'kirke@riik.ee', 'member');

    // A hankija cannot promote anybody, so demoting the only admin would leave
    // the team with no way back — the same reason deactivating them is refused.
    expect(() => harness.write((ctx) => setTeamMemberRole(ctx, admin, 'member'))).toThrow(
      /[Vv]iimase aktiivse admini/,
    );
    expect(roleOf(admin)).toBe('admin');
  });

  it('can be demoted once somebody else is an admin', () => {
    const admin = add('Mari Tamm', 'mari@riik.ee', 'admin');
    const other = add('Kirke Kask', 'kirke@riik.ee', 'member');

    harness.write((ctx) => setTeamMemberRole(ctx, other, 'admin'));
    harness.write((ctx) => setTeamMemberRole(ctx, admin, 'member'));

    expect(roleOf(admin)).toBe('member');
    expect(roleOf(other)).toBe('admin');
  });

  it('counts only the active ones', () => {
    const admin = add('Mari Tamm', 'mari@riik.ee', 'admin');
    const second = add('Teine Admin', 'teine@riik.ee', 'admin');
    harness.write((ctx) => setTeamMemberActive(ctx, second, false));

    // A deactivated admin cannot sign in, so they are no help to a team that
    // has just demoted the only person who could.
    expect(() => harness.write((ctx) => setTeamMemberRole(ctx, admin, 'member'))).toThrow(
      /[Vv]iimase aktiivse admini/,
    );
  });
});
