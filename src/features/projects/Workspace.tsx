import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Link, useParams } from 'react-router-dom';
import {
  AudioLines,
  ChevronLeft,
  Download,
  Share2,
  Search,
  Upload,
  Play,
  Check,
  Info,
  AlertTriangle,
  FileText,
  Users,
  GitBranch,
  MessageCircle,
  Link2,
  X,
  RotateCcw,
} from 'lucide-react';
import { repository, Brand } from '../../app/App';
import {
  newRequirement,
  time,
  ProjectSchema,
  type Project,
  type Segment,
} from '../../domain/model';
import { qualityGate } from '../../domain/quality';
import { projectReducer, type Action } from '../../domain/reducer';
import { RequirementList } from '../requirements/RequirementList';
import { Inspector } from '../requirements/Inspector';
import { ImportDialog, NO_AI_MESSAGE } from '../upload/ImportDialog';
import { Dialog } from '../../components/Dialog';
import { download, exportMarkdown, exportJSON, exportDocx } from '../../services/export';
import { aiAnalyze, aiTranscribe, CloudError } from '../../services/ai';
import { sessionMedia, AUDIO_UPLOAD_HINT } from '../../services/files';
import { registerSpecTool } from '../../services/webmcp';
type Tab = 'requirements' | 'scenarios' | 'roles' | 'questions' | 'conflicts';
export function Workspace() {
  const { id } = useParams();
  let loaded: Project | undefined;
  let error = '';
  try {
    loaded = repository.list().find((p) => p.id === id);
  } catch (e) {
    error = (e as Error).message;
  }
  return loaded ? (
    <WorkspaceContent key={id} initial={loaded} />
  ) : (
    <main className="home">
      <Brand />
      <h1>Проект не найден</h1>
      <p>{error || 'Проекты сохраняются только в браузере, в котором были созданы.'}</p>
      <Link to="/">Вернуться к проектам</Link>
    </main>
  );
}
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const index = text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
  return index < 0 ? (
    <>{text}</>
  ) : (
    <>
      {text.slice(0, index)}
      <mark>{text.slice(index, index + query.length)}</mark>
      {text.slice(index + query.length)}
    </>
  );
}
function WorkspaceContent({ initial }: { initial: Project }) {
  const [p, setP] = useState(initial);
  const [tab, setTab] = useState<Tab>('requirements');
  const [pane, setPane] = useState('requirements');
  const [selected, setSelected] = useState(initial.requirements[0]?.id || '');
  const [source, setSource] = useState('');
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState<'import' | 'export' | 'delete' | 'quality' | 'ai' | null>(
    initial.processingStatus === 'idle' ? 'import' : null,
  );
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [undo, setUndo] = useState<Project | null>(null);
  const [file, setFile] = useState<File | undefined>(() => sessionMedia.get(initial.id));
  const [mediaUrl, setMediaUrl] = useState('');
  const [playing, setPlaying] = useState('');
  const [busy, setBusy] = useState('');
  const [stage, setStage] = useState('');
  const [external, setExternal] = useState(false);
  const [consent, setConsent] = useState(false);
  const player = useRef<HTMLVideoElement>(null);
  const segmentRefs = useRef(new Map<string, HTMLElement>());
  const clipEnd = useRef<number | null>(null);
  const abort = useRef<AbortController | null>(null);
  const q = qualityGate(p);
  const item = p.requirements.find((r) => r.id === selected);
  useEffect(() => {
    sessionMedia.delete(initial.id);
  }, [initial.id]);
  useEffect(() => registerSpecTool(p), [p]);
  const apply = (a: Action) => {
    try {
      if (external)
        throw new Error('Проект изменён в другой вкладке. Обновите страницу перед продолжением.');
      const next = ProjectSchema.parse(projectReducer(p, a));
      repository.save(next);
      setP(next);
      setError('');
      setNotice('Сохранено на устройстве');
      if (a.type !== 'delete') setUndo(null);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  };
  useEffect(() => {
    if (!file) {
      setMediaUrl('');
      return;
    }
    const url = URL.createObjectURL(file);
    setMediaUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    const handler = () => setExternal(true);
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 6000);
    return () => clearTimeout(timer);
  }, [notice]);
  const jump = (id: string) => {
    const s = p.segments.find((s) => s.id === id);
    if (!s) return;
    setSource(id);
    setQuery('');
    setPane('transcript');
    if (player.current && s.timing === 'exact') {
      player.current.currentTime = s.startMs / 1000;
      player.current.pause();
      clipEnd.current = null;
    }
    setTimeout(() => {
      segmentRefs.current.get(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      segmentRefs.current.get(id)?.focus({ preventScroll: true });
    }, 80);
  };
  const playClip = async (s: Segment) => {
    if (!player.current) return;
    try {
      player.current.currentTime = s.startMs / 1000;
      clipEnd.current = s.endMs / 1000;
      await player.current.play();
    } catch {
      setError('Браузер не смог воспроизвести запись. Проверьте формат файла.');
    }
  };
  const select = (id: string) => {
    setSelected(id);
    setPane('inspector');
  };
  const add = () => {
    const r = newRequirement();
    if (apply({ type: 'upsert', item: r })) select(r.id);
  };
  const media = (f: File) => {
    setFile(f);
    apply({
      type: 'patch',
      patch: {
        media: { name: f.name, size: f.size, type: f.type },
        processingStatus: p.segments.length ? 'ready' : 'uploaded',
      },
    });
  };
  const ai = async () => {
    if (!consent || busy) return;
    setBusy('ai');
    setError('');
    setStage(file && !p.segments.length ? 'Транскрибация' : 'Анализ');
    const controller = new AbortController();
    abort.current = controller;
    let working = p;
    try {
      let segments = p.segments;
      if (!segments.length) {
        if (!file) throw new Error('Добавьте запись или транскрипцию.');
        segments = await aiTranscribe(file, controller.signal);
        controller.signal.throwIfAborted();
        if (repository.list().find((x) => x.id === p.id)?.updatedAt !== p.updatedAt)
          throw new Error('Проект изменён во время распознавания. Обновите страницу.');
        working = ProjectSchema.parse(
          projectReducer(p, {
            type: 'patch',
            patch: { segments, mode: 'ai', processingStatus: 'uploaded' },
          }),
        );
        repository.save(working);
        setP(working);
      }
      setStage('Анализ');
      const analysis = await aiAnalyze(segments, controller.signal);
      controller.signal.throwIfAborted();
      if (repository.list().find((x) => x.id === p.id)?.updatedAt !== working.updatedAt) {
        throw new Error(
          'Проект изменён во время обработки. Обновите страницу, чтобы сохранить новые правки.',
        );
      }
      const next = ProjectSchema.parse(
        projectReducer(working, {
          type: 'patch',
          patch: { ...analysis, segments, mode: 'ai', processingStatus: 'ready' },
        }),
      );
      repository.save(next);
      setP(next);
      setSelected(next.requirements[0]?.id || '');
      setUndo(null);
      setNotice('AI обработка завершена. Черновик сохранён — проверьте источники.');
      setModal(null);
      setStage('Готово');
    } catch (e) {
      setError(
        controller.signal.aborted
          ? 'Обработка отменена. Исходные данные сохранены.'
          : (working !== p ? 'Распознанная транскрипция сохранена. ' : '') + (e as Error).message,
      );
      setStage(
        e instanceof CloudError && e.code === 'ASYNC_REQUIRED'
          ? 'Нужна асинхронная обработка'
          : 'Ошибка',
      );
    } finally {
      setBusy('');
      abort.current = null;
    }
  };
  const share = async () => {
    const text = `${p.title}\n${p.summary}\nЭлементов: ${p.requirements.length}. Quality Gate: ${q.score}/100. Открытых вопросов: ${q.questions}.\nЧерновик требует утверждения человеком.`;
    try {
      if (navigator.share) await navigator.share({ title: p.title, text });
      else {
        await navigator.clipboard.writeText(text);
        setNotice('Сводка скопирована');
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError')
        setError('Не удалось поделиться. Скачайте документ через экспорт.');
    }
  };
  const printDocument = () => {
    // Remove the modal/top layer before printing while preserving the user gesture.
    flushSync(() => setModal(null));
    try {
      window.print();
    } catch {
      setError(
        'Не удалось открыть печать. Откройте сайт в Edge или Chrome и нажмите Ctrl+P → «Сохранить как PDF».',
      );
    }
  };
  const exportFile = async (format: string) => {
    setBusy('export');
    try {
      if (format === 'md')
        download(exportMarkdown(p), 'specflow-spec.md', 'text/markdown;charset=utf-8');
      if (format === 'json') download(exportJSON(p), 'specflow-project.json', 'application/json');
      if (format === 'docx') download(await exportDocx(p), 'specflow-spec.docx');
      setNotice('Экспорт подготовлен');
    } catch {
      setError('Экспорт не удался. Попробуйте Markdown или JSON.');
    } finally {
      setBusy('');
    }
  };
  const tabs: { id: Tab; label: string; icon: typeof FileText; count?: number }[] = [
    { id: 'requirements', label: 'Требования', icon: FileText },
    { id: 'scenarios', label: 'Сценарии', icon: GitBranch },
    { id: 'roles', label: 'Роли', icon: Users },
    { id: 'questions', label: 'Вопросы', icon: MessageCircle, count: q.questions },
    { id: 'conflicts', label: 'Противоречия', icon: AlertTriangle, count: q.conflicts },
  ];
  return (
    <div className={'workspace mobile-' + pane}>
      <header className="workspace-header">
        <div className="workspace-brand">
          <Brand />
          <Link to="/" className="back-link">
            <ChevronLeft size={16} />
            Проекты
          </Link>
        </div>
        <div className="meeting-title">
          <h1>{p.title}</h1>
          <span className="save-status">
            <Check size={13} />
            Сохранено на устройстве{' '}
            <span className="mode-label">
              {p.mode === 'demo' ? 'ДЕМО' : p.mode === 'ai' ? 'AI-ЧЕРНОВИК' : 'ЛОКАЛЬНО'}
            </span>
            {p.mode === 'ai' && p.processingStatus === 'ready' && (
              <span className="mode-label">AI обработка завершена</span>
            )}
          </span>
        </div>
        <div className="header-actions">
          <button className="quality-button" onClick={() => setModal('quality')}>
            <span
              className="quality-mini"
              style={{ '--score': q.score + '%' } as React.CSSProperties}
            >
              {q.score}
            </span>
            <span>
              Quality Gate<small>Комплектность ТЗ</small>
            </span>
          </button>
          <button className="icon-button" aria-label="Поделиться" onClick={() => void share()}>
            <Share2 size={18} />
          </button>
          <button className="primary" onClick={() => setModal('export')}>
            <Download size={17} />
            <span>Экспорт</span>
          </button>
        </div>
      </header>
      {external && (
        <div className="error">
          Проект изменён в другой вкладке.{' '}
          <button onClick={() => location.reload()}>Обновить страницу</button>
        </div>
      )}
      {error && !modal && (
        <div className="error" role="alert">
          {error}
          <button className="text-button" onClick={() => setError('')}>
            Закрыть
          </button>
        </div>
      )}
      <div className="workspace-subbar">
        <div className="meeting-meta">
          <span>
            <AudioLines size={15} />
            {p.mode === 'demo' ? 'Учебная встреча · 07:54' : p.media?.name || 'Текстовая встреча'}
          </span>
          <span>{p.segments.length} реплик</span>
        </div>
        <span className="draft-note">Черновик · Требует проверки человеком</span>
      </div>
      <div className="workspace-grid">
        <aside className="transcript-pane">
          <div className="pane-heading">
            <span>
              <AudioLines size={18} />
              Транскрипция
            </span>
            <button
              className="icon-button"
              aria-label="Добавить материалы"
              onClick={() => setModal('import')}
            >
              <Upload size={16} />
            </button>
          </div>
          <div className="media-block">
            {mediaUrl ? (
              <video
                ref={player}
                src={mediaUrl}
                controls
                playsInline
                className={file?.type.startsWith('video') ? 'video-player' : 'audio-player'}
                onTimeUpdate={() => {
                  const current = player.current;
                  if (!current) return;
                  const ms = current.currentTime * 1000;
                  setPlaying(
                    p.segments.find((s) => s.timing === 'exact' && ms >= s.startMs && ms < s.endMs)
                      ?.id || '',
                  );
                  if (clipEnd.current !== null && current.currentTime >= clipEnd.current) {
                    current.pause();
                    clipEnd.current = null;
                  }
                }}
                onError={() =>
                  setError(
                    'Этот браузер не поддерживает формат записи. Добавьте аудиофайл или транскрипцию.',
                  )
                }
              />
            ) : (
              <div className="recording-placeholder">
                <AudioLines size={30} />
                <div>
                  <strong>
                    {p.mode === 'demo' ? 'Учебная транскрипция' : 'Запись не подключена'}
                  </strong>
                  <p>
                    {p.mode === 'demo'
                      ? 'Реплики и время подготовлены для демо. Аудиозаписи нет.'
                      : p.media
                        ? 'Выберите исходную запись заново для воспроизведения.'
                        : 'Добавьте аудио, видео или текст встречи.'}
                  </p>
                </div>
              </div>
            )}
            {p.media && (
              <p className="media-name">
                {p.media.name} · {(p.media.size / 1024 / 1024).toFixed(1)} МБ
              </p>
            )}
            {p.media && !p.segments.length && <p className="notice">{NO_AI_MESSAGE}.</p>}
            <div className="media-actions">
              <button className="text-button" onClick={() => setModal('import')}>
                Добавить транскрипцию
              </button>
              <button
                className="text-button"
                onClick={() => {
                  setError('');
                  setConsent(false);
                  setModal('ai');
                }}
              >
                AI-обработка
              </button>
            </div>
          </div>
          <div className="transcript-search">
            <div className="search-input">
              <Search size={16} />
              <input
                aria-label="Поиск по транскрипции"
                placeholder="Поиск в разговоре…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="speaker-legend">
              {Array.from(new Set(p.segments.map((s) => s.speakerName))).map((name, i) => (
                <span key={name}>
                  <i className={'speaker-dot speaker-' + i} />
                  {name}
                </span>
              ))}
            </div>
          </div>
          <div className="transcript-list">
            {p.segments
              .filter(
                (s) =>
                  !query ||
                  s.text.toLowerCase().includes(query.toLowerCase()) ||
                  s.speakerName.toLowerCase().includes(query.toLowerCase()),
              )
              .map((s) => (
                <article
                  tabIndex={-1}
                  ref={(el) => {
                    if (el) segmentRefs.current.set(s.id, el);
                    else segmentRefs.current.delete(s.id);
                  }}
                  id={s.id}
                  key={s.id}
                  className={
                    'segment ' +
                    (source === s.id ? 'source-active ' : '') +
                    (playing === s.id ? 'playing' : '')
                  }
                >
                  <div className="segment-top">
                    <span
                      className={'speaker-avatar ' + (s.speakerId === 'client' ? 'client' : '')}
                    >
                      {s.speakerName[0]}
                    </span>
                    <strong>{s.speakerName}</strong>
                    <button
                      className="timestamp"
                      onClick={() => jump(s.id)}
                      title={
                        s.timing === 'estimated'
                          ? 'Приблизительное время по длине текста'
                          : 'Перейти к фрагменту'
                      }
                    >
                      {s.timing === 'estimated' ? '≈ ' : ''}
                      {time(s.startMs)}
                    </button>
                  </div>
                  <p>
                    <Highlight text={s.text} query={query} />
                  </p>
                  {source === s.id && (
                    <div className="segment-actions">
                      {mediaUrl && s.timing === 'exact' && (
                        <button onClick={() => void playClip(s)}>
                          <Play size={14} />
                          Отрывок
                        </button>
                      )}
                      {item && !item.sourceSegmentIds.includes(s.id) && (
                        <button
                          onClick={() =>
                            apply({
                              type: 'upsert',
                              item: { ...item, sourceSegmentIds: [...item.sourceSegmentIds, s.id] },
                            })
                          }
                        >
                          <Link2 size={14} />
                          Привязать
                        </button>
                      )}
                      <span>Источник выбран</span>
                    </div>
                  )}
                </article>
              ))}
            {!p.segments.length && (
              <div className="empty">
                <p>Транскрипция пока пуста</p>
                <button onClick={() => setModal('import')}>Добавить текст</button>
              </div>
            )}
          </div>
        </aside>
        <main className="requirements-pane">
          <nav className="workspace-tabs" aria-label="Разделы проекта">
            {tabs.map((t) => (
              <button
                key={t.id}
                className={tab === t.id ? 'active' : ''}
                aria-current={tab === t.id ? 'page' : undefined}
                onClick={() => setTab(t.id)}
              >
                <t.icon size={15} />
                {t.label}
                {!!t.count && (
                  <span className={t.id === 'conflicts' ? 'coral-count' : 'count'}>{t.count}</span>
                )}
              </button>
            ))}
          </nav>
          <div className="requirements-scroll">
            {(tab === 'requirements' || tab === 'questions') && (
              <>
                <div className="context-note">
                  <span className="small-spark">✦</span>
                  {p.mode === 'demo'
                    ? 'Подготовленный пример анализа встречи'
                    : p.mode === 'local'
                      ? 'Черновики по явным речевым маркерам'
                      : 'AI предложил черновик требований'}
                  <Info size={15} />
                </div>
                {q.conflicts > 0 && tab === 'requirements' && (
                  <button className="conflict-banner" onClick={() => setTab('conflicts')}>
                    <AlertTriangle size={18} />
                    <span>
                      <strong>Есть противоречие</strong>
                      <small>Проверьте несовместимые решения в разговоре</small>
                    </span>
                    <span>→</span>
                  </button>
                )}
                <RequirementList
                  key={tab}
                  project={p}
                  selected={selected}
                  onSelect={select}
                  onAdd={add}
                  questions={tab === 'questions'}
                  onBulk={(ids, status) =>
                    apply({
                      type: 'patch',
                      patch: {
                        requirements: p.requirements.map((r) =>
                          ids.includes(r.id) ? { ...r, status } : r,
                        ),
                      },
                    })
                  }
                />
              </>
            )}
            {tab === 'roles' && (
              <>
                <div className="list-heading">
                  <h2>Роли пользователей</h2>
                  <span>{p.roles.length}</span>
                </div>
                {p.roles.map((r) => (
                  <article key={r.id} className="content-card">
                    <div className="role-icon">
                      <Users size={22} />
                    </div>
                    <h2>{r.name}</h2>
                    <p>{r.description}</p>
                    <h3>Цели</h3>
                    <ul>
                      {r.goals.map((g) => (
                        <li key={g}>{g}</li>
                      ))}
                    </ul>
                  </article>
                ))}
                {!p.roles.length && (
                  <div className="empty">
                    Роли не определены. AI-анализ может выделить их из транскрипции.
                  </div>
                )}
              </>
            )}
            {tab === 'scenarios' && (
              <>
                <div className="list-heading">
                  <h2>Пользовательские сценарии</h2>
                </div>
                {p.scenarios.map((s, i) => (
                  <article key={s.id} className="content-card">
                    <span className="eyebrow">СЦЕНАРИЙ 0{i + 1}</span>
                    <h2>{s.title}</h2>
                    <p className="muted">{p.roles.find((r) => r.id === s.roleId)?.name}</p>
                    <ol className="scenario-steps">
                      {s.steps.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                    <div className="scenario-links">
                      {s.relatedRequirementIds.map((id) => (
                        <button
                          key={id}
                          onClick={() => {
                            setTab('requirements');
                            select(id);
                          }}
                        >
                          {id}
                        </button>
                      ))}
                    </div>
                  </article>
                ))}
                {!p.scenarios.length && (
                  <div className="empty">
                    <strong>
                      {p.mode === 'ai'
                        ? 'Модель не сформировала сценарии'
                        : 'Сценарии пока не выделены'}
                    </strong>
                    <p>
                      Для сценария нужны роль, цель и последовательность действий. Уточните эти шаги
                      в транскрипции и повторите анализ. Уже полученные требования и роли доступны в
                      соседних разделах.
                    </p>
                  </div>
                )}
              </>
            )}
            {tab === 'conflicts' && (
              <>
                <div className="list-heading">
                  <div>
                    <h2>Противоречия</h2>
                    <p className="muted">Решение принимает человек, обе реплики сохраняются</p>
                  </div>
                </div>
                {p.conflicts.map((c) => (
                  <ConflictCard
                    key={c.id + c.status}
                    conflict={c}
                    project={p}
                    onSource={jump}
                    onSave={(updated) =>
                      apply({
                        type: 'patch',
                        patch: { conflicts: p.conflicts.map((x) => (x.id === c.id ? updated : x)) },
                      })
                    }
                  />
                ))}
                {!p.conflicts.length && (
                  <div className="empty">
                    Противоречия не выделены. Это не гарантирует их отсутствия.
                  </div>
                )}
              </>
            )}
          </div>
        </main>
        <div className="inspector-pane">
          {item ? (
            <Inspector
              key={item.id + JSON.stringify(item)}
              item={item}
              project={p}
              onSave={(r) => apply({ type: 'upsert', item: r })}
              onDelete={() => setModal('delete')}
              onSource={jump}
            />
          ) : (
            <aside className="inspector">
              <div className="pane-heading">След требования</div>
              <div className="empty">
                <Link2 />
                <p>Выберите требование</p>
                <span>Здесь появятся его детали, критерии и источники.</span>
              </div>
            </aside>
          )}
        </div>
      </div>
      <nav className="mobile-nav" aria-label="Рабочие зоны">
        <button
          className={pane === 'transcript' ? 'active' : ''}
          onClick={() => setPane('transcript')}
        >
          <AudioLines size={19} />
          Транскрипция
        </button>
        <button
          className={pane === 'requirements' ? 'active' : ''}
          onClick={() => setPane('requirements')}
        >
          <FileText size={19} />
          Требования
        </button>
        <button
          className={pane === 'inspector' ? 'active' : ''}
          onClick={() => setPane('inspector')}
        >
          <Link2 size={19} />
          Инспектор
        </button>
      </nav>
      {(notice || undo) && (
        <div className="toast" role="status">
          <Check size={17} />
          <span>{undo ? 'Элемент удалён' : notice}</span>
          {undo && (
            <button
              onClick={() => {
                apply({ type: 'restore', snapshot: undo });
                setUndo(null);
              }}
            >
              <RotateCcw size={14} />
              Восстановить
            </button>
          )}
          <button
            className="icon-button"
            aria-label="Скрыть уведомление"
            onClick={() => {
              setNotice('');
              setUndo(null);
            }}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {modal === 'import' && (
        <ImportDialog
          project={p}
          onClose={() => setModal(null)}
          onMedia={media}
          onImport={(patch) => {
            const saved = apply({ type: 'patch', patch });
            if (saved) setSelected(patch.requirements?.[0]?.id || '');
            return saved;
          }}
        />
      )}
      {modal === 'delete' && item && (
        <Dialog title="Удалить элемент?" onClose={() => setModal(null)}>
          <p>
            «{item.title}» будет удалён. Исходные реплики сохранятся. Удаление можно отменить до
            следующего изменения.
          </p>
          <div className="action-row">
            <button
              className="danger"
              onClick={() => {
                const snapshot = p;
                if (!apply({ type: 'delete', id: item.id })) return;
                setUndo(snapshot);
                setSelected('');
                setModal(null);
              }}
            >
              Удалить
            </button>
            <button onClick={() => setModal(null)}>Отмена</button>
          </div>
        </Dialog>
      )}
      {modal === 'quality' && (
        <Dialog title="Quality Gate ТЗ" onClose={() => setModal(null)}>
          <div className="quality-score">
            {q.score}
            <span>/ 100</span>
          </div>
          <p>Комплектность документа, а не оценка его истинности или точности AI.</p>
          <div className="quality-metrics">
            <span>
              Требований с источниками<strong>{q.coverage}%</strong>
            </span>
            <span>
              Открытых вопросов<strong>{q.questions}</strong>
            </span>
            <span>
              Нерешённых противоречий<strong>{q.conflicts}</strong>
            </span>
            <span>
              С низкой уверенностью<strong>{q.low}</strong>
            </span>
            <span>
              Без критериев приёмки<strong>{q.missingCriteria}</strong>
            </span>
          </div>
          <h3>Прозрачная формула</h3>
          <p className="muted">
            30% — доля требований с источниками; 25% — с критериями; 20% — доля элементов без
            уточнений; 15% — отсутствие открытых конфликтов; 10% — наличие роли и сценария.
            Отклонённые элементы исключены, вопросы не входят в доли источников и критериев. Пустой
            документ — 0. Округление до целого, диапазон 0–100.
          </p>
        </Dialog>
      )}
      {modal === 'export' && (
        <Dialog title="Экспорт технического задания" onClose={() => setModal(null)}>
          <p>
            Роли, сценарии, требования, критерии и матрица трассировки. Документ содержит пометку о
            необходимости утверждения человеком.
          </p>
          <div className="export-options">
            <button disabled={!!busy} onClick={() => void exportFile('md')}>
              <FileText />
              Markdown <small>Для команды и базы знаний</small>
            </button>
            <button disabled={!!busy} onClick={() => void exportFile('json')}>
              <GitBranch />
              JSON <small>Полная структура проекта</small>
            </button>
            <button disabled={!!busy} onClick={() => void exportFile('docx')}>
              <FileText />
              DOCX <small>Редактируемый документ Word</small>
            </button>
            <button disabled={!!busy} onClick={printDocument}>
              <Download />
              Печать / сохранить как PDF <small>Все разделы документа</small>
            </button>
          </div>
          <p className="muted">
            В окне печати выберите «Сохранить как PDF» или «Microsoft Print to PDF». Если встроенный
            браузер не открывает печать, откройте этот же адрес в Edge или Chrome, импортируйте
            материалы и используйте Ctrl+P. Локальные проекты хранятся отдельно в каждом браузере.
          </p>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
        </Dialog>
      )}
      {modal === 'ai' && (
        <Dialog
          title="Обработать через AI"
          onClose={() => {
            abort.current?.abort();
            setModal(null);
          }}
        >
          <p>
            Транскрипция, а при распознавании — запись, будут отправлены серверу приложения и Yandex
            SpeechKit / Yandex AI Studio. Результат остаётся черновиком. Ключ находится только на
            сервере.
          </p>
          <p className="muted">
            Текущие извлечённые элементы заменятся результатом анализа. Для сохранения предыдущих
            правок сначала экспортируйте проект.
          </p>
          <p className="notice">{AUDIO_UPLOAD_HINT}</p>
          <p className="muted">
            Поддерживаемый формат: WAV PCM 16-bit mono или OggOpus mono. Ограничение относится к
            текущему MVP. Для встреч на 30–90 минут в roadmap — Object Storage, очередь задач,
            фоновый worker, статусы и уведомления.
          </p>
          <p className="muted">
            SpeechKit v1 возвращает текст без таймкодов слов и разделения говорящих. Время такого
            источника отмечается как приблизительное. Точные таймкоды сохраняются для SRT/VTT и
            учебного демо.
          </p>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            Разрешаю отправить материалы встречи для этой обработки
          </label>
          {stage && (
            <div className="processing" role="status">
              {stage === 'Нужна асинхронная обработка' && <span>{stage}</span>}
              {['Загрузка', 'Транскрибация', 'Анализ', 'Готово'].map((step) => (
                <span className={stage === step ? 'active' : ''} key={step}>
                  {step}
                </span>
              ))}
            </div>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <div className="action-row">
            <button
              className="primary"
              disabled={!consent || !!busy || external}
              onClick={() => void ai()}
            >
              {busy ? 'Обработка…' : stage === 'Ошибка' ? 'Повторить' : 'Начать обработку'}
            </button>
            {busy && <button onClick={() => abort.current?.abort()}>Отменить</button>}
          </div>
        </Dialog>
      )}
      <article className="print-document">
        <pre>{exportMarkdown(p)}</pre>
      </article>
    </div>
  );
}
function ConflictCard({
  conflict: c,
  project,
  onSource,
  onSave,
}: {
  conflict: Project['conflicts'][number];
  project: Project;
  onSource: (id: string) => void;
  onSave: (c: Project['conflicts'][number]) => void;
}) {
  const [resolution, setResolution] = useState(c.resolution || '');
  const [error, setError] = useState('');
  const save = (status: typeof c.status) => {
    if (status !== 'open' && !resolution.trim()) {
      setError('Запишите основание решения.');
      return;
    }
    onSave({ ...c, status, resolution });
  };
  return (
    <article className="content-card conflict-card">
      <span className="badge constraint">
        {c.status === 'open'
          ? 'Требует решения'
          : c.status === 'resolved'
            ? 'Решено'
            : 'Игнорируется'}
      </span>
      <h2>{c.title}</h2>
      <p>{c.description}</p>
      <div className="conflict-sources">
        {c.sourceSegmentIds.map((id) => {
          const s = project.segments.find((s) => s.id === id)!;
          return (
            <button key={id} onClick={() => onSource(id)}>
              <span>
                {s.speakerName} · {time(s.startMs)}
              </span>
              <blockquote>«{s.text}»</blockquote>
            </button>
          );
        })}
      </div>
      <label>
        Решение и основание
        <textarea
          rows={3}
          value={resolution}
          onChange={(e) => setResolution(e.target.value)}
          placeholder="Что согласовали с заказчиком?"
        />
      </label>
      <p className="muted">
        После решения отдельно исправьте или отклоните несовместимые требования.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="action-row">
        <button className="primary" onClick={() => save('resolved')}>
          <Check size={16} />
          Решено
        </button>
        <button onClick={() => save('open')}>Уточнить</button>
        <button onClick={() => save('ignored')}>Игнорировать</button>
      </div>
    </article>
  );
}
