/**
 * api/proxy-post.js — Vercel Serverless POST proxy
 *
 * Replaces the POST /proxy-post route from the old proxy.js
 * Usage: POST /api/proxy-post?ip=HOST:PORT&path=/password
 */

const http  = require('http');
const https = require('https');

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function parseHost(raw) {
  if (!raw) return null;
  const parts = raw.split(':');
  return {
    hostname: parts[0],
    port:     parseInt(parts[1], 10) || 80,
  };
}

// Vercel buffers the body for us — read it from req
function readBody(req) {
  return new Promise((resolve, reject) => {
    // If Vercel already parsed body (shouldn't happen here), handle it
    if (req.body) {
      if (typeof req.body === 'string') return resolve(req.body);
      return resolve(JSON.stringify(req.body));
    }
    let data = '';
    req.on('data', (c) => { data += c; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {

  // Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json', ...CORS });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const { ip, path: devPath } = req.query;
  const host = parseHost(ip);

  if (!host) {
    res.writeHead(400, { 'Content-Type': 'application/json', ...CORS });
    res.end(JSON.stringify({ error: 'Missing ?ip= parameter' }));
    return;
  }

  const targetPath = devPath || '/';
  const bodyData   = await readBody(req);
  const lib = host.port === 443 ? https : http;

  console.log(`[proxy-post] POST ${host.hostname}:${host.port}${targetPath}`);

  const opts = {
    hostname: host.hostname,
    port:     host.port,
    path:     targetPath,
    method:   'POST',
    timeout:  6000,
    headers: {
      'Content-Type':   'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(bodyData),
    },
  };

  const pReq = lib.request(opts, (pRes) => {
    let body = '';
    pRes.on('data', (c) => { body += c; });
    pRes.on('end', () => {
      const ct = pRes.headers['content-type'] || 'application/json';
      res.writeHead(pRes.statusCode, { 'Content-Type': ct, ...CORS });
      res.end(body);
    });
  });

  pReq.on('timeout', () => {
    pReq.destroy();
    res.writeHead(504, { 'Content-Type': 'application/json', ...CORS });
    res.end(JSON.stringify({ error: 'Device timed out' }));
  });

  pReq.on('error', (err) => {
    res.writeHead(502, { 'Content-Type': 'application/json', ...CORS });
    res.end(JSON.stringify({ error: 'Device unreachable: ' + err.message }));
  });

  if (bodyData) pReq.write(bodyData);
  pReq.end();
}