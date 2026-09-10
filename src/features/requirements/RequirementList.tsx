import { useState } from 'react';
import { Search, SlidersHorizontal, Link2, Plus, ArrowUpDown, Check } from 'lucide-react';
import { types, statuses, priorities, type Project, type Requirement } from '../../domain/model';
export function RequirementList({
  project,
  selected,
  onSelect,
  onAdd,
  questions = false,
  onBulk,
}: {
  project: Project;
  selected: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  questions?: boolean;
  onBulk: (ids: string[], status: Requirement['status']) => void;
}) {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [type, setType] = useState('');
  const [role, setRole] = useState('');
  const [priority, setPriority] = useState('');
  const [status, setStatus] = useState('');
  const [low, setLow] = useState(false);
  const [sort, setSort] = useState('default');
  const [group, setGroup] = useState('none');
  const [checked, setChecked] = useState<string[]>([]);
  let items = project.requirements.filter(
    (r) =>
      (!questions || r.type === 'openQuestion') &&
      (!search ||
        `${r.title} ${r.description} ${r.id} ${r.tags.join(' ')}`
          .toLowerCase()
          .includes(search.toLowerCase())) &&
      (!type || r.type === type) &&
      (!role || r.roleIds.includes(role)) &&
      (!priority || r.priority === priority) &&
      (!status || r.status === status) &&
      (!low || r.confidence < 0.65),
  );
  if (sort === 'confidence') items = items.toSorted((a, b) => a.confidence - b.confidence);
  if (sort === 'title') items = items.toSorted((a, b) => a.title.localeCompare(b.title, 'ru'));
  if (sort === 'priority') {
    const order = ['must', 'should', 'could', 'wont'];
    items = items.toSorted((a, b) => order.indexOf(a.priority) - order.indexOf(b.priority));
  }
  const groupName = (r: Requirement) =>
    group === 'type'
      ? types[r.type]
      : group === 'role'
        ? r.roleIds.map((id) => project.roles.find((x) => x.id === id)?.name).join(', ') ||
          'Без роли'
        : '';
  const groups = Map.groupBy(items, groupName);
  return (
    <>
      <div className="list-heading">
        <div>
          <h2>
            {questions ? 'Открытые вопросы' : 'Требования'} <span>{items.length}</span>
          </h2>
          <p className="muted">Проверьте формулировки и подтвердите решения</p>
        </div>
        <button className="icon-button" aria-label="Добавить требование" onClick={onAdd}>
          <Plus size={20} />
        </button>
      </div>
      <div className="search-row">
        <div className="search-input">
          <Search size={17} />
          <input
            aria-label="Поиск требований"
            placeholder="Найти требование…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button
          aria-label="Фильтры"
          aria-expanded={expanded}
          className={'icon-button ' + (expanded ? 'active' : '')}
          onClick={() => setExpanded(!expanded)}
        >
          <SlidersHorizontal size={18} />
        </button>
      </div>
      {expanded && (
        <div className="filters">
          <label>
            Тип
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">Все типы</option>
              {Object.entries(types).map(([v, l]) => (
                <option value={v} key={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label>
            Роль
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="">Все роли</option>
              {project.roles.map((r) => (
                <option value={r.id} key={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Приоритет
            <select value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="">Все приоритеты</option>
              {Object.entries(priorities).map(([v, l]) => (
                <option value={v} key={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label>
            Статус
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Все статусы</option>
              {Object.entries(statuses).map(([v, l]) => (
                <option value={v} key={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={low} onChange={(e) => setLow(e.target.checked)} />
            Низкая уверенность
          </label>
          <button
            className="text-button"
            onClick={() => {
              setType('');
              setRole('');
              setPriority('');
              setStatus('');
              setLow(false);
              setSearch('');
            }}
          >
            Сбросить фильтры
          </button>
        </div>
      )}
      <div className="sort-row">
        <ArrowUpDown size={14} />
        <select aria-label="Сортировка" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="default">По порядку встречи</option>
          <option value="confidence">По уверенности</option>
          <option value="priority">По приоритету</option>
          <option value="title">По названию</option>
        </select>
        <select aria-label="Группировка" value={group} onChange={(e) => setGroup(e.target.value)}>
          <option value="none">Без группировки</option>
          <option value="type">По типу</option>
          <option value="role">По роли</option>
        </select>
      </div>
      {checked.length > 0 && (
        <div className="bulk-actions">
          <span>{checked.length} выбрано</span>
          <button
            onClick={() => {
              onBulk(checked, 'approved');
              setChecked([]);
            }}
          >
            <Check size={14} />
            Подтвердить
          </button>
          <button
            onClick={() => {
              onBulk(checked, 'needsClarification');
              setChecked([]);
            }}
          >
            Уточнить
          </button>
        </div>
      )}
      <div className="requirement-list">
        {Array.from(groups).map(([label, list]) => (
          <section key={label}>
            {label && <h3 className="group-heading">{label}</h3>}
            {list.map((r) => (
              <article
                key={r.id}
                className={'requirement-card ' + (selected === r.id ? 'selected' : '')}
              >
                <div className="card-select">
                  <input
                    type="checkbox"
                    aria-label={'Выбрать ' + r.title}
                    checked={checked.includes(r.id)}
                    onChange={(e) =>
                      setChecked(
                        e.target.checked ? [...checked, r.id] : checked.filter((x) => x !== r.id),
                      )
                    }
                  />
                </div>
                <button
                  className="card-main"
                  onClick={() => onSelect(r.id)}
                  aria-pressed={selected === r.id}
                >
                  <div className="card-top">
                    <span className="req-id">
                      {r.id.startsWith('REQ') ? r.id : r.manuallyCreated ? 'ВРУЧНУЮ' : 'ЧЕРНОВИК'}
                    </span>
                    <span className={'priority ' + r.priority}>{priorities[r.priority]}</span>
                  </div>
                  <h3>{r.title}</h3>
                  <p>{r.description}</p>
                  <div className="card-bottom">
                    <span className={'badge ' + r.type}>{types[r.type]}</span>
                    <span className={'confidence ' + (r.confidence < 0.65 ? 'low' : '')}>
                      {r.manuallyCreated ? 'Вручную' : `${Math.round(r.confidence * 100)}%`}
                    </span>
                    <span className="source-count">
                      <Link2 size={13} />
                      {r.sourceSegmentIds.length}
                    </span>
                  </div>
                  <div className="card-status">
                    {statuses[r.status]}
                    {r.roleIds.length > 0 &&
                      ' · ' +
                        r.roleIds
                          .map((id) => project.roles.find((x) => x.id === id)?.name)
                          .join(', ')}
                  </div>
                </button>
              </article>
            ))}
          </section>
        ))}
        {!items.length && (
          <div className="empty">
            <Search />
            <p>Элементы не найдены</p>
            <span>Измените фильтры или добавьте требование.</span>
          </div>
        )}
      </div>
    </>
  );
}
