import { lookup } from 'node:dns/promises';
import { request as httpRequest, type IncomingHttpHeaders } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP } from 'node:net';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { BoundedGate } from './bounded-gate';
import { createGunzip, createInflate, createBrotliDecompress } from 'node:zlib';

export const REQUEST_TIMEOUT_MS = 15_000;
export const MAX_BODY_BYTES = 4 * 1024 * 1024;
export const MAX_REQUEST_BYTES = 64 * 1024;
export const MAX_REDIRECTS = 5;
const requests = new BoundedGate(8, 64);

const blocked = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  blocked.addSubnet(address, prefix, 'ipv4');
const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');
blocked.addSubnet('2001::', 23, 'ipv6');
blocked.addSubnet('2002::', 16, 'ipv6');
blocked.addSubnet('3ffe::', 16, 'ipv6');
blocked.addSubnet('3fff::', 20, 'ipv6');
blocked.addSubnet('2001:db8::', 32, 'ipv6');

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !blocked.check(address, 'ipv4');
  // Exclude mapped, translated, tunnelling and non-global IPv6 addresses.
  return family === 6 && globalV6.check(address, 'ipv6') && !blocked.check(address, 'ipv6');
}

export function checkedUrl(value: string): URL {
  if (value.length > 16 * 1024) throw new Error('URL exceeds length limit');
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) {
    throw new Error('Only credential-free HTTP(S) on standard ports is allowed');
  }
  return url;
}

// OS lookups preserve /etc/hosts and split DNS. Active getaddrinfo calls cannot
// be cancelled, so keep at most two outstanding even after callers time out.
let activeLookups = 0;
const lookupWaiters: {
  signal: AbortSignal;
  ready: () => void;
  abort: () => void;
}[] = [];
function acquireLookup(signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  if (activeLookups < 2) {
    activeLookups++;
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const waiter = {
      signal,
      ready: resolve,
      abort: () => {
        const index = lookupWaiters.indexOf(waiter);
        if (index >= 0) lookupWaiters.splice(index, 1);
        reject(signal.reason);
      },
    };
    lookupWaiters.push(waiter);
    signal.addEventListener('abort', waiter.abort, { once: true });
  });
}
function releaseLookup() {
  activeLookups--;
  const waiter = lookupWaiters.shift();
  if (waiter) {
    waiter.signal.removeEventListener('abort', waiter.abort);
    activeLookups++;
    waiter.ready();
  }
}
async function resolveAddresses(hostname: string, signal: AbortSignal) {
  await acquireLookup(signal);
  try {
    signal.throwIfAborted();
    return await lookup(hostname, { all: true });
  } finally {
    releaseLookup();
  }
}

export interface PublicResponse {
  status: number;
  headers: IncomingHttpHeaders;
  body: Buffer;
}
export interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
  maxBytes?: number;
  timeoutMs?: number;
  onBytes?: (count: number) => void;
}

// These headers belong to this connection, not the browser connection we fulfill.
const HOP_HEADERS = new Set([
  'connection',
  'proxy-connection',
  'keep-alive',
  'transfer-encoding',
  'te',
  'trailer',
  'upgrade',
  'proxy-authenticate',
  'proxy-authorization',
]);
export function endToEndHeaders(headers: IncomingHttpHeaders): IncomingHttpHeaders {
  const normalized = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  );
  const connectionTokens = String(normalized.connection ?? '')
    .toLowerCase()
    .split(',')
    .map((v) => v.trim());
  return Object.fromEntries(
    Object.entries(normalized).filter(
      ([key]) => !HOP_HEADERS.has(key) && !connectionTokens.includes(key)
    )
  );
}

async function requestOnce(
  url: URL,
  options: RequestOptions,
  signal: AbortSignal
): Promise<PublicResponse> {
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const family = isIP(hostname);
  const addresses = family
    ? [{ address: hostname, family }]
    : await resolveAddresses(hostname, signal);
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new Error('Destination must resolve only to public network addresses');
  }
  signal.throwIfAborted();
  const maxBytes = options.maxBytes ?? MAX_BODY_BYTES;
  const headers = endToEndHeaders(options.headers ?? {});
  delete headers.host;
  delete headers['content-length'];
  // Avoid compression where possible; still cap both compressed and decoded streams.
  headers['accept-encoding'] = 'identity';
  if (options.body !== undefined)
    headers['content-length'] = String(Buffer.byteLength(options.body));
  return new Promise((resolve, reject) => {
    const request = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = request(
      url,
      {
        method: options.method ?? 'GET',
        headers,
        agent: false,
        signal,
        maxHeaderSize: 16 * 1024,
        lookup: (_host, settings, callback) => {
          if (settings.all) callback(null, addresses);
          else callback(null, addresses[0].address, addresses[0].family);
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const responseHeaders = endToEndHeaders(res.headers);
        if (
          [301, 302, 303, 307, 308].includes(status) ||
          options.method === 'HEAD' ||
          status === 204 ||
          status === 304
        ) {
          res.destroy();
          resolve({ status, headers: responseHeaders, body: Buffer.alloc(0) });
          return;
        }
        if (Number(res.headers['content-length']) > maxBytes) {
          res.destroy();
          reject(new Error('Response exceeds byte limit'));
          return;
        }
        const encoding = res.headers['content-encoding']?.toLowerCase();
        const decoder =
          !encoding || encoding === 'identity'
            ? null
            : encoding === 'gzip'
              ? createGunzip()
              : encoding === 'deflate'
                ? createInflate()
                : encoding === 'br'
                  ? createBrotliDecompress()
                  : undefined;
        if (decoder === undefined) {
          res.destroy();
          reject(new Error('Unsupported response encoding'));
          return;
        }
        let rawSize = 0;
        const rawLimit = new Transform({
          transform(chunk: Buffer, _encoding, done) {
            try {
              options.onBytes?.(chunk.length);
            } catch (error) {
              done(error as Error);
              return;
            }
            rawSize += chunk.length;
            done(rawSize > maxBytes ? new Error('Response exceeds byte limit') : null, chunk);
          },
        });
        let storage = Buffer.allocUnsafe(Math.min(maxBytes, 64 * 1024));
        let size = 0;
        const collect = new Transform({
          transform(chunk: Buffer, _encoding, done) {
            try {
              options.onBytes?.(chunk.length);
            } catch (error) {
              done(error as Error);
              return;
            }
            const nextSize = size + chunk.length;
            if (nextSize > maxBytes) {
              done(new Error('Decoded response exceeds byte limit'));
              return;
            }
            if (nextSize > storage.length) {
              const grown = Buffer.allocUnsafe(
                Math.min(maxBytes, Math.max(nextSize, storage.length * 2))
              );
              storage.copy(grown, 0, 0, size);
              storage = grown;
            }
            chunk.copy(storage, size);
            size = nextSize;
            done();
          },
        });
        const streams = decoder
          ? ([res, rawLimit, decoder, collect] as const)
          : ([res, rawLimit, collect] as const);
        pipeline(streams, { signal }).then(() => {
          delete responseHeaders['content-encoding'];
          delete responseHeaders['content-length'];
          resolve({
            status,
            headers: responseHeaders,
            body: Buffer.from(storage.subarray(0, size)),
          });
        }, reject);
      }
    );
    req.once('error', reject);
    req.end(options.body);
  });
}

/** No automatic redirects: callers must validate each new destination. DNS is pinned into the actual socket. */
export async function requestPublic(
  value: string,
  options: RequestOptions = {}
): Promise<PublicResponse> {
  const method = options.method ?? 'GET';
  if (!['GET', 'HEAD', 'POST', 'OPTIONS'].includes(method))
    throw new Error('Request method is not allowed');
  if (Buffer.byteLength(options.body ?? '') > MAX_REQUEST_BYTES)
    throw new Error('Request exceeds byte limit');
  const maxBytes = options.maxBytes ?? MAX_BODY_BYTES;
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  if (
    !Number.isSafeInteger(maxBytes) ||
    maxBytes <= 0 ||
    maxBytes > MAX_BODY_BYTES ||
    !Number.isFinite(timeoutMs) ||
    timeoutMs <= 0 ||
    timeoutMs > REQUEST_TIMEOUT_MS
  )
    throw new Error('Invalid request limits');
  const headerBytes = Object.entries(options.headers ?? {}).reduce(
    (sum, [key, value]) => sum + Buffer.byteLength(key) + Buffer.byteLength(value) + 4,
    0
  );
  if (headerBytes > 16 * 1024) throw new Error('Request headers exceed byte limit');
  const ctrl = new AbortController();
  const signal = options.signal ? AbortSignal.any([options.signal, ctrl.signal]) : ctrl.signal;
  signal.throwIfAborted();
  const timer = setTimeout(() => ctrl.abort(new Error('Request deadline exceeded')), timeoutMs);
  let abort: () => void = () => {};
  const aborted = new Promise<never>((_resolve, reject) => {
    abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
  });
  try {
    return await Promise.race([
      requests.run(signal, () => requestOnce(checkedUrl(value), options, signal)),
      aborted,
    ]);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
  }
}

/** API endpoints are fixed in source. Redirects must stay on that exact HTTPS origin. */
export async function fetchPublicJson(value: string, options: RequestOptions = {}) {
  const initial = checkedUrl(value);
  if (initial.protocol !== 'https:') throw new Error('API requests require HTTPS');
  const deadline = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const signal = options.signal ? AbortSignal.any([options.signal, deadline]) : deadline;
  signal.throwIfAborted();
  let current = initial;
  let method = options.method ?? 'GET';
  let body = options.body;
  for (let count = 0; ; count++) {
    const response = await requestPublic(current.href, { ...options, method, body, signal });
    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return {
        ok: response.status >= 200 && response.status < 300,
        status: response.status,
        json: async (): Promise<unknown> => JSON.parse(response.body.toString('utf8')),
      };
    }
    if (count >= MAX_REDIRECTS || !response.headers.location)
      throw new Error('API redirect limit or location invalid');
    const next = checkedUrl(new URL(response.headers.location, current).href);
    if (next.origin !== initial.origin) throw new Error('API redirect changed origin');
    if (
      response.status === 303 ||
      ((response.status === 301 || response.status === 302) && method === 'POST')
    ) {
      method = 'GET';
      body = undefined;
    }
    current = next;
  }
}
