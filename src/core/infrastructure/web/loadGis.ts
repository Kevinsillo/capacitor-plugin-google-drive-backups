import type { GisApi } from './GisAuth';

const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client';

let loading: Promise<GisApi> | undefined;

/**
 * Loads the Google Identity Services script once and returns its API. Only runs in a browser.
 * Not unit-tested: it touches the DOM and a remote script; it is checked on the web device test.
 */
export function loadGis(): Promise<GisApi> {
  loading ??= new Promise<GisApi>((resolve, reject) => {
    const existing = (globalThis as unknown as { google?: GisApi }).google;
    if (existing) {
      resolve(existing);
      return;
    }
    const script = document.createElement('script');
    script.src = GIS_SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      const api = (globalThis as unknown as { google?: GisApi }).google;
      if (api) resolve(api);
      else reject(new Error('Google Identity Services did not expose its API'));
    };
    script.onerror = () => {
      loading = undefined;
      reject(new Error('Could not load Google Identity Services'));
    };
    document.head.appendChild(script);
  });
  return loading;
}
