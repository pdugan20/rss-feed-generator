/** Actual loopback sockets; public-address policy is exercised in its own suite. */
import { createServer as httpServer } from 'node:http';
import { createServer as httpsServer, type RequestOptions } from 'node:https';
import type { IncomingMessage } from 'node:http';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
const fixture = { cert: Buffer.alloc(0), httpPort: 0, httpsPort: 0 };
jest.mock('node:net', () => ({
  ...jest.requireActual('node:net'),
  BlockList: class {
    addSubnet() {}
    check() {
      return false;
    }
  },
}));
jest.mock('node:dns/promises', () => ({
  lookup: async () => [{ address: '127.0.0.1', family: 4 }],
}));
jest.mock('node:https', () => ({
  ...jest.requireActual('node:https'),
  request: (url: URL, options: RequestOptions, callback: (res: IncomingMessage) => void) =>
    jest
      .requireActual('node:https')
      .request(url, { ...options, port: fixture.httpsPort, ca: fixture.cert }, callback),
}));
jest.mock('node:http', () => ({
  ...jest.requireActual('node:http'),
  request: (url: URL, options: RequestOptions, callback: (res: IncomingMessage) => void) =>
    jest.requireActual('node:http').request(url, { ...options, port: fixture.httpPort }, callback),
}));
import { requestPublic, fetchPublicJson } from '../../lib/public-request';
let directory: string;
let key: Buffer;
beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), 'rss-test-tls-'));
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-subj',
      '/CN=example.test',
      '-addext',
      'subjectAltName=DNS:example.test',
      '-days',
      '1',
      '-keyout',
      join(directory, 'key.pem'),
      '-out',
      join(directory, 'cert.pem'),
    ],
    { stdio: 'ignore' }
  );
  key = readFileSync(join(directory, 'key.pem'));
  fixture.cert = readFileSync(join(directory, 'cert.pem'));
});
afterAll(() => {
  if (directory) rmSync(directory, { recursive: true, force: true });
});
it('preserves Host, SNI and certificate verification on the pinned TLS socket', async () => {
  let host: string | undefined;
  let sni: string | false | undefined | null;
  const server = httpsServer({ key, cert: fixture.cert }, (req, res) => {
    host = req.headers.host;
    res.end('fixture');
  });
  server.on('secureConnection', (socket) => {
    sni = socket.servername;
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  fixture.httpsPort = (server.address() as { port: number }).port;
  try {
    expect((await requestPublic('https://example.test/')).body.toString()).toBe('fixture');
    expect(host).toBe(`example.test:${fixture.httpsPort}`);
    expect(sni).toBe('example.test');
    expect(
      (await requestPublic('https://example.test/', { headers: { Host: 'attacker.test' } })).status
    ).toBe(200);
    expect(host).toBe(`example.test:${fixture.httpsPort}`);
    expect(sni).toBe('example.test');
    await expect(requestPublic('https://wrong.test/')).rejects.toThrow(
      /certificate|altname|Hostname/i
    );
  } finally {
    server.closeAllConnections();
    server.close();
    await once(server, 'close');
  }
});
it('closes a pre-header socket at the request deadline', async () => {
  let closed = false;
  const server = httpServer(() => {});
  server.on('connection', (socket) =>
    socket.once('close', () => {
      closed = true;
    })
  );
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  fixture.httpPort = (server.address() as { port: number }).port;
  try {
    await expect(requestPublic('http://example.test/', { timeoutMs: 50 })).rejects.toThrow(
      /deadline/
    );
    const until = Date.now() + 1000;
    while (!closed && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 10));
    expect(closed).toBe(true);
  } finally {
    server.closeAllConnections();
    server.close();
    await once(server, 'close');
  }
});
it('rejects real header overflow and truncated bodies', async () => {
  const server = httpServer((req, res) => {
    if (req.url === '/headers') res.writeHead(200, { 'X-Oversize': 'x'.repeat(20 * 1024) }).end();
    else {
      res.writeHead(200, { 'Content-Length': 20 });
      res.write('short');
      res.flushHeaders();
      setTimeout(() => res.socket?.destroy(), 20);
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  fixture.httpPort = (server.address() as { port: number }).port;
  try {
    await expect(requestPublic('http://example.test/headers')).rejects.toThrow(/header|overflow/i);
    await expect(requestPublic('http://example.test/truncated')).rejects.toThrow();
  } finally {
    server.closeAllConnections();
    server.close();
    await once(server, 'close');
  }
});

it('honors JSON caller cancellation during a real body transfer and closes its socket', async () => {
  const ctrl = new AbortController();
  let closed = false;
  const server = httpsServer({ key, cert: fixture.cert }, (_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.write('{');
    setTimeout(() => ctrl.abort(new Error('cancelled in transfer')), 30);
  });
  server.on('connection', (socket) =>
    socket.once('close', () => {
      closed = true;
    })
  );
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  fixture.httpsPort = (server.address() as { port: number }).port;
  try {
    await expect(
      fetchPublicJson('https://example.test/delayed', { signal: ctrl.signal })
    ).rejects.toThrow('cancelled in transfer');
    const until = Date.now() + 1000;
    while (!closed && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 10));
    expect(closed).toBe(true);
  } finally {
    server.closeAllConnections();
    server.close();
    await once(server, 'close');
  }
});
