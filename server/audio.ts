import { SPEECHKIT_SYNC } from '../src/domain/transcription.js';
import { ProviderError } from './errors.js';
export type AudioInput = { name: string; type: string; bytes: Uint8Array };
export type PreparedAudio = {
  body: Uint8Array;
  format: 'lpcm' | 'oggopus';
  durationMs: number;
  sampleRate?: number;
};

function invalid(
  message = 'Повреждённый аудиофайл. Подготовьте WAV PCM 16-bit mono или OggOpus mono.',
): never {
  throw new ProviderError(422, message, 'INVALID_AUDIO');
}
function unsupported(): never {
  throw new ProviderError(
    415,
    'SpeechKit в этом режиме принимает WAV PCM 16-bit mono (8/16/48 кГц) или OggOpus mono. Преобразуйте запись или добавьте готовую транскрипцию.',
    'UNSUPPORTED_AUDIO',
  );
}
function duration(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0)
    invalid(
      'Не удалось определить длительность записи. Добавьте корректный WAV/OggOpus или транскрипцию.',
    );
  if (ms > SPEECHKIT_SYNC.maxDurationMs) {
    throw new ProviderError(
      413,
      'Запись длиннее 30 секунд. Нужна асинхронная обработка SpeechKit, которая пока не подключена. Файл не отправлен провайдеру; добавьте готовую транскрипцию или отдельный короткий фрагмент.',
      'ASYNC_REQUIRED',
    );
  }
  return Math.ceil(ms);
}
function wav(b: Buffer): PreparedAudio {
  if (
    b.length < 44 ||
    b.toString('ascii', 0, 4) !== 'RIFF' ||
    b.toString('ascii', 8, 12) !== 'WAVE' ||
    b.readUInt32LE(4) + 8 !== b.length
  )
    invalid();
  let rate = 0;
  let pcm: Buffer | undefined;
  let offset = 12;
  while (offset < b.length) {
    if (offset + 8 > b.length) invalid();
    const size = b.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + size;
    if (end > b.length) invalid();
    const tag = b.toString('ascii', offset, offset + 4);
    if (tag === 'fmt ') {
      if (rate || size < 16) invalid();
      if (
        b.readUInt16LE(start) !== 1 ||
        b.readUInt16LE(start + 2) !== 1 ||
        b.readUInt16LE(start + 14) !== 16
      )
        unsupported();
      rate = b.readUInt32LE(start + 4);
      if (![8000, 16000, 48000].includes(rate)) unsupported();
      if (b.readUInt16LE(start + 12) !== 2 || b.readUInt32LE(start + 8) !== rate * 2) invalid();
    }
    if (tag === 'data') {
      if (pcm || !size || size % 2) invalid();
      pcm = b.subarray(start, end);
    }
    offset = end + (size % 2);
  }
  if (!rate || !pcm || offset !== b.length) invalid();
  return {
    body: pcm,
    format: 'lpcm',
    sampleRate: rate,
    durationMs: duration((pcm.length / (rate * 2)) * 1000),
  };
}
function ogg(b: Buffer): PreparedAudio {
  let offset = 0;
  let serial: number | undefined;
  let sequence = 0;
  let preSkip = 0;
  let endGranule: bigint | undefined;
  let ended = false;
  while (offset < b.length) {
    if (
      ended ||
      offset + 27 > b.length ||
      b.toString('ascii', offset, offset + 4) !== 'OggS' ||
      b[offset + 4] !== 0
    )
      invalid();
    const count = b[offset + 26];
    const start = offset + 27 + count;
    if (!count || start > b.length) invalid();
    const size = b.subarray(offset + 27, start).reduce((a, n) => a + n, 0);
    const end = start + size;
    if (end > b.length) invalid();
    const pageSerial = b.readUInt32LE(offset + 14);
    if (offset === 0) {
      if (
        !(b[offset + 5] & 2) ||
        size < 19 ||
        b[offset + 27] < 19 ||
        b.toString('ascii', start, start + 8) !== 'OpusHead'
      )
        unsupported();
      if (b[start + 9] !== 1 || b[start + 18] !== 0) unsupported();
      preSkip = b.readUInt16LE(start + 10);
      serial = pageSerial;
    } else if (b[offset + 5] & 2) invalid();
    if (serial !== pageSerial || b.readUInt32LE(offset + 18) !== sequence++) invalid();
    if (b[offset + 5] & 4) {
      ended = true;
      endGranule = b.readBigUInt64LE(offset + 6);
    }
    offset = end;
  }
  if (
    !ended ||
    endGranule === undefined ||
    endGranule <= BigInt(preSkip) ||
    endGranule > BigInt(Number.MAX_SAFE_INTEGER)
  )
    invalid();
  return {
    body: b,
    format: 'oggopus',
    durationMs: duration((Number(endGranule - BigInt(preSkip)) / 48000) * 1000),
  };
}
export function prepareAudio(file: AudioInput): PreparedAudio {
  if (!file.bytes.byteLength) invalid('Запись пуста.');
  if (file.bytes.byteLength > SPEECHKIT_SYNC.maxBytes)
    throw new ProviderError(
      413,
      'Синхронный SpeechKit принимает файл до 1 МБ и 30 секунд. Для большой записи нужна асинхронная обработка, которая пока не подключена. Добавьте транскрипцию; файл не отправлен провайдеру.',
      'ASYNC_REQUIRED',
    );
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (!['wav', 'ogg'].includes(ext || '')) unsupported();
  const mime = file.type.split(';')[0].trim().toLowerCase();
  const accepted =
    ext === 'wav' ? ['audio/wav', 'audio/x-wav', 'audio/wave'] : ['audio/ogg', 'application/ogg'];
  if (mime && mime !== 'application/octet-stream' && !accepted.includes(mime)) unsupported();
  const bytes = Buffer.from(file.bytes.buffer, file.bytes.byteOffset, file.bytes.byteLength);
  return ext === 'wav' ? wav(bytes) : ogg(bytes);
}
