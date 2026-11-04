/** Owned, offline Chromium fixtures. No feed refresh or real upstream request. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createSocket } from 'node:dgram';
import type { Browser } from 'puppeteer' with { 'resolution-mode': 'import' };
import scraper from '../lib/scraper';
import type { PublicResponse } from '../lib/public-request';

const transport: typeof import('../lib/public-request') = require('../lib/public-request');
const original = transport.requestPublic;
const feed = 'https://www.anthropic.com/engineering';
let mode = 'hydrate';
let hits = 0;
let tcpConnections = 0;
let udpHits = 0;
const server = createServer((_req, res) => {
  hits++;
  res.end('private fixture must not be reached');
});
server.on('connection', () => tcpConnections++);
server.on('upgrade', (_req, socket) => {
  hits++;
  socket.destroy();
});
const udp = createSocket('udp4');
udp.on('message', () => udpHits++);

function response(body: string, contentType = 'text/html'): PublicResponse {
  return { status: 200, headers: { 'content-type': contentType }, body: Buffer.from(body) };
}
async function main() {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  await new Promise<void>((resolve) => udp.bind(0, '127.0.0.1', resolve));
  const privateUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}/`;
  transport.requestPublic = async (value, options) => {
    const url = new URL(value);
    if (url.origin === 'https://red.anthropic.com')
      return {
        status: 301,
        headers: { location: 'https://www.anthropic.com/research/team/frontier-red-team' },
        body: Buffer.alloc(0),
      };
    if (url.origin !== new URL(feed).origin) return original(value, options);
    if (url.pathname === '/hydrate.js')
      return response(
        "document.querySelector('#result').textContent='javascript hydrated'; fetch('/data.json').then(r=>r.json()).then(d=>document.title=d.title);",
        'application/javascript'
      );
    if (url.pathname === '/data.json')
      return response('{"title":"Hydrated feed"}', 'application/json');
    if (url.pathname === '/redirect-private')
      return { status: 302, headers: { location: privateUrl }, body: Buffer.alloc(0) };
    if (mode === 'redirect')
      return { status: 302, headers: { location: privateUrl }, body: Buffer.alloc(0) };
    if (mode === 'loop')
      return {
        status: 302,
        headers: { location: feed + '?next=' + Math.random() },
        body: Buffer.alloc(0),
      };
    if (mode === 'dom')
      return response(
        `<html><body><script>document.body.textContent='x'.repeat(5*1024*1024)</script></body></html>`
      );
    if (mode === 'poisoned-dom')
      return response(
        `<html><body><script>window.TextEncoder=class{encode(){return {byteLength:0}}};document.body.textContent='x'.repeat(5*1024*1024)</script></body></html>`
      );
    if (mode === 'popup')
      return response(
        `<html><body><script>for(let i=0;i<24;i++)window.open('about:blank')</script><p>popup fixture</p></body></html>`
      );
    if (mode === 'fanout')
      return response(
        `<script>for(let i=0;i<150;i++)fetch('/data.json?i='+i).catch(()=>{});</script>`
      );
    const html = `<html><head><title>Before hydration</title></head><body><p id="result"></p>
      <script src="/hydrate.js"></script>
      <img src="${privateUrl}image"><iframe src="${privateUrl}frame"></iframe>
      <script>
        fetch('${privateUrl}fetch').catch(()=>{});
        fetch('/redirect-private').catch(()=>{});
        new WebSocket('${privateUrl.replace('http:', 'ws:')}socket');
        const pc=new RTCPeerConnection({iceServers:[{urls:'stun:127.0.0.1:${udp.address().port}'},{urls:'turn:127.0.0.1:${(server.address() as { port: number }).port}?transport=tcp',username:'fixture',credential:'fixture'}]});
        pc.createDataChannel('fixture');pc.createOffer().then(o=>pc.setLocalDescription(o));
        setTimeout(()=>pc.close(),700);
      </script></body></html>`;
    // Fixture responses also exercise the per-page aggregate accounting callback.
    options?.onBytes?.(Buffer.byteLength(html) * 2);
    return response(html);
  };
  try {
    await assert.rejects(scraper.loadHtml(privateUrl), /registered/);
    await assert.rejects(scraper.loadHtml('https://example.com/article', feed), /origin/);
    assert.match(await scraper.loadHtml('https://red.anthropic.com'), /javascript hydrated/);
    const [html, second] = await Promise.all([scraper.loadHtml(feed), scraper.loadHtml(feed)]);
    assert.match(html, /javascript hydrated/);
    assert.match(html, /<title>Hydrated feed<\/title>/);
    assert.match(second, /javascript hydrated/);
    const browser = await (scraper as unknown as { initBrowser(): Promise<Browser> }).initBrowser();
    assert.equal(browser.browserContexts().length, 1, 'loaders close isolated contexts');
    // A page with no interception must still be blocked by the real browser proxy,
    // including Chromium's normally implicit loopback bypass and WebSocket path.
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await assert.rejects(page.goto(privateUrl, { timeout: 3000 }));
    await page.evaluate((url) => {
      const socket = new WebSocket(url.replace('http:', 'ws:'));
      return new Promise<void>((resolve) => {
        socket.onerror = () => resolve();
        setTimeout(resolve, 500);
      });
    }, privateUrl);
    await context.close();
    for (mode of ['redirect', 'loop', 'dom', 'poisoned-dom', 'fanout']) {
      await assert.rejects(scraper.loadHtml(feed), Error, mode);
      // Abort can settle before asynchronous cleanup; wait on the actual contexts.
      const until = Date.now() + 4000;
      while (browser.browserContexts().length > 1 && Date.now() < until)
        await new Promise((resolve) => setTimeout(resolve, 20));
      assert.equal(browser.browserContexts().length, 1, `${mode} context cleanup`);
    }
    mode = 'popup';
    let peakPages = 0;
    const watch = setInterval(() => {
      peakPages = Math.max(
        peakPages,
        browser.targets().filter((target) => target.type() === 'page').length
      );
    }, 5);
    try {
      assert.match(await scraper.loadHtml(feed), /popup fixture/);
    } finally {
      clearInterval(watch);
    }
    assert.ok(peakPages <= 2, `unexpected popup targets: ${peakPages}`);
    assert.equal(tcpConnections, 0, 'no direct TCP socket reaches the owned private server');
    assert.equal(hits, 0, 'no HTTP or WebSocket reaches the owned private server');
    assert.equal(udpHits, 0, 'no direct WebRTC/STUN UDP reaches the owned private server');
    console.log(
      JSON.stringify({
        javascriptHydration: true,
        isolatedConcurrentPages: true,
        privateHttpAndWebSocketHits: hits,
        privateTcpConnections: tcpConnections,
        directStunPackets: udpHits,
        deniedProxyWithoutInterception: true,
        rejected: [
          'unregistered feed',
          'off-origin enrichment',
          'private redirect',
          'redirect loop',
          'oversized rendered DOM',
          'poisoned DOM intrinsics',
          'popup creation',
          'request fanout',
        ],
      })
    );
  } finally {
    transport.requestPublic = original;
    await scraper.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    udp.close();
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
