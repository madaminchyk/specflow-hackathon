import { z } from 'zod';
import { SegmentSchema, validateAnalysis, type Segment } from '../domain/model';
import { SPEECHKIT_SYNC, type CloudErrorCode } from '../domain/transcription';
export class CloudError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: CloudErrorCode,
  ) {
    super(message);
  }
}
async function request(path: string, body: unknown, signal: AbortSignal) {
  let response: Response;
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.any([signal, AbortSignal.timeout(125000)]),
    });
  } catch (e) {
    if (signal.aborted) throw e;
    throw new Error(
      'Сервер не ответил или превышено время ожидания. Попробуйте снова либо используйте локальный разбор текста.',
    );
  }
  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new Error(
      'AI-сервер недоступен. Настройте серверный провайдер или используйте локальный разбор.',
    );
  }
  if (!response.ok) {
    const parsed = z.object({ error: z.string(), code: z.string().optional() }).safeParse(result);
    throw new CloudError(
      parsed.success ? parsed.data.error : 'Не удалось обработать материалы встречи.',
      response.status,
      parsed.success ? (parsed.data.code as CloudErrorCode) : undefined,
    );
  }
  return result;
}
export async function aiAnalyze(segments: Segment[], signal: AbortSignal) {
  return validateAnalysis(await request('/api/analyze', { segments }, signal), segments);
}
export async function aiTranscribe(file: File, signal: AbortSignal) {
  if (file.size > SPEECHKIT_SYNC.maxBytes)
    throw new CloudError(
      'SpeechKit: максимум 1 МБ и 30 секунд. Для большой записи нужна асинхронная обработка, которая пока не подключена. Добавьте готовую транскрипцию или короткий фрагмент.',
      413,
      'ASYNC_REQUIRED',
    );
  if (!/\.(wav|ogg)$/i.test(file.name))
    throw new CloudError(
      'Для SpeechKit подготовьте WAV PCM 16-bit mono или OggOpus mono. Остальные форматы доступны для локального воспроизведения.',
      415,
      'UNSUPPORTED_AUDIO',
    );
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = () => reject(new Error('Не удалось прочитать запись.'));
    reader.readAsDataURL(file);
  });
  return z
    .array(SegmentSchema)
    .parse(await request('/api/transcribe', { name: file.name, type: file.type, data }, signal));
}
