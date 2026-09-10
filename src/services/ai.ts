import { z } from 'zod';
import { SegmentSchema, validateAnalysis, type Segment } from '../domain/model';
import { MAX_AI_MEDIA_BYTES } from './files';
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
    const parsed = z.object({ error: z.string() }).safeParse(result);
    throw new Error(
      parsed.success ? parsed.data.error : 'Не удалось обработать материалы встречи.',
    );
  }
  return result;
}
export async function aiAnalyze(segments: Segment[], signal: AbortSignal) {
  return validateAnalysis(await request('/api/analyze', { segments }, signal), segments);
}
export async function aiTranscribe(file: File, signal: AbortSignal) {
  if (file.size > MAX_AI_MEDIA_BYTES)
    throw new Error(
      'Для AI-распознавания файл должен быть не больше 3 МБ. Сожмите запись или добавьте готовую транскрипцию.',
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
