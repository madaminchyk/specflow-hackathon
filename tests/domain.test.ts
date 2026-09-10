import { describe, it, expect } from 'vitest';
import { createDemo } from '../src/data/demo';
import { blankProject, newRequirement, ProjectSchema, validateAnalysis } from '../src/domain/model';
import { qualityGate } from '../src/domain/quality';
import { projectReducer } from '../src/domain/reducer';
import { parseTranscript, analyzeLocal } from '../src/services/analysis';
import { LocalRepository, STORAGE_KEY } from '../src/services/persistence';
import { exportJSON, exportMarkdown } from '../src/services/export';
import { validateFile } from '../src/services/files';
describe('Quality Gate', () => {
  it('returns zero for empty document', () => expect(qualityGate(blankProject()).score).toBe(0));
  it('calculates documented weighted score', () => {
    const p = createDemo();
    const q = qualityGate(p);
    expect(q.coverage).toBe(100);
    expect(q.questions).toBe(3);
    expect(q.conflicts).toBe(1);
    expect(q.score).toBe(73);
  });
  it('reaches 100 only when completeness criteria pass', () => {
    const p = createDemo();
    p.requirements = p.requirements.map((r) => ({
      ...r,
      status: 'approved',
      acceptanceCriteria: ['Проверено'],
    }));
    p.conflicts = p.conflicts.map((c) => ({ ...c, status: 'resolved' }));
    expect(qualityGate(p).score).toBe(100);
  });
  it('decreases when source or criteria are removed', () => {
    const p = createDemo();
    const before = qualityGate(p).score;
    p.requirements = p.requirements.map((r) => ({
      ...r,
      sourceSegmentIds: [],
      acceptanceCriteria: [],
    }));
    expect(qualityGate(p).score).toBeLessThan(before);
  });
});
describe('schema and traceability', () => {
  it('validates every demo reference', () => {
    const p = createDemo();
    expect(ProjectSchema.safeParse(p).success).toBe(true);
    expect(p.segments.length).toBeGreaterThanOrEqual(24);
    expect(p.requirements.every((r) => r.sourceSegmentIds.length)).toBe(true);
  });
  it('rejects fabricated source IDs and duplicate IDs', () => {
    const p = createDemo();
    p.requirements[0].sourceSegmentIds = ['invented'];
    expect(() => validateAnalysis(p, p.segments)).toThrow();
    p.segments.push(p.segments[0]);
    expect(ProjectSchema.safeParse(p).success).toBe(false);
  });
  it('rejects impossible confidence and times', () => {
    const p = createDemo();
    p.requirements[0].confidence = 2;
    expect(ProjectSchema.safeParse(p).success).toBe(false);
    p.requirements[0].confidence = 0.5;
    p.segments[0].endMs = -1;
    expect(ProjectSchema.safeParse(p).success).toBe(false);
  });
  it('rejects automatic items without sources', () => {
    const p = createDemo();
    p.requirements[0].sourceSegmentIds = [];
    expect(() => validateAnalysis(p, p.segments)).toThrow('без источника');
  });
});
describe('transcript parsing and local extraction', () => {
  it('ignores small talk and preserves literal evidence', () => {
    const s = parseTranscript(
      'Заказчик: Доброе утро!\nЗаказчик: Нужно отменять бронь.\nАналитик: Договорились провести пилот.\nЗаказчик: Вопрос: нужен Outlook?',
    );
    const a = analyzeLocal(s);
    expect(a.requirements).toHaveLength(3);
    expect(a.requirements.map((r) => r.type)).toEqual(['functional', 'agreement', 'openQuestion']);
    expect(a.requirements[0].description).toBe(s[1].text);
    expect(s[0].timing).toBe('estimated');
  });
  it('reads SRT and VTT exact timings', () => {
    for (const text of [
      '1\n00:01:02,500 --> 00:01:06,000\nЗаказчик: Нужно войти.',
      'WEBVTT\n\n00:01:02.500 --> 00:01:06.000\n<v Заказчик>Нужно войти.</v>',
    ]) {
      const s = parseTranscript(text);
      expect(s[0].startMs).toBe(62500);
      expect(s[0].speakerName).toBe('Заказчик');
      expect(s[0].text).toBe('Нужно войти.');
    }
  });
  it('rejects empty, oversized, malformed and reversed-time input', () => {
    for (const t of [
      ' ',
      'x'.repeat(180001),
      'a --> b',
      '00:00:04.000 --> 00:00:01.000\nНужно войти',
    ])
      expect(() => parseTranscript(t)).toThrow();
  });
});
describe('CRUD and persistence', () => {
  it('creates, edits, deletes, restores with reference integrity', () => {
    const p = createDemo();
    const item = newRequirement();
    let n = projectReducer(p, { type: 'upsert', item });
    expect(n.requirements).toHaveLength(19);
    n = projectReducer(n, {
      type: 'upsert',
      item: { ...item, title: 'Изменено', status: 'needsClarification' },
    });
    expect(n.requirements.at(-1)?.title).toBe('Изменено');
    const snapshot = n;
    n = projectReducer(n, { type: 'delete', id: 'REQ-004' });
    expect(ProjectSchema.safeParse(n).success).toBe(true);
    n = projectReducer(n, { type: 'restore', snapshot });
    expect(n.requirements.find((r) => r.id === 'REQ-004')).toBeDefined();
  });
  it('roundtrips versioned storage and refuses corrupt data without overwrite', () => {
    const repo = new LocalRepository();
    const p = createDemo();
    repo.save(p);
    expect(repo.list()[0]).toEqual(p);
    localStorage.setItem(STORAGE_KEY, 'broken');
    expect(() => repo.save(p)).toThrow();
    expect(localStorage.getItem(STORAGE_KEY)).toBe('broken');
  });
});
describe('export and upload validation', () => {
  it('exports full document with intact Unicode and evidence', () => {
    const p = createDemo();
    const md = exportMarkdown(p);
    for (const section of [
      'Резюме',
      'Роли',
      'Пользовательские сценарии',
      'Матрица трассировки',
      'Противоречия и решения',
      'Критерии приёмки',
    ])
      expect(md).toContain(section);
    expect(md).toContain(p.segments[2].text);
    expect(md).not.toMatch(/undefined|\[object Object\]/);
    expect(JSON.parse(exportJSON(p)).project).toEqual(p);
  });
  it('rejects mismatched MIME, oversized and empty files', () => {
    expect(() => validateFile({ name: 'audio.mp3', type: 'text/html', size: 10 })).toThrow();
    expect(() =>
      validateFile({ name: 'a.mp3', type: 'audio/mpeg', size: 200 * 1024 * 1024 }),
    ).toThrow();
    expect(() => validateFile({ name: 'a.txt', type: 'text/plain', size: 0 })).toThrow();
    expect(validateFile({ name: 'a.vtt', type: 'text/vtt', size: 40 })).toBe('text');
  });
});
