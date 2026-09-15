#!/usr/bin/env node
// Optional local presentation server. It forwards the signed-in user's JWT;
// it never loads management credentials or changes production CORS settings.
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { environments } from '../admin/environments.js';

const adminDirectory = new URL('../admin/', import.meta.url);
const functions = new Set(['admin-stats', 'admin-pipeline', 'staff-site-access', 'connection-review']);
const bodyLimit = 64 * 1024;
const types = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', json: 'application/json' };

function reply(response, status, data) {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify({ error: { message: data } }));
}

function requestBody(request) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', chunk => {
      size += chunk.length;
      if (size > bodyLimit) reject(new Error('body-limit'));
      else chunks.push(chunk);
    });
    request.on('end', () => resolveBody(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

export async function createPresentationServer({ fetchImpl = fetch } = {}) {
  // Serve only portal files; .env, .git and other repository files are excluded.
  const assets = new Map();
  for (const entry of await readdir(adminDirectory, { withFileTypes: true })) {
    if (!entry.isFile() || !/^[a-z][a-z-]*\.(?:html|js|css|json)$/.test(entry.name)) continue;
    let body = await readFile(new URL(entry.name, adminDirectory));
    if (entry.name === 'index.html') {
      body = Buffer.from(body.toString().replace('<head>', '<head>\n  <meta name="moose-local-proxy" content="enabled" />'));
    }
    assets.set(`/admin/${entry.name}`, { body, type: types[entry.name.split('.').pop()] });
  }

  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Frame-Options', 'DENY');
    const port = server.address().port;
    const host = request.headers.host;
    if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(host)) {
      reply(response, 403, 'Use the loopback address printed by the preview server.');
      return;
    }
    let url;
    try { url = new URL(request.url, `http://${host}`); }
    catch { reply(response, 400, 'Invalid request URL.'); return; }

    if (url.pathname.startsWith('/__admin-api/')) {
      const match = /^\/__admin-api\/(development|production)\/([a-z-]+)$/.exec(url.pathname);
      if (!match || !functions.has(match[2]) || url.search) {
        reply(response, 404, 'Unknown admin endpoint.'); return;
      }
      if (request.method !== 'POST') { reply(response, 405, 'Use POST.'); return; }
      if (request.headers.origin !== `http://${host}` || request.headers['sec-fetch-site'] === 'cross-site') {
        reply(response, 403, 'Open the admin portal on this local server.'); return;
      }
      const authorization = request.headers.authorization;
      if (!authorization || !/^Bearer \S+$/i.test(authorization)) {
        reply(response, 401, 'Sign in with your Moose staff account.'); return;
      }
      if (request.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
        reply(response, 415, 'JSON is required.'); return;
      }
      if (Number(request.headers['content-length']) > bodyLimit) {
        request.resume(); reply(response, 413, 'Request is too large.'); return;
      }
      try {
        const body = await requestBody(request);
        const environment = environments[match[1]];
        const upstream = await fetchImpl(`${environment.url}/functions/v1/${match[2]}`, {
          method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30_000),
          // No Origin or cookies are forwarded: this is a server-to-server call.
          headers: { authorization, apikey: environment.key, 'content-type': 'application/json' },
          body,
        });
        const data = Buffer.from(await upstream.arrayBuffer());
        for (const header of ['content-type', 'x-request-id', 'retry-after']) {
          if (upstream.headers.has(header)) response.setHeader(header, upstream.headers.get(header));
        }
        response.writeHead(upstream.status);
        response.end(data);
      } catch (error) {
        // Never log tokens, request bodies or upstream exceptions.
        reply(response, error.message === 'body-limit' ? 413 : 502,
          error.message === 'body-limit' ? 'Request is too large.' : 'The local preview could not reach Supabase. Try again.');
      }
      return;
    }

    if (!['GET', 'HEAD'].includes(request.method)) { reply(response, 405, 'Use GET.'); return; }
    if (['/', '/admin', '/admin.html'].includes(url.pathname)) {
      response.writeHead(302, { Location: `/admin/${url.search || '?environment=production'}` });
      response.end(); return;
    }
    const asset = assets.get(url.pathname === '/admin/' ? '/admin/index.html' : url.pathname);
    if (!asset) { reply(response, 404, 'File not found.'); return; }
    response.writeHead(200, { 'Content-Type': asset.type });
    response.end(request.method === 'HEAD' ? undefined : asset.body);
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  return server;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2);
  const port = args.length === 0 ? 4174 : args.length === 2 && args[0] === '--port' ? Number(args[1]) : NaN;
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    console.error('Usage: npm run preview:production -- [--port 4174]');
    process.exit(1);
  }
  const server = await createPresentationServer();
  server.on('error', error => {
    console.error(error.code === 'EADDRINUSE' ? `Port ${port} is busy. Choose another with --port.` : 'Could not start the local preview.');
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => {
    console.log(`Production admin: http://127.0.0.1:${port}/admin/?environment=production`);
    console.log('Sign in with your production staff account. Changes affect real customers.');
    console.log('Keep this terminal running; press Ctrl+C to stop.');
  });
}
