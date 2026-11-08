import type { Transport } from '../drive/DriveRestClient';

/**
 * Transport built on `XMLHttpRequest`. Unlike `fetch`, it reports upload progress.
 * Cancellation through `AbortSignal` aborts the request and rejects with `AbortError`.
 */
export const xhrTransport: Transport = (url, init, onUploadProgress) =>
  new Promise<Response>((resolve, reject) => {
    const signal = init.signal ?? undefined;
    if (signal?.aborted) {
      reject(new DOMException('The operation was aborted', 'AbortError'));
      return;
    }

    const xhr = new XMLHttpRequest();
    xhr.open(init.method ?? 'GET', url, true);
    xhr.responseType = 'blob';
    new Headers(init.headers).forEach((value, name) => xhr.setRequestHeader(name, value));

    if (onUploadProgress && xhr.upload) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onUploadProgress(event.loaded, event.total);
      };
    }

    const onAbort = () => {
      xhr.abort();
      reject(new DOMException('The operation was aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    xhr.onload = () => {
      signal?.removeEventListener('abort', onAbort);
      // A 204 response has no body, and `Response` refuses a body with that status.
      const body = xhr.status === 204 ? null : (xhr.response as Blob);
      resolve(new Response(body, { status: xhr.status, headers: parseHeaders(xhr.getAllResponseHeaders()) }));
    };
    xhr.onerror = () => {
      signal?.removeEventListener('abort', onAbort);
      reject(new TypeError('Network request failed'));
    };
    xhr.ontimeout = () => {
      signal?.removeEventListener('abort', onAbort);
      reject(new DOMException('The request timed out', 'TimeoutError'));
    };

    xhr.send((init.body as XMLHttpRequestBodyInit | null | undefined) ?? null);
  });

/** Parses the raw header block (`name: value` per line) into a `Headers` object. */
function parseHeaders(raw: string): Headers {
  const headers = new Headers();
  for (const line of raw.trim().split(/\r?\n/)) {
    const separator = line.indexOf(':');
    if (separator > 0) headers.append(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
  }
  return headers;
}
