import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import { SegmentSchema } from '../src/domain/model';
import { MAX_TEXT } from '../src/services/analysis';
import { createProvider, ProviderError } from './providers';
const MAX_BODY = 4_300_000;
export async function readBody(req: IncomingMessage & { body?: unknown }) {
  if (req.body !== undefined) {
    const encoded = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    if (Buffer.byteLength(encoded) > MAX_BODY)
      throw new ProviderError(413, 'Превышен размер запроса.');
    try {
      return typeof req.body === 'string' ? JSON.parse(encoded) : req.body;
    } catch {
      throw new ProviderError(400, 'Некорректный JSON.');
    }
  }
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    const b = Buffer.from(chunk);
    size += b.byteLength;
    if (size > MAX_BODY) throw new ProviderError(413, 'Превышен размер запроса.');
    chunks.push(b);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new ProviderError(400, 'Некорректный JSON.');
  }
}
export function errorResponse(error: unknown): { status: number; message: string } {
  if (error instanceof ProviderError) return { status: error.status, message: error.message };
  if (error instanceof z.ZodError)
    return { status: 400, message: 'Данные запроса не прошли проверку.' };
  const e = error as { status?: number; name?: string };
  if (e?.status === 429)
    return { status: 429, message: 'Превышен лимит AI-провайдера. Повторите позже.' };
  if (
    e?.name === 'APIConnectionTimeoutError' ||
    e?.name === 'TimeoutError' ||
    e?.name === 'AbortError'
  )
    return {
      status: 504,
      message: 'Время обработки истекло. Сократите запись или добавьте готовую транскрипцию.',
    };
  return {
    status: 502,
    message:
      'Провайдер не смог обработать запрос. Проверьте настройки модели или используйте локальный разбор.',
  };
}
export async function handle(
  req: IncomingMessage & { body?: unknown },
  res: ServerResponse,
  kind: 'analyze' | 'transcribe',
) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const send = (status: number, body: unknown) => {
    res.statusCode = status;
    res.end(JSON.stringify(body));
  };
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    send(405, { error: 'Используйте POST.' });
    return;
  }
  if (!req.headers['content-type']?.startsWith('application/json')) {
    send(415, { error: 'Ожидается application/json.' });
    return;
  }
  // Browser cross-origin requests are rejected. This is not user authentication.
  const origin = req.headers.origin;
  const allowed = process.env.APP_ORIGIN;
  if (origin && allowed && origin !== allowed) {
    send(403, { error: 'Источник запроса не разрешён.' });
    return;
  }
  if (Number(req.headers['content-length']) > MAX_BODY) {
    send(413, { error: 'Превышен размер запроса.' });
    return;
  }
  try {
    const body = await readBody(req);
    const provider = createProvider();
    const signal = AbortSignal.timeout(115000);
    if (kind === 'analyze') {
      const { segments } = z
        .object({ segments: z.array(SegmentSchema).min(1).max(2000) })
        .parse(body);
      if (segments.reduce((n, s) => n + s.text.length, 0) > MAX_TEXT)
        throw new ProviderError(413, 'Транскрипция превышает 180 000 символов.');
      send(200, await provider.extract(segments, signal));
    } else {
      const { name, type, data } = z
        .object({
          name: z.string().min(1).max(250),
          type: z.string().max(100),
          data: z
            .string()
            .min(4)
            .max(4_200_000)
            .regex(/^[A-Za-z0-9+/]*={0,2}$/),
        })
        .parse(body);
      send(
        200,
        await provider.transcribe({ name, type, bytes: Buffer.from(data, 'base64') }, signal),
      );
    }
  } catch (e) {
    const error = errorResponse(e);
    send(error.status, { error: error.message });
  }
}
