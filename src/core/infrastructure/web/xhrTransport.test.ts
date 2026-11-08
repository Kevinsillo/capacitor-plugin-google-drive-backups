import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { xhrTransport } from './xhrTransport';

/** Minimal `XMLHttpRequest` double. The test drives it through `respond`, `fail` and `progress`. */
class FakeXhr {
  static last: FakeXhr;
  method = '';
  url = '';
  headers: Record<string, string> = {};
  body: unknown;
  status = 0;
  response: unknown = null;
  rawHeaders = '';
  responseType = '';
  aborted = false;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = {
    onprogress: null,
  };

  constructor() {
    FakeXhr.last = this;
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  send(body: unknown) {
    this.body = body;
  }
  abort() {
    this.aborted = true;
  }
  getAllResponseHeaders() {
    return this.rawHeaders;
  }
  respond(status: number, body: unknown, rawHeaders = 'content-type: application/json') {
    this.status = status;
    this.response = body;
    this.rawHeaders = rawHeaders;
    this.onload?.();
  }
  progress(loaded: number, total: number) {
    this.upload.onprogress?.({ lengthComputable: true, loaded, total });
  }
}

const realXhr = globalThis.XMLHttpRequest;

beforeEach(() => {
  (globalThis as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = FakeXhr;
});

afterEach(() => {
  (globalThis as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = realXhr;
});

describe('xhrTransport', () => {
  it('sends the method, URL, headers and body', async () => {
    const pending = xhrTransport('https://example.test/up', {
      method: 'POST',
      headers: { Authorization: 'Bearer T' },
      body: 'payload',
    });
    FakeXhr.last.respond(200, new Blob(['ok']));
    await pending;

    expect(FakeXhr.last.method).toBe('POST');
    expect(FakeXhr.last.url).toBe('https://example.test/up');
    expect(FakeXhr.last.headers.authorization).toBe('Bearer T');
    expect(FakeXhr.last.body).toBe('payload');
  });

  it('resolves a Response with the status, headers and body', async () => {
    const pending = xhrTransport('https://example.test/x', { method: 'GET' });
    FakeXhr.last.respond(200, new Blob(['hello']), 'content-type: text/plain\r\nx-custom: 1');
    const response = await pending;

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/plain');
    expect(response.headers.get('x-custom')).toBe('1');
    expect(await response.text()).toBe('hello');
  });

  it('a 204 response has no body and does not throw', async () => {
    const pending = xhrTransport('https://example.test/x', { method: 'DELETE' });
    FakeXhr.last.respond(204, new Blob([]), '');
    const response = await pending;
    expect(response.status).toBe(204);
    expect(response.body).toBeNull();
  });

  it('reports upload progress through the callback', async () => {
    const seen: [number, number][] = [];
    const pending = xhrTransport('https://example.test/up', { method: 'POST' }, (bytes, total) =>
      seen.push([bytes, total]),
    );
    FakeXhr.last.progress(5, 10);
    FakeXhr.last.progress(10, 10);
    FakeXhr.last.respond(200, new Blob([]));
    await pending;
    expect(seen).toEqual([
      [5, 10],
      [10, 10],
    ]);
  });

  it('a network error rejects with TypeError', async () => {
    const pending = xhrTransport('https://example.test/x', { method: 'GET' });
    FakeXhr.last.onerror?.();
    await expect(pending).rejects.toBeInstanceOf(TypeError);
  });

  it('a timeout rejects with TimeoutError', async () => {
    const pending = xhrTransport('https://example.test/x', { method: 'GET' });
    FakeXhr.last.ontimeout?.();
    await expect(pending).rejects.toMatchObject({ name: 'TimeoutError' });
  });

  it('aborting the signal aborts the request and rejects with AbortError', async () => {
    const control = new AbortController();
    const pending = xhrTransport('https://example.test/x', { method: 'GET', signal: control.signal });
    control.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(FakeXhr.last.aborted).toBe(true);
  });

  it('an already aborted signal rejects without sending anything', async () => {
    const control = new AbortController();
    control.abort();
    await expect(
      xhrTransport('https://example.test/x', { method: 'GET', signal: control.signal }),
    ).rejects.toMatchObject({
      name: 'AbortError',
    });
  });
});
