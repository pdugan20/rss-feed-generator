import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { gzipSync, brotliCompressSync, deflateSync } from 'node:zlib';
jest.mock('node:dns/promises', () => ({ lookup: jest.fn() }));
jest.mock('node:http', () => ({ request: jest.fn() }));
jest.mock('node:https', () => ({ request: jest.fn() }));
import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import {
  requestPublic,
  fetchPublicJson,
  isPublicAddress,
  endToEndHeaders,
} from '../../lib/public-request';
const dns = jest.mocked(lookup);
const connect = jest.mocked(request);
function reply(status = 200, body: string | Buffer = 'ok', headers = {}, after?: () => void) {
  connect.mockImplementationOnce(((
    _url: URL,
    options: { signal: AbortSignal },
    callback: (res: unknown) => void
  ) => {
    const req = Object.assign(new EventEmitter(), { end: jest.fn() });
    queueMicrotask(() => {
      const res = Object.assign(Readable.from([Buffer.from(body)]), {
        statusCode: status,
        headers,
      });
      options.signal.addEventListener('abort', () => res.destroy(options.signal.reason), {
        once: true,
      });
      callback(res);
      after?.();
    });
    return req;
  }) as never);
}
beforeEach(() => {
  dns.mockReset().mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);
  connect.mockReset();
});
it.each([
  '127.0.0.1',
  '10.0.0.1',
  '169.254.169.254',
  '100.64.0.1',
  '192.168.1.1',
  '0.0.0.0',
  '224.1.1.1',
  '::1',
  'fe80::1',
  'fc00::1',
  '::ffff:127.0.0.1',
  '64:ff9b::7f00:1',
  '2002:7f00:1::',
  '2001:db8::1',
])('rejects special address %s', (address) => expect(isPublicAddress(address)).toBe(false));
it.each(['93.184.216.34', '8.8.8.8', '2606:4700:4700::1111'])(
  'permits public address %s',
  (address) => expect(isPublicAddress(address)).toBe(true)
);
it.each([
  'file:///etc/passwd',
  'data:text/plain,x',
  'https://user:secret@example.com',
  'https://2130706433/',
  'https://[::ffff:7f00:1]/',
  'https://example.com:8080/',
])('never connects to %s', async (url) => {
  await expect(requestPublic(url)).rejects.toThrow();
  expect(connect).not.toHaveBeenCalled();
});
it('rejects mixed public/private DNS answers', async () => {
  dns.mockResolvedValue([
    { address: '93.184.216.34', family: 4 },
    { address: '127.0.0.1', family: 4 },
  ] as never);
  await expect(requestPublic('https://example.com')).rejects.toThrow(/public/);
  expect(connect).not.toHaveBeenCalled();
});
it('pins the validated lookup into the actual request while retaining the hostname', async () => {
  reply();
  await requestPublic('https://example.com/');
  const [url, options] = connect.mock.calls[0] as unknown as [
    URL,
    { agent: boolean; lookup: (host: string, options: { all: boolean }, cb: unknown) => void },
  ];
  expect(url.hostname).toBe('example.com');
  expect(options.agent).toBe(false);
  const done = jest.fn();
  options.lookup('example.com', { all: true }, done);
  expect(done).toHaveBeenCalledWith(null, [{ address: '93.184.216.34', family: 4 }]);
  expect(dns).toHaveBeenCalledTimes(1);
});
it('rechecks DNS after a same-origin API redirect and rejects rebinding', async () => {
  dns
    .mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }] as never)
    .mockResolvedValueOnce([{ address: '10.0.0.1', family: 4 }] as never);
  reply(302, '', { location: '/moved' });
  await expect(fetchPublicJson('https://example.com')).rejects.toThrow(/public/);
  expect(connect).toHaveBeenCalledTimes(1);
});
it('blocks API redirects to other origins and bounds loops', async () => {
  reply(302, '', { location: 'https://other.example/' });
  await expect(fetchPublicJson('https://example.com')).rejects.toThrow(/origin/);
  for (let i = 0; i < 6; i++) reply(302, '', { location: '/again' });
  await expect(fetchPublicJson('https://example.com')).rejects.toThrow(/redirect limit/);
});
it('preserves intentional AP-style POSTs and valid JSON', async () => {
  reply(200, '{"Items":[]}', { 'content-type': 'application/json' });
  const result = await fetchPublicJson('https://example.com/search', {
    method: 'POST',
    body: '{"query":"fixture"}',
    headers: { 'content-type': 'application/json' },
  });
  expect(await result.json()).toEqual({ Items: [] });
  expect(connect.mock.calls[0][1]).toMatchObject({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
  });
});
it('rejects both advertised and streamed oversized bodies', async () => {
  reply(200, 'small', { 'content-length': '100' });
  await expect(requestPublic('https://example.com', { maxBytes: 4 })).rejects.toThrow(/byte limit/);
  reply(200, 'oversize');
  await expect(requestPublic('https://example.com', { maxBytes: 4 })).rejects.toThrow(/byte limit/);
});
it.each([
  ['gzip', gzipSync],
  ['br', brotliCompressSync],
  ['deflate', deflateSync],
] as const)(
  'bounds decoded %s responses and preserves small bodies',
  async (encoding, compress) => {
    reply(200, compress('x'.repeat(10000)), { 'content-encoding': encoding });
    await expect(requestPublic('https://example.com', { maxBytes: 1000 })).rejects.toThrow(
      /byte limit/
    );
    reply(200, compress('small'), { 'content-encoding': encoding });
    const result = await requestPublic('https://example.com', { maxBytes: 1000 });
    expect(result.body.toString()).toBe('small');
    expect(result.headers['content-encoding']).toBeUndefined();
  }
);
it('aggregate byte accounting includes partial responses', async () => {
  reply(200, 'a'.repeat(100));
  let total = 0;
  await expect(
    requestPublic('https://example.com', {
      onBytes: (n) => {
        total += n;
        throw new Error('aggregate budget');
      },
    })
  ).rejects.toThrow(/aggregate/);
  expect(total).toBeGreaterThan(0);
});
it('times out hung DNS and never connects after a late answer', async () => {
  let finish!: (value: unknown) => void;
  dns.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }) as never
  );
  await expect(requestPublic('https://example.com', { timeoutMs: 20 })).rejects.toThrow(/deadline/);
  finish([{ address: '93.184.216.34', family: 4 }]);
  await new Promise((resolve) => setImmediate(resolve));
  expect(connect).not.toHaveBeenCalled();
});
it('strips hop-by-hop headers but preserves multi-value cookies', () => {
  expect(
    endToEndHeaders({
      connection: 'x-private, Keep-Alive',
      'x-private': 'hidden',
      'keep-alive': 'timeout=5',
      'set-cookie': ['a=1', 'b=2'],
      'content-type': 'text/html',
    })
  ).toEqual({ 'set-cookie': ['a=1', 'b=2'], 'content-type': 'text/html' });
});

it('cancels an API operation before dispatch and between redirect hops', async () => {
  const cancelled = new AbortController();
  cancelled.abort(new Error('cancelled'));
  await expect(
    fetchPublicJson('https://example.com', { signal: cancelled.signal })
  ).rejects.toThrow('cancelled');
  expect(connect).not.toHaveBeenCalled();
  const during = new AbortController();
  reply(302, '', { location: '/moved' }, () => during.abort(new Error('stopped')));
  await expect(fetchPublicJson('https://example.com', { signal: during.signal })).rejects.toThrow(
    'stopped'
  );
  expect(connect).toHaveBeenCalledTimes(1);
});
it('normalizes case before stripping controlled and connection-nominated headers', async () => {
  reply();
  await requestPublic('https://example.com', {
    headers: {
      Host: 'attacker.test',
      'Content-Length': '999',
      Connection: 'X-Secret',
      'X-Secret': 'hidden',
    },
  });
  expect(connect.mock.calls[0][1]).toMatchObject({ headers: { 'accept-encoding': 'identity' } });
  const headers = (connect.mock.calls[0][1] as { headers: Record<string, string> }).headers;
  expect(headers.host).toBeUndefined();
  expect(headers['content-length']).toBeUndefined();
  expect(headers['x-secret']).toBeUndefined();
});
