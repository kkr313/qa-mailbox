#!/usr/bin/env node
/** Local dev only: serves the same serverless handler over plain HTTP for Vite to proxy. */
import http from 'node:http';
import 'dotenv/config';
import { handleApi, errorResponse } from '../api/_lib/router.js';

const port = Number(process.env.DEV_API_PORT) || 8888;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');

  let result;
  try {
    result = await handleApi({
      method: req.method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      body: raw ? JSON.parse(raw) : {},
      headers: req.headers,
      ip: req.socket.remoteAddress,
    });
  } catch (err) {
    result = errorResponse(err);
  }

  res.writeHead(result.status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(result.body));
});

server.listen(port, () => {
  console.log(`[dev-api] http://localhost:${port}`);
});
