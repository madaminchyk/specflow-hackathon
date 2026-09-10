import type { Project } from './model';
export function qualityGate(p: Project) {
  const items = p.requirements.filter((r) => r.status !== 'rejected');
  const req = items.filter((r) => r.type !== 'openQuestion');
  const ratio = (n: number, d: number) => (d ? n / d : 0);
  const sourced = req.filter((r) => r.sourceSegmentIds.length).length;
  const accepted = req.filter((r) => r.acceptanceCriteria.some((x) => x.trim())).length;
  const questions = items.filter(
    (r) => r.type === 'openQuestion' && r.status !== 'approved',
  ).length;
  const unclear = items.filter(
    (r) =>
      r.status === 'needsClarification' || (r.type === 'openQuestion' && r.status !== 'approved'),
  ).length;
  const conflicts = p.conflicts.filter((c) => c.status === 'open').length;
  const score = items.length
    ? Math.round(
        30 * ratio(sourced, req.length) +
          25 * ratio(accepted, req.length) +
          20 * ratio(items.length - unclear, items.length) +
          15 * Number(!conflicts) +
          10 * Number(p.roles.length > 0 && p.scenarios.length > 0),
      )
    : 0;
  return {
    score: Math.max(0, Math.min(100, score)),
    coverage: Math.round(ratio(sourced, req.length) * 100),
    questions,
    conflicts,
    low: items.filter((r) => r.confidence < 0.65 && !r.manuallyCreated).length,
    missingCriteria: req.length - accepted,
  };
}
