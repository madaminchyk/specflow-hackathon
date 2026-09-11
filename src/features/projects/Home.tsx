import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  AudioLines,
  FileText,
  Plus,
  ShieldCheck,
  Upload,
  Trash2,
} from 'lucide-react';
import { Brand, repository } from '../../app/App';
import { createDemo } from '../../data/demo';
import { blankProject, type Project } from '../../domain/model';
import { STORAGE_KEY } from '../../services/persistence';
import { download } from '../../services/export';
import { parseTranscript, analyzeLocal } from '../../services/analysis';
import { validateFile, sessionMedia, AUDIO_UPLOAD_HINT } from '../../services/files';
import { Dialog } from '../../components/Dialog';
export function Home() {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  let projects: Project[] = [];
  let corrupt = '';
  try {
    projects = repository.list();
  } catch (e) {
    corrupt = (e as Error).message;
  }
  const open = (p: Project, file?: File) => {
    try {
      repository.save(p);
      if (file) sessionMedia.set(p.id, file);
      navigate('/project/' + p.id);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const importFile = async (file?: File) => {
    if (!file || busy) return;
    setBusy(true);
    setError('');
    try {
      const kind = validateFile(file);
      const p = blankProject(file.name.replace(/\.[^.]+$/, ''));
      if (kind === 'text') {
        p.segments = parseTranscript(await file.text());
        Object.assign(p, analyzeLocal(p.segments));
        p.processingStatus = 'ready';
        open(p);
      } else {
        p.media = { name: file.name, size: file.size, type: file.type };
        p.processingStatus = 'uploaded';
        open(p, file);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <header className="site-header">
        <Brand />
        <span className="muted">Из разговора в ТЗ</span>
      </header>
      <main className="home" data-revision={refresh}>
        <section className="hero">
          <div className="eyebrow">ВСТРЕЧА ЗАКОНЧИЛАСЬ. ЯСНОСТЬ ОСТАЛАСЬ.</div>
          <h1>
            Из записи встречи —<br />в <span>проверяемое ТЗ</span>
          </h1>
          <p>
            Соберите требования, проверьте их по репликам участников
            <br className="desktop-only" /> и передайте команде документ с понятными критериями.
          </p>
          <div className="hero-actions">
            <button className="primary" onClick={() => open(createDemo())}>
              Открыть демо за 30 секунд <ArrowUpRight size={19} />
            </button>
            <button onClick={() => open(blankProject())}>
              <Plus size={18} />
              Новый проект
            </button>
          </div>
          <p className="privacy">
            <ShieldCheck size={16} />
            Без регистрации. Демо работает локально и без API-ключа.
          </p>
        </section>
        <section className="flow-preview">
          <div>
            <span className="step-number">01</span>
            <AudioLines />
            <h3>Разговор</h3>
            <p>Запись или готовая транскрипция</p>
          </div>
          <div>
            <span className="step-number">02</span>
            <FileText />
            <h3>Требование + источник</h3>
            <p>Точный фрагмент, контекст и критерии</p>
          </div>
          <div>
            <span className="step-number">03</span>
            <ShieldCheck />
            <h3>Проверенное решение</h3>
            <p>Ваши правки и документ для команды</p>
          </div>
        </section>
        {(error || corrupt) && (
          <p role="alert" className="error">
            {error || corrupt}
          </p>
        )}
        {corrupt && (
          <section className="recovery">
            <h2>Восстановление локальных данных</h2>
            <p>
              Сначала скачайте исходные данные. Очистка удаляет только проекты SpecFlow в этом
              браузере.
            </p>
            <div className="action-row">
              <button
                onClick={() =>
                  download(localStorage.getItem(STORAGE_KEY) || '', 'specflow-recovery.txt')
                }
              >
                Скачать резервную копию
              </button>
              <button className="danger" onClick={() => setDeleting('storage')}>
                Очистить хранилище
              </button>
            </div>
          </section>
        )}
        <section className="recent">
          <div className="section-heading">
            <h2>
              Ваши проекты <span>{projects.length}</span>
            </h2>
            <span className="muted">На этом устройстве</span>
          </div>
          {projects.length ? (
            <div className="project-grid">
              {projects.map((p) => (
                <div className="project-card-wrapper" key={p.id}>
                  <Link className="project-card" to={'/project/' + p.id}>
                    <FileText />
                    <h3>{p.title}</h3>
                    <p>
                      {p.requirements.length} элементов ·{' '}
                      {p.mode === 'demo' ? 'Демонстрация' : 'Локальный проект'}
                    </p>
                    <span className="muted">
                      {new Date(p.updatedAt).toLocaleDateString('ru-RU')}
                    </span>
                    <ArrowUpRight className="project-arrow" />
                  </Link>
                  <button className="text-button project-delete" onClick={() => setDeleting(p.id)}>
                    <Trash2 size={14} />
                    Удалить проект
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">
              <FileText />
              <p>Здесь появятся ваши встречи</p>
              <span>Откройте демо или создайте первый проект.</span>
            </div>
          )}
        </section>
        <section
          className="dropzone home-dropzone"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void importFile(e.dataTransfer.files[0]);
          }}
        >
          <Upload />
          <h3>Начните с материалов своей встречи</h3>
          <p>{AUDIO_UPLOAD_HINT}</p>
          <p className="muted">Готовая транскрипция: TXT, MD, SRT, VTT до 512 КБ.</p>
          <button disabled={busy} onClick={() => input.current?.click()}>
            {busy ? 'Чтение…' : 'Выбрать файл встречи'}
          </button>
          <input
            hidden
            ref={input}
            type="file"
            aria-label="Импорт встречи"
            accept=".mp3,.wav,.m4a,.mp4,.webm,.ogg,.mov,.txt,.md,.srt,.vtt"
            onChange={(e) => void importFile(e.target.files?.[0])}
          />
          <p className="muted">
            В локальном режиме материалы остаются в браузере. Для AI-обработки потребуется отдельное
            согласие на отправку.
          </p>
        </section>
      </main>
      <footer>
        SpecFlow <span>Каждое требование можно проверить.</span>
      </footer>
      {deleting && (
        <Dialog
          title={deleting === 'storage' ? 'Очистить локальные проекты?' : 'Удалить проект?'}
          onClose={() => setDeleting(null)}
        >
          <p>
            Это действие удалит локальные данные. Скачайте экспорт перед удалением, если он нужен.
          </p>
          <div className="action-row">
            <button
              className="danger"
              onClick={() => {
                try {
                  if (deleting === 'storage') localStorage.removeItem(STORAGE_KEY);
                  else repository.remove(deleting);
                  setDeleting(null);
                  setError('');
                  setRefresh(refresh + 1);
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Удалить
            </button>
            <button onClick={() => setDeleting(null)}>Отмена</button>
          </div>
        </Dialog>
      )}
    </>
  );
}
