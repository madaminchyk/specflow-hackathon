import { useState } from 'react';
import { Check, Link2, Trash2, Unlink, ArrowUpRight } from 'lucide-react';
import {
  types,
  statuses,
  priorities,
  time,
  RequirementSchema,
  type Project,
  type Requirement,
} from '../../domain/model';
export function Inspector({
  item,
  project,
  onSave,
  onDelete,
  onSource,
}: {
  item: Requirement;
  project: Project;
  onSave: (r: Requirement) => boolean | void;
  onDelete: () => void;
  onSource: (id: string) => void;
}) {
  const [draft, setDraft] = useState(item);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const change = <K extends keyof Requirement>(key: K, value: Requirement[K]) =>
    setDraft({ ...draft, [key]: value });
  const save = () => {
    const parsed = RequirementSchema.safeParse({ ...draft, updatedAt: new Date().toISOString() });
    if (!parsed.success) {
      setError('Заполните заголовок и описание. Заголовок — до 300 символов.');
      return;
    }
    if (onSave(parsed.data) === false) {
      setError('Не удалось сохранить. Проверьте сообщение об ошибке и повторите попытку.');
      return;
    }
    setEditing(false);
    setError('');
  };
  return (
    <aside className="inspector">
      <div className="pane-heading">
        <span>
          <Link2 size={17} />
          След требования
        </span>
        <span className="muted">{item.id.startsWith('REQ') ? item.id : 'Вручную'}</span>
      </div>
      <div className="inspector-content">
        <div className="badges">
          <span className={'badge ' + item.type}>{types[item.type]}</span>
          <span className="badge">{statuses[item.status]}</span>
        </div>
        {editing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <label>
              Название
              <input
                value={draft.title}
                onChange={(e) => change('title', e.target.value)}
                maxLength={300}
                required
              />
            </label>
            <label>
              Описание
              <textarea
                rows={4}
                value={draft.description}
                onChange={(e) => change('description', e.target.value)}
                required
              />
            </label>
            <div className="form-row">
              <label>
                Тип
                <select
                  value={draft.type}
                  onChange={(e) => change('type', e.target.value as Requirement['type'])}
                >
                  {Object.entries(types).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Приоритет
                <select
                  value={draft.priority}
                  onChange={(e) => {
                    setDraft({
                      ...draft,
                      priority: e.target.value as Requirement['priority'],
                      priorityOrigin: 'explicit',
                    });
                  }}
                >
                  {Object.entries(priorities).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Статус
              <select
                value={draft.status}
                onChange={(e) => change('status', e.target.value as Requirement['status'])}
              >
                {Object.entries(statuses).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <fieldset>
              <legend>Роли</legend>
              {project.roles.map((r) => (
                <label className="checkbox" key={r.id}>
                  <input
                    type="checkbox"
                    checked={draft.roleIds.includes(r.id)}
                    onChange={(e) =>
                      change(
                        'roleIds',
                        e.target.checked
                          ? [...draft.roleIds, r.id]
                          : draft.roleIds.filter((x) => x !== r.id),
                      )
                    }
                  />
                  {r.name}
                </label>
              ))}
              {!project.roles.length && <p className="muted">Роли пока не определены.</p>}
            </fieldset>
            <label>
              Условия, по одному на строку
              <textarea
                rows={2}
                value={draft.conditions.join('\n')}
                onChange={(e) => change('conditions', e.target.value.split('\n'))}
              />
            </label>
            <label>
              Критерии приёмки, по одному на строку
              <textarea
                rows={3}
                value={draft.acceptanceCriteria.join('\n')}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    acceptanceCriteria: e.target.value.split('\n'),
                    criteriaOrigin: 'explicit',
                  })
                }
              />
            </label>
            <label>
              Пользовательская история
              <textarea
                rows={3}
                value={draft.userStory || ''}
                onChange={(e) => change('userStory', e.target.value)}
              />
            </label>
            <label>
              Метки через запятую
              <input
                value={draft.tags.join(', ')}
                onChange={(e) =>
                  change(
                    'tags',
                    e.target.value.split(',').map((t) => t.trim()),
                  )
                }
              />
            </label>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <div className="action-row">
              <button type="submit" className="primary">
                <Check size={17} />
                Сохранить
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraft(item);
                  setEditing(false);
                }}
              >
                Отмена
              </button>
            </div>
          </form>
        ) : (
          <>
            <h2>{item.title}</h2>
            <p>{item.description}</p>
            <div className="detail-grid">
              <span>Приоритет</span>
              <strong>
                {priorities[item.priority]}
                <small>
                  {item.priorityOrigin === 'suggested'
                    ? 'Предложение системы'
                    : 'Подтверждён человеком'}
                </small>
              </strong>
              <span>Роль</span>
              <strong>
                {item.roleIds
                  .map((id) => project.roles.find((r) => r.id === id)?.name)
                  .join(', ') || 'Не определена'}
              </strong>
              <span>Уверенность</span>
              <strong>
                {item.manuallyCreated
                  ? 'Ручной элемент'
                  : `${item.confidence < 0.65 ? 'Низкая' : item.confidence < 0.85 ? 'Средняя' : 'Высокая'} · ${Math.round(item.confidence * 100)}%`}
              </strong>
            </div>
            <details className="micro-help">
              <summary>Что означает уверенность?</summary>Служебная оценка анализа, а не вероятность
              истинности. Проверьте источник и смысл.
            </details>
            <div className="action-row">
              <button className="primary" onClick={() => setEditing(true)}>
                Редактировать
              </button>
              <button
                onClick={() =>
                  onSave({
                    ...item,
                    status: 'needsClarification',
                    updatedAt: new Date().toISOString(),
                  })
                }
              >
                Уточнить
              </button>
            </div>
            {item.userStory && (
              <section className="detail-section">
                <h3>Пользовательская история</h3>
                <p>{item.userStory}</p>
              </section>
            )}
            {item.conditions.length > 0 && (
              <section className="detail-section">
                <h3>Условия</h3>
                <ul>
                  {item.conditions.filter(Boolean).map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              </section>
            )}
            <section className="detail-section">
              <h3>
                Критерии приёмки{' '}
                <span className="suggested">
                  {item.criteriaOrigin === 'suggested' ? 'Предложение' : 'Подтверждены'}
                </span>
              </h3>
              {item.acceptanceCriteria.some((x) => x.trim()) ? (
                <ul className="criteria">
                  {item.acceptanceCriteria.filter(Boolean).map((x, i) => (
                    <li key={i}>
                      <Check size={15} />
                      <span>{x}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">Добавьте проверяемые критерии при редактировании.</p>
              )}
            </section>
          </>
        )}
        <section className="detail-section evidence-section">
          <h3>
            <Link2 size={17} />
            Источник и доказательство <span className="count">{item.sourceSegmentIds.length}</span>
          </h3>
          <p className="muted">{item.rationale}</p>
          {item.sourceSegmentIds.map((id) => {
            const s = project.segments.find((s) => s.id === id)!;
            return (
              <div className="evidence" key={id}>
                <button className="evidence-link" onClick={() => onSource(id)}>
                  <span>{s.speakerName}</span>
                  <span>
                    {time(s.startMs)}–{time(s.endMs)} <ArrowUpRight size={14} />
                  </span>
                </button>
                <blockquote>«{s.text}»</blockquote>
                <button
                  className="text-button"
                  onClick={() =>
                    onSave({
                      ...item,
                      sourceSegmentIds: item.sourceSegmentIds.filter((x) => x !== id),
                    })
                  }
                >
                  <Unlink size={14} />
                  Отвязать источник
                </button>
              </div>
            );
          })}
          {!item.sourceSegmentIds.length && (
            <p className="notice">Нет источника. Свяжите элемент с репликой ниже.</p>
          )}
          <label>
            Привязать фрагмент
            <select
              value=""
              aria-label="Привязать фрагмент"
              onChange={(e) => {
                if (e.target.value)
                  onSave({ ...item, sourceSegmentIds: [...item.sourceSegmentIds, e.target.value] });
              }}
            >
              <option value="">Выберите реплику…</option>
              {project.segments
                .filter((s) => !item.sourceSegmentIds.includes(s.id))
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {time(s.startMs)} {s.speakerName}: {s.text.slice(0, 65)}
                  </option>
                ))}
            </select>
          </label>
        </section>
        <button className="danger delete-button" onClick={onDelete}>
          <Trash2 size={16} />
          Удалить элемент
        </button>
      </div>
    </aside>
  );
}
