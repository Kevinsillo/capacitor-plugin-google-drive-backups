import { describe, expect, it } from 'vitest';

import { ErrorBackup } from '../../domain/errors';

import { GisAuth, type GisApi, type GisTokenResponse } from './GisAuth';

interface FakeGis {
  api: GisApi;
  /** The config of the last `initTokenClient` call. */
  config: () => { callback: (r: GisTokenResponse) => void; error_callback?: (e: { type?: string }) => void };
  revoked: string[];
}

/** GIS double. The test decides how the popup ends (token, error or closed). */
function fakeGis(): FakeGis {
  let config: ReturnType<FakeGis['config']> | undefined;
  const revoked: string[] = [];
  return {
    api: {
      oauth2: {
        initTokenClient(c) {
          config = c;
          return {
            requestAccessToken: () => {
              // The test drives the outcome through the captured callbacks.
            },
          };
        },
        revoke(token, done) {
          revoked.push(token);
          done?.();
        },
      },
    },
    config: () => {
      if (!config) throw new Error('initTokenClient was not called');
      return config;
    },
    revoked,
  };
}

function authWith(gis: FakeGis, clock: { now: number }) {
  return new GisAuth({
    clientId: 'client-id',
    scope: 'https://www.googleapis.com/auth/drive.appdata',
    gis: async () => gis.api,
    now: () => clock.now,
  });
}

/** signIn awaits the GIS loader before it creates the token client; let that microtask run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return error instanceof ErrorBackup ? error.code : `not-ErrorBackup: ${String(error)}`;
  }
  return 'resolved';
}

describe('GisAuth', () => {
  it('a successful sign-in stores the token and reports connected', async () => {
    const gis = fakeGis();
    const clock = { now: 0 };
    const auth = authWith(gis, clock);

    const pending = auth.signIn();
    await settle();
    gis.config().callback({ access_token: 'T1', expires_in: 3600 });
    await pending;

    expect(auth.getToken()).toBe('T1');
    expect(auth.isConnected()).toBe(true);
  });

  it('a user who closes the popup or denies access gets auth.003', async () => {
    const gis = fakeGis();
    const auth = authWith(gis, { now: 0 });

    const closed = auth.signIn();
    await settle();
    gis.config().error_callback?.({ type: 'popup_closed' });
    expect(await codeOf(closed)).toBe('auth.003');

    const denied = auth.signIn();
    await settle();
    gis.config().callback({ error: 'access_denied' });
    expect(await codeOf(denied)).toBe('auth.003');
  });

  it('before any sign-in, getToken gives auth.001', () => {
    const auth = authWith(fakeGis(), { now: 0 });
    expect(() => auth.getToken()).toThrow(ErrorBackup);
    try {
      auth.getToken();
    } catch (error) {
      expect((error as ErrorBackup).code).toBe('auth.001');
    }
  });

  it('after the token expires, getToken gives auth.002, not auth.001', async () => {
    const gis = fakeGis();
    const clock = { now: 0 };
    const auth = authWith(gis, clock);

    const pending = auth.signIn();
    await settle();
    gis.config().callback({ access_token: 'T1', expires_in: 3600 });
    await pending;

    clock.now = 3600 * 1000; // past the expiry
    expect(() => auth.getToken()).toThrow();
    try {
      auth.getToken();
    } catch (error) {
      expect((error as ErrorBackup).code).toBe('auth.002');
    }
    expect(auth.isConnected()).toBe(false);
  });

  it('renews early: the token counts as expired one minute before its real expiry', async () => {
    const gis = fakeGis();
    const clock = { now: 0 };
    const auth = authWith(gis, clock);

    const pending = auth.signIn();
    await settle();
    gis.config().callback({ access_token: 'T1', expires_in: 3600 });
    await pending;

    clock.now = 3600 * 1000 - 60_000; // exactly the margin
    expect(auth.isConnected()).toBe(false);
  });

  it('signing out revokes the token and forgets it', async () => {
    const gis = fakeGis();
    const auth = authWith(gis, { now: 0 });

    const pending = auth.signIn();
    await settle();
    gis.config().callback({ access_token: 'T1', expires_in: 3600 });
    await pending;

    await auth.signOut();
    expect(gis.revoked).toEqual(['T1']);
    expect(auth.isConnected()).toBe(false);
  });

  it('signing out without a token does not call Google', async () => {
    const gis = fakeGis();
    await authWith(gis, { now: 0 }).signOut();
    expect(gis.revoked).toEqual([]);
  });
});
