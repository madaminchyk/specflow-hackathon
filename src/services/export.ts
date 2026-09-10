import { types, statuses, priorities, time, type Project } from '../domain/model';
import { qualityGate } from '../domain/quality';
const safe = (s: string) => s.replace(/[\r\n]+/g, ' ').replace(/\|/g, '\\|');
export function exportMarkdown(p: Project) {
  const q = qualityGate(p);
  return [
    `# Техническое задание: ${p.title}`,
    '',
    `Создано: ${p.createdAt} · Экспорт: ${new Date().toISOString()}`,
    `Режим: ${p.mode}. Документ требует утверждения человеком.`,
    p.mode === 'demo' ? 'Учебная встреча. Реплики и таймкоды подготовлены заранее.' : '',
    `Quality Gate: ${q.score}/100 — проверка комплектности, не точности AI.`,
    '\n## Резюме',
    p.summary,
    '\n## Роли',
    ...p.roles.map((r) => `### ${r.name}\n${r.description}\nЦели: ${r.goals.join('; ')}`),
    '\n## Пользовательские сценарии',
    ...p.scenarios.map(
      (s) =>
        `### ${s.title}\nРоль: ${p.roles.find((r) => r.id === s.roleId)?.name || s.roleId}\n${s.steps.map((x, i) => `${i + 1}. ${x}`).join('\n')}\nТребования: ${s.relatedRequirementIds.join(', ')}`,
    ),
    ...Object.entries(types).flatMap(([type, label]) => [
      `\n## ${label}`,
      ...p.requirements
        .filter((r) => r.type === type)
        .map(
          (r) =>
            `### ${r.id} · ${r.title}\n${r.description}\n\nПриоритет: ${priorities[r.priority]} (${r.priorityOrigin === 'suggested' ? 'предложение' : 'подтверждён'}). Статус: ${statuses[r.status]}.\nРоли: ${r.roleIds.map((id) => p.roles.find((x) => x.id === id)?.name || id).join(', ') || 'Не определены'}.\nОценка: ${Math.round(r.confidence * 100)}% — служебная уверенность, не вероятность истинности.\nУсловия: ${r.conditions.join('; ') || 'Не указаны'}.\n${r.userStory || ''}\nКритерии приёмки (${r.criteriaOrigin === 'suggested' ? 'предложение' : 'подтверждены'}):\n${r.acceptanceCriteria.map((x) => '- ' + x).join('\n') || '- Требуют определения'}\nОснование: ${r.rationale}`,
        ),
    ]),
    '\n## Противоречия и решения',
    ...p.conflicts.map(
      (c) =>
        `### ${c.title}\n${c.description}\nСтатус: ${{ open: 'Открыто', resolved: 'Решено', ignored: 'Игнорируется' }[c.status]}. Решение: ${c.resolution || 'Не принято'}.`,
    ),
    '\n## Матрица трассировки',
    '| ID требования | Время | Говорящий | Цитата |',
    '| --- | --- | --- | --- |',
    ...p.requirements.flatMap((r) =>
      r.sourceSegmentIds.map((id) => {
        const s = p.segments.find((s) => s.id === id)!;
        return `| ${safe(r.id)} | ${time(s.startMs)}–${time(s.endMs)}${s.timing === 'estimated' ? ' (оценка)' : ''} | ${safe(s.speakerName)} | ${safe(s.text)} |`;
      }),
    ),
    '\n## История изменений',
    ...p.history.map((h) => `- ${h.at}: ${h.message}`),
    '\nВсе автоматически созданные данные проверяются человеком перед разработкой.',
  ].join('\n');
}
export function exportJSON(p: Project) {
  return JSON.stringify(
    {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      notice: 'Документ требует утверждения человеком.',
      project: p,
    },
    null,
    2,
  );
}
export function download(content: Blob | string, name: string, mime = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(
    typeof content === 'string' ? new Blob([content], { type: mime }) : content,
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function exportDocx(p: Project) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import('docx');
  const children = exportMarkdown(p)
    .split('\n')
    .map(
      (line) =>
        new Paragraph({
          heading: line.startsWith('# ')
            ? HeadingLevel.TITLE
            : line.startsWith('## ')
              ? HeadingLevel.HEADING_1
              : line.startsWith('### ')
                ? HeadingLevel.HEADING_2
                : undefined,
          children: [new TextRun(line.replace(/^#{1,3} /, ''))],
        }),
    );
  return Packer.toBlob(new Document({ sections: [{ children }] }));
}
