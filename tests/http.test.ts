// @vitest-environment node
import { it, expect, vi } from 'vitest';
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { handle, readBody } from '../server/http';
function request(
  method = 'POST',
  body: unknown = {},
  headers: Record<string, string> = { 'content-type': 'application/json' },
) {
  return Object.assign(Readable.from([]), {
    method,
    headers,
    body,
  }) as unknown as IncomingMessage & { body: unknown };
}
function response() {
  let body = '';
  const headers: Record<string, unknown> = {};
  const res = {
    statusCode: 200,
    setHeader: (key: string, value: unknown) => {
      headers[key] = value;
    },
    end: (data: string) => {
      body = data;
    },
  };
  return {
    res: res as unknown as ServerResponse,
    read: () => ({ status: res.statusCode, body: JSON.parse(body), headers }),
  };
}
it('returns explicit HTTP errors without requiring a provider', async () => {
  for (const [req, status] of [
    [request('GET'), 405],
    [request('POST', {}, {}), 415],
    [request('POST', {}, { 'content-type': 'application/json', 'content-length': '9999999' }), 413],
  ] as const) {
    const r = response();
    await handle(req, r.res, 'analyze');
    expect(r.read().status).toBe(status);
    expect(r.read().headers['Cache-Control']).toBe('no-store');
  }
});
it('returns 503 when no server key exists', async () => {
  vi.stubEnv('OPENAI_API_KEY', '');
  try {
    const r = response();
    await handle(request(), r.res, 'analyze');
    expect(r.read().status).toBe(503);
    expect(r.read().body.error).toContain('не настроен');
  } finally {
    vi.unstubAllEnvs();
  }
});
it('rejects malformed JSON and oversized parsed requests', async () => {
  await expect(readBody(request('POST', '{broken'))).rejects.toHaveProperty('status', 400);
  await expect(readBody(request('POST', { text: 'x'.repeat(4_300_001) }))).rejects.toHaveProperty(
    'status',
    413,
  );
});
