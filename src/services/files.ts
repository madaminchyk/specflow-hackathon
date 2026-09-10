export const MAX_MEDIA_BYTES = 100 * 1024 * 1024;
// Transient handoff from the home upload to the player; never serialized.
export const sessionMedia = new Map<string, File>();
export { SPEECHKIT_SYNC } from '../domain/transcription';
export const MAX_TEXT_BYTES = 512 * 1024;
const media: Record<string, string[]> = {
  mp3: ['audio/mpeg', 'audio/mp3'],
  wav: ['audio/wav', 'audio/x-wav', 'audio/wave'],
  m4a: ['audio/mp4', 'audio/x-m4a'],
  mp4: ['video/mp4', 'audio/mp4'],
  webm: ['audio/webm', 'video/webm'],
  ogg: ['audio/ogg', 'video/ogg', 'application/ogg'],
  mov: ['video/quicktime'],
};
export function validateFile(file: Pick<File, 'name' | 'size' | 'type'>) {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const isText = ['txt', 'md', 'srt', 'vtt'].includes(ext);
  if (!isText && !media[ext])
    throw new Error(
      'Формат не поддерживается. Добавьте MP3, WAV, M4A, MP4, WEBM, OGG, MOV или TXT, MD, SRT, VTT.',
    );
  if (!file.size) throw new Error('Файл пуст.');
  if (file.size > (isText ? MAX_TEXT_BYTES : MAX_MEDIA_BYTES))
    throw new Error(isText ? 'Текстовый файл больше 512 КБ.' : 'Запись больше 100 МБ.');
  if (
    file.type &&
    file.type !== 'application/octet-stream' &&
    !(isText
      ? ['text/plain', 'text/markdown', 'text/vtt', 'application/x-subrip'].includes(file.type)
      : media[ext].includes(file.type))
  )
    throw new Error('Тип файла не соответствует расширению.');
  return isText ? 'text' : 'media';
}
