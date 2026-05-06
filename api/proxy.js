/**
 * api/proxy.js — Vercel Serverless GET proxy
 *
 * Replaces the GET /proxy route from the old proxy.js
 * Usage: /api/proxy?ip=HOST:PORT&path=/status
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

export default function handler(req, res) {

  // Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  if (req.method !== 'GET') {
    res.writeHead(405, CORS);
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
  const lib = host.port === 443 ? https : http;

  const opts = {
    hostname: host.hostname,
    port:     host.port,
    path:     targetPath,
    method:   'GET',
    timeout:  6000,
  };

  console.log(`[proxy] GET ${host.hostname}:${host.port}${targetPath}`);

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

  pReq.end();
}