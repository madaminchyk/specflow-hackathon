import { newRequirement, SegmentSchema, type Segment, type Analysis } from '../domain/model.js';
export const MAX_TEXT = 180000;
function timestamp(v: string) {
  const nums = v.replace(',', '.').split(':').map(Number);
  return Math.round(nums.reduce((a, n) => a * 60 + n, 0) * 1000);
}
export function parseTranscript(raw: string): Segment[] {
  if (!raw.trim()) throw new Error('Добавьте непустую транскрипцию.');
  if (raw.length > MAX_TEXT)
    throw new Error('Транскрипция слишком большая: максимум 180 000 символов.');
  const normalized = raw.replace(/^\uFEFF/, '').replace(/\r/g, '');
  const result: Segment[] = [];
  const cue = /(?:(\d{2}:)?\d{2}:\d{2}[.,]\d{3})\s*-->\s*(?:(\d{2}:)?\d{2}:\d{2}[.,]\d{3})/;
  if (normalized.includes('-->')) {
    for (const block of normalized.split(/\n\s*\n/)) {
      const lines = block.split('\n');
      const index = lines.findIndex((l) => cue.test(l));
      if (index < 0) continue;
      const times = lines[index].match(/(?:\d{2}:)?\d{2}:\d{2}[.,]\d{3}/g)!;
      const text = lines
        .slice(index + 1)
        .join(' ')
        .replace(/<v\s+([^>]+)>/g, '$1: ')
        .replace(/<[^>]*>/g, '')
        .trim();
      if (text)
        result.push(
          makeSegment(text, result.length, timestamp(times[0]), timestamp(times[1]), 'exact'),
        );
    }
    if (!result.length) throw new Error('Не удалось прочитать таймкоды SRT/VTT.');
  } else {
    let cursor = 0;
    for (const line of normalized
      .split(/\n+/)
      .map((x) => x.trim())
      .filter(Boolean)) {
      const duration = Math.max(3000, Math.round(line.length / 13) * 1000);
      result.push(makeSegment(line, result.length, cursor, cursor + duration, 'estimated'));
      cursor += duration;
    }
  }
  return result.map((s) => SegmentSchema.parse(s));
}
function makeSegment(
  text: string,
  index: number,
  startMs: number,
  endMs: number,
  timing: Segment['timing'],
): Segment {
  const speaker = text.match(/^([^:]{1,35}):\s*(.+)$/);
  return {
    id: `seg-${index + 1}`,
    speakerId: speaker?.[1] || 'speaker',
    speakerName: speaker?.[1] || 'Участник',
    startMs,
    endMs,
    text: speaker?.[2] || text,
    timing,
  };
}
export function analyzeLocal(segments: Segment[]): Analysis {
  const requirements = segments.flatMap((s) => {
    const t = s.text.toLowerCase();
    let type: Analysis['requirements'][number]['type'] | undefined;
    if (/вопрос|\?|уточнить/.test(t)) type = 'openQuestion';
    else if (/договорились|согласовали/.test(t)) type = 'agreement';
    else if (/нельзя|ограничение|не более|не дольше/.test(t)) type = 'constraint';
    else if (/нужно|должен|должна|необходимо|пользователь|администратор/.test(t))
      type = 'functional';
    if (!type) return [];
    return [
      {
        ...newRequirement(),
        id: `req-${s.id}`,
        title: s.text.length > 85 ? s.text.slice(0, 82) + '…' : s.text,
        description: s.text,
        type,
        status: 'needsClarification' as const,
        confidence: 0.45,
        manuallyCreated: false,
        sourceSegmentIds: [s.id],
        rationale: 'Черновик по явному речевому маркеру. Проверьте смысл и полноту вручную.',
      },
    ];
  });
  return { requirements, roles: [], scenarios: [], conflicts: [] };
}
