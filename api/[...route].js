import { handleApi, errorResponse } from './_lib/router.js';

export default async function handler(req, res) {
  const url = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
  let result;

  try {
    result = await handleApi({
      method: req.method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      body: typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {},
      headers: req.headers,
      ip: (req.headers['x-forwarded-for'] || '').split(',')[0].trim(),
    });
  } catch (err) {
    result = errorResponse(err);
  }

  for (const [name, value] of Object.entries(result.headers || {})) res.setHeader(name, value);
  res.status(result.status).json(result.body);
}
