/**
 * api/ping.js — Vercel Serverless health check
 *
 * Replaces the GET /ping route from the old proxy.js
 * The frontend checks this to know if the proxy is "running".
 * On Vercel it's always running, so we always return { ok: true }.
 */

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    res.end();
    return;
  }
  res.writeHead(200, { 'Content-Type': 'application/json', ...CORS });
  res.end(JSON.stringify({ ok: true, host: 'vercel' }));
}