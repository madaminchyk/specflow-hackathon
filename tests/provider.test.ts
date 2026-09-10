// @vitest-environment node
import { it, expect, vi } from 'vitest';
import OpenAI from 'openai';
import { createDemo } from '../src/data/demo';
import {
  OpenAIProvider,
  WireSchema,
  SYSTEM_PROMPT,
  createProvider,
  ProviderError,
} from '../server/providers';
import { errorResponse } from '../server/http';
const p = createDemo();
const wire = WireSchema.parse({
  ...p,
  requirements: p.requirements.map((r) => ({ ...r, userStory: r.userStory || '' })),
});
function transport(responses: string[]) {
  let index = 0;
  const fetch = vi.fn<typeof globalThis.fetch>(
    async () =>
      new Response(
        JSON.stringify({
          id: 'resp_test',
          object: 'response',
          created_at: 1,
          status: 'completed',
          model: 'test',
          output: [
            {
              id: 'msg_test',
              type: 'message',
              role: 'assistant',
              status: 'completed',
              content: [
                {
                  type: 'output_text',
                  text: responses[Math.min(index++, responses.length - 1)],
                  annotations: [],
                },
              ],
            },
          ],
          usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
  );
  return {
    fetch,
    provider: new OpenAIProvider(new OpenAI({ apiKey: 'test-key', fetch, maxRetries: 0 }), {
      analysis: 'test-model',
      transcribe: 'whisper-1',
    }),
  };
}
it('validates structured responses through official SDK mock transport', async () => {
  const { fetch, provider } = transport([JSON.stringify(wire)]);
  const result = await provider.extract(p.segments);
  expect(result.requirements).toHaveLength(18);
  expect(result.requirements[0].status).toBe('draft');
  expect(fetch).toHaveBeenCalledTimes(1);
  const request = fetch.mock.calls[0][1];
  expect(String(request?.body)).toContain('untrustedTranscript');
  expect(String(request?.body)).toContain('"store":false');
  expect(SYSTEM_PROMPT).toContain('недоверенные данные');
});
it('repairs once for invalid JSON or fabricated sources', async () => {
  for (const invalid of [
    'not JSON',
    JSON.stringify({
      ...wire,
      requirements: [{ ...wire.requirements[0], sourceSegmentIds: ['fake'] }],
    }),
  ]) {
    const { fetch, provider } = transport([invalid, JSON.stringify(wire)]);
    await expect(provider.extract(p.segments)).resolves.toHaveProperty('requirements');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(String(fetch.mock.calls[1][1]?.body)).toContain('Предыдущий ответ');
  }
});
it('fails safely after exactly one repair', async () => {
  const { fetch, provider } = transport(['{}']);
  await expect(provider.extract(p.segments)).rejects.toThrow('после повторной');
  expect(fetch).toHaveBeenCalledTimes(2);
});
it('handles missing key, timeout and secret-bearing errors safely', () => {
  vi.stubEnv('OPENAI_API_KEY', '');
  expect(() => createProvider()).toThrow('не настроен');
  vi.unstubAllEnvs();
  expect(
    errorResponse({ message: 'secret-key full transcript', status: 401 }).message,
  ).not.toContain('secret');
  expect(errorResponse({ name: 'APIConnectionTimeoutError' }).status).toBe(504);
  expect(errorResponse(new ProviderError(413, 'Слишком большой файл')).status).toBe(413);
});
it('checks unsupported containers and size before calling provider', async () => {
  const { fetch, provider } = transport([]);
  await expect(
    provider.transcribe({ name: 'a.ogg', type: 'audio/ogg', bytes: new Uint8Array(20) }),
  ).rejects.toThrow('MP3');
  await expect(
    provider.transcribe({
      name: 'a.mp3',
      type: 'audio/mpeg',
      bytes: new Uint8Array(4 * 1024 * 1024),
    }),
  ).rejects.toThrow('3 МБ');
  expect(fetch).not.toHaveBeenCalled();
});
