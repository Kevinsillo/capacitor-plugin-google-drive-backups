import { ErrorBackup } from '../../domain/errors';

/** Token response from Google Identity Services (token model). */
export interface GisTokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
}

/** The subset of the `google.accounts.oauth2` namespace that the plugin uses. */
export interface GisApi {
  oauth2: {
    initTokenClient(config: {
      client_id: string;
      scope: string;
      callback: (response: GisTokenResponse) => void;
      error_callback?: (error: { type?: string }) => void;
    }): { requestAccessToken(overrides?: { prompt?: string }): void };
    revoke(token: string, done?: () => void): void;
  };
}

export interface GisAuthOptions {
  clientId: string;
  /** OAuth scope, for example `drive.appdata` or `drive.file`. */
  scope: string;
  /** Returns the GIS API. Injectable so the tests do not load the Google script. */
  gis: () => Promise<GisApi>;
  /** Clock in milliseconds. Injectable for the expiry tests. */
  now?: () => number;
}

/** Renew this long before the real expiry, so a request does not start with a token about to die. */
const EXPIRY_MARGIN_MS = 60_000;

/**
 * Access token management with Google Identity Services. The token lives in memory only. GIS cannot
 * renew it silently from the page, so once it expires the caller gets `auth.002` and must sign in again.
 */
export class GisAuth {
  private token?: { value: string; expiresAt: number };
  private everSignedIn = false;

  constructor(private readonly options: GisAuthOptions) {}

  /** Opens the Google sign-in and stores the token. Rejects with `auth.003` if the user closes it or denies access. */
  async signIn(): Promise<void> {
    const gis = await this.options.gis();
    const response = await new Promise<GisTokenResponse>((resolve, reject) => {
      const client = gis.oauth2.initTokenClient({
        client_id: this.options.clientId,
        scope: this.options.scope,
        callback: (result) =>
          result.error || !result.access_token ? reject(new ErrorBackup('auth.003')) : resolve(result),
        error_callback: () => reject(new ErrorBackup('auth.003')),
      });
      client.requestAccessToken();
    });

    this.token = {
      value: response.access_token as string,
      expiresAt: this.now() + (response.expires_in ?? 3600) * 1000,
    };
    this.everSignedIn = true;
  }

  /** The current token. `auth.001` if the user never signed in; `auth.002` if it expired. */
  getToken(): string {
    if (!this.token) {
      throw this.everSignedIn ? new ErrorBackup('auth.002') : new ErrorBackup('auth.001');
    }
    if (this.token.expiresAt - EXPIRY_MARGIN_MS <= this.now()) {
      this.token = undefined;
      throw new ErrorBackup('auth.002');
    }
    return this.token.value;
  }

  isConnected(): boolean {
    return this.token !== undefined && this.token.expiresAt - EXPIRY_MARGIN_MS > this.now();
  }

  /** Revokes the token at Google (best effort) and forgets it locally. */
  async signOut(): Promise<void> {
    const token = this.token?.value;
    this.token = undefined;
    if (!token) return;
    const gis = await this.options.gis();
    await new Promise<void>((resolve) => gis.oauth2.revoke(token, () => resolve()));
  }

  private now(): number {
    return this.options.now ? this.options.now() : Date.now();
  }
}
