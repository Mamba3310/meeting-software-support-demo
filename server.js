'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = __dirname;
const DATA_FILE = process.env.DATA_FILE || path.join(ROOT, 'data', 'links.json');
const ADMIN_KEY = process.env.SUPPORT_ADMIN_KEY || '';
const PORT = Number(process.env.PORT) || 8766;
const allowedOrigins = new Set((process.env.ALLOWED_ORIGINS || 'http://localhost:8766,http://127.0.0.1:8766,http://localhost:8765,http://127.0.0.1:8765,https://mamba3310.github.io').split(',').map(item => item.trim()).filter(Boolean));
const mimeTypes = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml' };
let writeQueue = Promise.resolve();

function send(res, statusCode, payload, headers = {}) {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  res.writeHead(statusCode, { 'content-type': typeof payload === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8', 'cache-control':'no-store', ...headers });
  res.end(body);
}
function sendJson(res, statusCode, payload) { send(res, statusCode, payload); }
function authorized(req) {
  if (!ADMIN_KEY || !req.headers['x-admin-key']) return false;
  const provided = Buffer.from(String(req.headers['x-admin-key']));
  const expected = Buffer.from(ADMIN_KEY);
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}
function requireAdmin(req, res) {
  if (!ADMIN_KEY) { sendJson(res, 503, { error:'SUPPORT_ADMIN_KEY is not configured on the server.' }); return false; }
  if (!authorized(req)) { sendJson(res, 401, { error:'Dashboard authorization required.' }); return false; }
  return true;
}
async function loadLinks() {
  try {
    const parsed = JSON.parse(await fs.promises.readFile(DATA_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}
function updateLinks(mutator) {
  const task = writeQueue.then(async () => {
    const links = await loadLinks();
    const result = mutator(links);
    await fs.promises.mkdir(path.dirname(DATA_FILE), { recursive:true });
    const tempFile = `${DATA_FILE}.${process.pid}.tmp`;
    await fs.promises.writeFile(tempFile, JSON.stringify(links, null, 2), 'utf8');
    await fs.promises.rename(tempFile, DATA_FILE);
    return result;
  });
  writeQueue = task.then(() => undefined, () => undefined);
  return task;
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 64 * 1024) { reject(Object.assign(new Error('Request body too large.'), { statusCode:413 })); req.destroy(); }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try { resolve(JSON.parse(body)); } catch { reject(Object.assign(new Error('Request body must be valid JSON.'), { statusCode:400 })); }
    });
    req.on('error', reject);
  });
}
function validateEmails(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 50) return null;
  const emails = value.map(item => String(item).trim().toLowerCase());
  if (emails.some(email => email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return null;
  return [...new Set(emails)];
}
function normalizeStatus(value) {
  const allowed = new Set(['Waiting','Approved','Sharing','Ended','Declined']);
  return allowed.has(value) ? value : null;
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (origin && !allowedOrigins.has(origin)) return sendJson(res, 403, { error:'Origin is not allowed.' });
  if (origin) res.setHeader('access-control-allow-origin', origin);
  res.setHeader('vary', 'Origin');
  res.setHeader('access-control-allow-methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type,x-admin-key');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(requestUrl.pathname);
  try {
    if (pathname === '/api/health' && req.method === 'GET') return sendJson(res, 200, { ok:true, service:'meeting-software-api' });
    if (pathname === '/api/links' && req.method === 'GET') {
      if (!requireAdmin(req, res)) return;
      const links = await loadLinks();
      return sendJson(res, 200, { links });
    }
    if (pathname === '/api/links' && req.method === 'POST') {
      if (!requireAdmin(req, res)) return;
      const body = await readBody(req);
      const emails = validateEmails(body.emails);
      if (!emails) return sendJson(res, 400, { error:'Provide 1–50 valid email addresses.' });
      const now = new Date().toISOString();
      const created = emails.map(email => ({ token:crypto.randomBytes(24).toString('base64url'), email, createdAt:now, status:'Waiting' }));
      await updateLinks(links => { links.unshift(...created); });
      return sendJson(res, 201, { links:created });
    }
    const visitorMatch = pathname.match(/^\/api\/visitor\/([A-Za-z0-9_-]{20,64})$/);
    if (visitorMatch && req.method === 'GET') {
      const links = await loadLinks();
      const link = links.find(item => item.token === visitorMatch[1]);
      if (!link || link.status === 'Revoked') return sendJson(res, 404, { error:'This support link is no longer available.' });
      if (link.status === 'Sharing') return sendJson(res, 200, { link, activeShare:true });
      return sendJson(res, 200, { link });
    }
    if (visitorMatch && req.method === 'POST') {
      const body = await readBody(req);
      const nextStatus = normalizeStatus(body.status);
      if (!nextStatus) return sendJson(res, 400, { error:'Unsupported visitor status.' });
      const result = await updateLinks(links => {
        const link = links.find(item => item.token === visitorMatch[1]);
        if (!link || link.status === 'Revoked') return { statusCode:404, error:'This support link is no longer available.' };
        const transitions = { Waiting:['Sharing','Declined'], Sharing:['Ended'], Approved:['Sharing','Declined'] };
        if (!transitions[link.status]?.includes(nextStatus)) return { statusCode:409, error:'This visitor request is already complete.' };
        link.status = nextStatus; link.updatedAt = new Date().toISOString();
        return { link };
      });
      if (result.statusCode) return sendJson(res, result.statusCode, { error:result.error });
      return sendJson(res, 200, { link:result.link });
    }
    const adminMatch = pathname.match(/^\/api\/links\/([A-Za-z0-9_-]{20,64})$/);
    if (adminMatch && req.method === 'DELETE') {
      if (!requireAdmin(req, res)) return;
      const result = await updateLinks(links => {
        const link = links.find(item => item.token === adminMatch[1]);
        if (!link) return false;
        link.status = 'Revoked'; link.updatedAt = new Date().toISOString();
        return true;
      });
      if (!result) return sendJson(res, 404, { error:'Link not found.' });
      return sendJson(res, 200, { ok:true });
    }

    if (pathname.startsWith('/api/')) return sendJson(res, 404, { error:'API route not found.' });
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const file = path.resolve(ROOT, relative);
    if (!file.startsWith(`${ROOT}${path.sep}`) && file !== path.join(ROOT, 'index.html')) return send(res, 403, 'Forbidden');
    const stat = await fs.promises.stat(file);
    if (!stat.isFile()) return send(res, 404, 'Not found');
    res.writeHead(200, { 'content-type':mimeTypes[path.extname(file)] || 'application/octet-stream', 'cache-control':'no-cache' });
    fs.createReadStream(file).pipe(res);
  } catch (error) {
    if (!res.headersSent) sendJson(res, error.statusCode || 500, { error:error.statusCode ? error.message : 'Internal server error.' });
    else res.destroy(error);
  }
});

server.listen(PORT, () => console.log(`Meeting Software server listening on http://localhost:${PORT}`));
