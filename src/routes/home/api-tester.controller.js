import { config } from '../../utils/configLoader.js';
import { apiRegistry } from './api-registry.js';

const REQUEST_TIMEOUT_MS = 15000;

// Response bodies are shown verbatim in the UI — cap what we forward so a
// large listing (e.g. /analytics/events) can't blow up the browser tab.
const MAX_RESPONSE_CHARS = 200000;

function buildPath(pathTemplate, params = {}) {
  return pathTemplate.replace(/:([A-Za-z0-9_]+)/g, (_match, name) => {
    const value = params?.[name];
    if (value === undefined || value === null || value === '') {
      throw new Error(`Missing path param \`${name}\``);
    }
    // encodeURIComponent turns "/" into "%2F" — a param value can never
    // smuggle in an extra path segment, so the request always lands on
    // exactly the route this apiId maps to.
    return encodeURIComponent(String(value));
  });
}

function buildQueryString(query = {}) {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    usp.set(key, String(value));
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : '';
}

/**
 * POST /dashboard/api-tester
 *
 * Lets an authenticated admin actually fire one of the documented API
 * endpoints from the browser and see the real response, without ever
 * exposing the x-api-key client-side: the browser only sends an `apiId`
 * (which must be one of the entries in apiRegistry) plus user-edited
 * params/query/body, and this handler makes the real call itself — over
 * loopback, through the exact same route/middleware stack a real client
 * would hit — injecting the API key (and, for the JWT-gated cloud-save
 * routes, the admin-supplied bearer token) on the way out.
 *
 * Body: { apiId, params?, query?, body?, jwt? }
 */
export async function postApiTester(req, res) {
  const { apiId, params, query, body, jwt } = req.body ?? {};

  const spec = apiRegistry[apiId];
  if (!spec) {
    return res.status(400).json({ success: false, message: 'Unknown apiId' });
  }

  let path;
  try {
    path = buildPath(spec.path, params);
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }

  const url = `http://127.0.0.1:${config.port}${path}${buildQueryString(query)}`;

  const headers = { 'x-api-key': config.apiKeys[0] };
  if (spec.requiresJwt && jwt) {
    headers.Authorization = `Bearer ${jwt}`;
  }

  const hasBody = spec.method !== 'GET' && body !== undefined && body !== null;
  if (hasBody) {
    headers['Content-Type'] = 'application/json';
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const upstreamRes = await fetch(url, {
      method: spec.method,
      headers,
      body: hasBody ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const contentType = upstreamRes.headers.get('content-type') || '';
    const rawText = await upstreamRes.text();
    const truncated = rawText.length > MAX_RESPONSE_CHARS;
    const text = truncated ? rawText.slice(0, MAX_RESPONSE_CHARS) : rawText;

    let parsedBody = text;
    if (contentType.includes('application/json')) {
      try {
        parsedBody = JSON.parse(text);
      } catch {
        // fall through to raw text — upstream said JSON but didn't send valid JSON
      }
    }

    return res.status(200).json({
      success: true,
      request: { method: spec.method, url: `${spec.path}${buildQueryString(query)}` },
      response: {
        status: upstreamRes.status,
        statusText: upstreamRes.statusText,
        contentType,
        body: parsedBody,
        truncated,
      },
    });
  } catch (err) {
    const timedOut = err.name === 'AbortError';
    return res.status(502).json({
      success: false,
      message: timedOut ? 'Upstream request timed out' : 'Upstream request failed',
    });
  } finally {
    clearTimeout(timeout);
  }
}
