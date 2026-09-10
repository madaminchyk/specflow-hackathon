// @vitest-environment node
import { it, expect, vi } from 'vitest';
import { createDemo } from '../src/data/demo';
import {
  YandexProvider,
  WireSchema,
  SYSTEM_PROMPT,
  createProvider,
  ProviderError,
  SPEECHKIT_ENDPOINT,
  ANALYSIS_ENDPOINT,
  AnalysisJsonSchema,
  type YandexConfig,
} from '../server/providers';
import { errorResponse } from '../server/http';
import { wavFixture, oggFixture } from './fixtures/audio';
const p = createDemo();
const wire = WireSchema.parse({
  ...p,
  requirements: p.requirements.map((r) => ({ ...r, userStory: r.userStory || '' })),
});
const config: YandexConfig = {
  apiKey: 'unit-test-secret',
  folderId: 'test-folder',
  language: 'ru-RU',
  topic: 'general',
  timeoutMs: 1000,
  maxTokens: 8000,
};
function transport(responses: Response[], overrides: Partial<YandexConfig> = {}) {
  let index = 0;
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    responses[Math.min(index++, responses.length - 1)].clone(),
  );
  return { fetch, provider: new YandexProvider({ ...config, ...overrides }, fetch) };
}
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const completion = (text: string, status = 'ALTERNATIVE_STATUS_FINAL') => ({
  result: { alternatives: [{ message: { role: 'assistant', text }, status }] },
});
it('transcribes WAV through native SpeechKit with server key and raw PCM body', async () => {
  const { fetch, provider } = transport([json({ result: 'Нужно бронировать комнату.' })]);
  const bytes = wavFixture();
  const result = await provider.transcribe({ name: 'meeting.wav', type: 'audio/wav', bytes });
  const [url, options] = fetch.mock.calls[0];
  const target = new URL(String(url));
  expect(target.origin + target.pathname).toBe(SPEECHKIT_ENDPOINT);
  expect(target.searchParams.get('format')).toBe('lpcm');
  expect(target.searchParams.get('sampleRateHertz')).toBe('16000');
  expect(target.searchParams.has('folderId')).toBe(false);
  expect(options?.headers).toMatchObject({ Authorization: 'Api-Key unit-test-secret' });
  expect(Buffer.from(options?.body as Uint8Array)).toEqual(bytes.subarray(44));
  expect(result).toEqual([
    {
      id: 'seg-1',
      speakerId: 'speaker',
      speakerName: 'Участник',
      startMs: 0,
      endMs: 1000,
      text: 'Нужно бронировать комнату.',
      timing: 'estimated',
    },
  ]);
  expect(JSON.stringify(result)).not.toContain(config.apiKey);
});
it('sends OggOpus unchanged without a sample-rate parameter', async () => {
  const { fetch, provider } = transport([json({ result: 'Привет' })]);
  const bytes = oggFixture();
  await provider.transcribe({ name: 'a.ogg', type: 'audio/ogg', bytes });
  const [url, options] = fetch.mock.calls[0];
  expect(String(url)).toContain('format=oggopus');
  expect(String(url)).not.toContain('sampleRateHertz');
  expect(Buffer.from(options?.body as Uint8Array)).toEqual(bytes);
});
it('rejects long files before network calls, including compressed files below the byte limit', async () => {
  const { fetch, provider } = transport([]);
  for (const [name, bytes] of [
    ['long.wav', wavFixture(31000, 8000)],
    ['long.ogg', oggFixture(31000)],
    ['large.wav', Buffer.alloc(1_000_001)],
  ] as const) {
    await expect(provider.transcribe({ name, type: '', bytes })).rejects.toMatchObject({
      status: 413,
      code: 'ASYNC_REQUIRED',
    });
  }
  expect(fetch).not.toHaveBeenCalled();
  expect(provider.capabilities.async).toBe(false);
});
it('distinguishes silence, malformed response and upstream authorization without exposing private text', async () => {
  for (const [response, status, code] of [
    [json({ result: '  ' }), 422, 'NO_SPEECH'],
    [json({ unexpected: true }), 502, 'INVALID_PROVIDER_RESPONSE'],
    [json({ error: 'unit-test-secret private transcript' }, 403), 503, 'PROVIDER_AUTH'],
    [json({}, 429), 429, 'PROVIDER_LIMIT'],
    [json({}, 500), 502, 'PROVIDER_UNAVAILABLE'],
  ] as const) {
    const { provider } = transport([response]);
    try {
      await provider.transcribe({ name: 'a.wav', type: 'audio/wav', bytes: wavFixture() });
      expect.fail('Expected failure');
    } catch (e) {
      expect(e).toMatchObject({ status, code });
      expect((e as Error).message).not.toMatch(/unit-test-secret|private transcript/);
    }
  }
});
it('maps timeout, cancellation and network failures safely', async () => {
  const failing = vi.fn<typeof fetch>(async () => {
    throw new Error('private network details');
  });
  const provider = new YandexProvider(config, failing);
  await expect(
    provider.transcribe({ name: 'a.wav', type: 'audio/wav', bytes: wavFixture() }),
  ).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
  const controller = new AbortController();
  controller.abort();
  await expect(
    provider.transcribe(
      { name: 'a.wav', type: 'audio/wav', bytes: wavFixture() },
      controller.signal,
    ),
  ).rejects.toMatchObject({ code: 'PROVIDER_TIMEOUT' });
  const waiting: typeof fetch = (_url, options) =>
    new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () =>
        reject(new DOMException('Timeout', 'AbortError')),
      );
    });
  await expect(
    new YandexProvider({ ...config, timeoutMs: 10 }, waiting).transcribe({
      name: 'a.wav',
      type: 'audio/wav',
      bytes: wavFixture(),
    }),
  ).rejects.toMatchObject({ status: 504, code: 'PROVIDER_TIMEOUT' });
});
it('extracts requirements through native YandexGPT with schema, privacy header and untrusted data', async () => {
  const { fetch, provider } = transport([json(completion(JSON.stringify(wire)))]);
  const result = await provider.extract(p.segments);
  expect(result.requirements).toHaveLength(18);
  expect(result.requirements[0].status).toBe('draft');
  const [url, options] = fetch.mock.calls[0];
  expect(url).toBe(ANALYSIS_ENDPOINT);
  expect(options?.headers).toMatchObject({
    'x-data-logging-enabled': 'false',
    'x-folder-id': 'test-folder',
    Authorization: 'Api-Key unit-test-secret',
  });
  const body = JSON.parse(String(options?.body));
  expect(body.modelUri).toBe('gpt://test-folder/yandexgpt/latest');
  expect(body.jsonSchema.schema).toEqual(AnalysisJsonSchema);
  expect(body.messages[1].text).toContain('untrustedTranscript');
  expect(SYSTEM_PROMPT).toContain('недоверенные данные');
  expect(AnalysisJsonSchema.properties.requirements.items.required.toSorted()).toEqual(
    Object.keys(WireSchema.shape.requirements.element.shape).toSorted(),
  );
});
it('repairs once for invalid JSON, schema or fabricated references', async () => {
  for (const text of [
    'not JSON',
    '{}',
    JSON.stringify({
      ...wire,
      requirements: [{ ...wire.requirements[0], sourceSegmentIds: ['fake'] }],
    }),
  ]) {
    const { fetch, provider } = transport([
      json(completion(text)),
      json(completion(JSON.stringify(wire))),
    ]);
    await expect(provider.extract(p.segments)).resolves.toHaveProperty('requirements');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(String(fetch.mock.calls[1][1]?.body)).toContain('Предыдущий ответ');
  }
  const broken = transport([
    new Response('invalid', { status: 200 }),
    json(completion(JSON.stringify(wire))),
  ]);
  await broken.provider.extract(p.segments);
  expect(broken.fetch).toHaveBeenCalledTimes(2);
});
it('fails after one repair and rejects truncated completions without inventing success', async () => {
  const bad = transport([json(completion('{}'))]);
  await expect(bad.provider.extract(p.segments)).rejects.toThrow('после повторной');
  expect(bad.fetch).toHaveBeenCalledTimes(2);
  const truncated = transport([
    json(completion(JSON.stringify(wire), 'ALTERNATIVE_STATUS_TRUNCATED_FINAL')),
  ]);
  await expect(truncated.provider.extract(p.segments)).rejects.toMatchObject({
    code: 'ANALYSIS_TOO_LONG',
  });
  expect(truncated.fetch).toHaveBeenCalledTimes(1);
});
it('supports the unwrapped documented completion shape', async () => {
  const { provider } = transport([json(completion(JSON.stringify(wire)).result)]);
  await expect(provider.extract(p.segments)).resolves.toHaveProperty('requirements');
});
it('checks server configuration and never falls back to another provider', async () => {
  vi.stubEnv('YANDEX_API_KEY', '');
  expect(() => createProvider()).toThrow('YANDEX_API_KEY');
  vi.unstubAllEnvs();
  const { provider, fetch } = transport([], { folderId: undefined, modelUri: undefined });
  await expect(provider.extract(p.segments)).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
  expect(fetch).not.toHaveBeenCalled();
  expect(errorResponse(new ProviderError(413, 'Large', 'ASYNC_REQUIRED'))).toMatchObject({
    status: 413,
    code: 'ASYNC_REQUIRED',
  });
  vi.stubEnv('YANDEX_API_KEY', 'fake');
  vi.stubEnv('YANDEX_TIMEOUT_MS', '-1');
  expect(() => createProvider()).toThrow('настройки');
  vi.unstubAllEnvs();
});
