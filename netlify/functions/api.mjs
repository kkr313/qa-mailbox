import { handleApi, errorResponse } from '../../api/_lib/router.js';

export default async (request) => {
  const url = new URL(request.url);
  let result;

  try {
    const raw = request.method === 'GET' || request.method === 'HEAD' ? '' : await request.text();
    result = await handleApi({
      method: request.method,
      path: url.pathname.replace('/.netlify/functions/api', '/api'),
      query: Object.fromEntries(url.searchParams),
      body: raw ? JSON.parse(raw) : {},
      headers: Object.fromEntries(request.headers),
      ip: (request.headers.get('x-forwarded-for') || '').split(',')[0].trim(),
    });
  } catch (err) {
    result = errorResponse(err);
  }

  return Response.json(result.body, { status: result.status });
};

export const config = { path: '/api/*' };
