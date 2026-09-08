import { describe, expect, it } from 'vitest';
import {
  canSee,
  isOnline,
  isUnassignedOwner,
  ONLINE_AFTER_MS,
  PLACEHOLDER_OWNER,
} from './index';

describe('isUnassignedOwner', () => {
  it.each<[unknown, boolean]>([
    [undefined, true],
    [null, true],
    ['', true],
    [PLACEHOLDER_OWNER, true],
    ['1234567890', false],
  ])('owner=%p -> unassigned=%p', (input, expected) => {
    expect(isUnassignedOwner(input as string | null | undefined)).toBe(expected);
  });
});

describe('isOnline', () => {
  const now = 1_700_000_000_000;
  const fresh = now - 60_000;
  const stale = now - (ONLINE_AFTER_MS + 1_000);

  it.each<[string, unknown, boolean]>([
    ['no device', null, false],
    ['empty device', {}, false],
    ['lastPing fresh', { lastPing: fresh }, true],
    ['lastPing stale', { lastPing: stale }, false],
    ['ping fallback fresh', { ping: fresh }, true],
    ['ping fallback stale', { ping: stale }, false],
    ['non-numeric lastPing falls through to status', { lastPing: 'x', status: true }, true],
    ['boolean status true', { status: true }, true],
    ['boolean status false', { status: false }, false],
    ['string status true', { status: 'true' }, true],
    ['string status online', { status: 'online' }, true],
    ['string status offline', { status: 'offline' }, false],
    ['no heartbeat info', { modelName: 'X' }, false],
  ])('%s -> %p', (_label, device, expected) => {
    expect(isOnline(device as never, now)).toBe(expected);
  });
});

describe('canSee', () => {
  it('admin sees everything, including unowned', () => {
    expect(canSee(undefined, { kind: 'admin' })).toBe(true);
    expect(canSee('anyone', { kind: 'admin' })).toBe(true);
  });
  it('non-admin sees unassigned devices', () => {
    expect(canSee(undefined, { kind: 'owner', telegramId: 'u1' })).toBe(true);
    expect(canSee(PLACEHOLDER_OWNER, { kind: 'owner', telegramId: 'u1' })).toBe(true);
  });
  it('non-admin sees only their own device', () => {
    expect(canSee('u1', { kind: 'owner', telegramId: 'u1' })).toBe(true);
    expect(canSee('u2', { kind: 'owner', telegramId: 'u1' })).toBe(false);
  });
  it('compares telegramId as string (numbers, mixed types)', () => {
    expect(canSee(12345, { kind: 'owner', telegramId: '12345' })).toBe(true);
  });
});
