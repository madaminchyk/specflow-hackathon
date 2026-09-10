import { z } from 'zod';
const id = z.string().min(1).max(120);
const text = z.string().max(12000);
export const types = {
  functional: 'Функция',
  nonFunctional: 'Нефункциональное',
  constraint: 'Ограничение',
  businessRule: 'Бизнес-правило',
  agreement: 'Договорённость',
  openQuestion: 'Открытый вопрос',
} as const;
export const statuses = {
  draft: 'Черновик',
  approved: 'Подтверждено',
  needsClarification: 'Уточнить',
  rejected: 'Отклонено',
} as const;
export const priorities = {
  must: 'Обязательно',
  should: 'Желательно',
  could: 'Возможно',
  wont: 'Вне объёма',
} as const;
export const SegmentSchema = z
  .object({
    id,
    speakerId: id,
    speakerName: z.string().min(1),
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().nonnegative(),
    text: z.string().min(1).max(12000),
    confidence: z.number().min(0).max(1).optional(),
    timing: z.enum(['exact', 'estimated']).default('exact'),
  })
  .refine((s) => s.endMs > s.startMs, { message: 'Конец сегмента должен быть позже начала' });
export const RequirementSchema = z.object({
  id,
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().min(1).max(12000),
  type: z.enum([
    'functional',
    'nonFunctional',
    'constraint',
    'businessRule',
    'agreement',
    'openQuestion',
  ]),
  roleIds: z.array(id),
  priority: z.enum(['must', 'should', 'could', 'wont']),
  status: z.enum(['draft', 'approved', 'needsClarification', 'rejected']),
  confidence: z.number().min(0).max(1),
  conditions: z.array(text),
  acceptanceCriteria: z.array(text),
  userStory: text.optional(),
  sourceSegmentIds: z.array(id),
  tags: z.array(z.string().max(100)),
  createdAt: z.string(),
  updatedAt: z.string(),
  manuallyCreated: z.boolean().optional(),
  priorityOrigin: z.enum(['explicit', 'suggested']).default('suggested'),
  criteriaOrigin: z.enum(['explicit', 'suggested']).default('suggested'),
  rationale: text.default('Источник содержит основание для этого элемента.'),
});
export const RoleSchema = z.object({
  id,
  name: z.string().min(1),
  description: text,
  goals: z.array(text),
});
export const ScenarioSchema = z.object({
  id,
  title: z.string().min(1),
  roleId: id,
  steps: z.array(text),
  relatedRequirementIds: z.array(id),
});
export const ConflictSchema = z.object({
  id,
  title: z.string().min(1),
  description: text,
  sourceSegmentIds: z.array(id).min(2),
  requirementIds: z.array(id),
  severity: z.enum(['low', 'medium', 'high']),
  status: z.enum(['open', 'resolved', 'ignored']),
  resolution: text.optional(),
});
export const AnalysisSchema = z.object({
  requirements: z.array(RequirementSchema).max(250),
  roles: z.array(RoleSchema).max(50),
  scenarios: z.array(ScenarioSchema).max(100),
  conflicts: z.array(ConflictSchema).max(100),
});
export const ProjectSchema = z
  .object({
    id,
    title: z.string().trim().min(1).max(200),
    createdAt: z.string(),
    updatedAt: z.string(),
    summary: text,
    mode: z.enum(['demo', 'local', 'ai']),
    processingStatus: z.enum(['idle', 'uploaded', 'transcribing', 'analyzing', 'ready', 'error']),
    media: z.object({ name: z.string(), size: z.number(), type: z.string() }).optional(),
    segments: z.array(SegmentSchema).max(2000),
    ...AnalysisSchema.shape,
    history: z.array(z.object({ at: z.string(), message: z.string() })).max(30),
  })
  .superRefine((p, ctx) => {
    for (const message of integrityErrors(p))
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  });
export type Segment = z.infer<typeof SegmentSchema>;
export type Requirement = z.infer<typeof RequirementSchema>;
export type Analysis = z.infer<typeof AnalysisSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export function integrityErrors(p: Analysis & { segments: Segment[] }) {
  const errors: string[] = [];
  const ids = (a: { id: string }[]) => new Set(a.map((x) => x.id));
  const seg = ids(p.segments),
    req = ids(p.requirements),
    roles = ids(p.roles);
  for (const a of [p.segments, p.requirements, p.roles, p.scenarios, p.conflicts])
    if (ids(a).size !== a.length) errors.push('Повторяющиеся идентификаторы');
  for (const r of p.requirements) {
    if (r.sourceSegmentIds.some((s) => !seg.has(s)))
      errors.push('Несуществующий источник: ' + r.id);
    if (r.roleIds.some((s) => !roles.has(s))) errors.push('Несуществующая роль: ' + r.id);
  }
  for (const s of p.scenarios)
    if (!roles.has(s.roleId) || s.relatedRequirementIds.some((r) => !req.has(r)))
      errors.push('Некорректный сценарий: ' + s.id);
  for (const c of p.conflicts)
    if (
      new Set(c.sourceSegmentIds).size < 2 ||
      c.sourceSegmentIds.some((s) => !seg.has(s)) ||
      c.requirementIds.some((r) => !req.has(r))
    )
      errors.push('Некорректный конфликт: ' + c.id);
  return errors;
}
export function validateAnalysis(
  data: unknown,
  segments: Segment[],
  requireSources = true,
): Analysis {
  const result = AnalysisSchema.parse(data);
  const errors = integrityErrors({ ...result, segments });
  if (requireSources && result.requirements.some((r) => !r.sourceSegmentIds.length))
    errors.push('Автоматический элемент без источника');
  if (errors.length) throw new Error(errors.join('; '));
  return result;
}
export function blankProject(title = 'Новая встреча'): Project {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title,
    createdAt: now,
    updatedAt: now,
    summary: 'Черновик требований по материалам встречи.',
    mode: 'local',
    processingStatus: 'idle',
    segments: [],
    requirements: [],
    roles: [],
    scenarios: [],
    conflicts: [],
    history: [],
  };
}
export function newRequirement(): Requirement {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: 'Новое требование',
    description: 'Опишите проверяемое поведение системы.',
    type: 'functional',
    roleIds: [],
    priority: 'should',
    status: 'draft',
    confidence: 0,
    conditions: [],
    acceptanceCriteria: [],
    sourceSegmentIds: [],
    tags: [],
    createdAt: now,
    updatedAt: now,
    manuallyCreated: true,
    priorityOrigin: 'suggested',
    criteriaOrigin: 'suggested',
    rationale: 'Создано вручную. Добавьте источник для проверки.',
  };
}
export function time(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}
