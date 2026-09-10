import type { Project, Requirement } from './model';
export type Action =
  | { type: 'upsert'; item: Requirement }
  | { type: 'delete'; id: string }
  | { type: 'restore'; snapshot: Project }
  | { type: 'patch'; patch: Partial<Project> };
export function projectReducer(p: Project, a: Action): Project {
  let next = p;
  let message = 'Изменён проект';
  if (a.type === 'upsert') {
    next = {
      ...p,
      requirements: p.requirements.some((r) => r.id === a.item.id)
        ? p.requirements.map((r) => (r.id === a.item.id ? a.item : r))
        : [...p.requirements, a.item],
    };
    message = 'Сохранено: ' + a.item.title;
  }
  if (a.type === 'delete') {
    next = {
      ...p,
      requirements: p.requirements.filter((r) => r.id !== a.id),
      scenarios: p.scenarios.map((s) => ({
        ...s,
        relatedRequirementIds: s.relatedRequirementIds.filter((id) => id !== a.id),
      })),
      conflicts: p.conflicts.map((c) => ({
        ...c,
        requirementIds: c.requirementIds.filter((id) => id !== a.id),
      })),
    };
    message = 'Удалён элемент';
  }
  if (a.type === 'restore') {
    next = a.snapshot;
    message = 'Удаление отменено';
  }
  if (a.type === 'patch') next = { ...p, ...a.patch };
  const now = new Date().toISOString();
  return { ...next, updatedAt: now, history: [{ at: now, message }, ...next.history].slice(0, 30) };
}
