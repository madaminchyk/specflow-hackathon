import { useRef, useState } from 'react';
import { Upload, FileText } from 'lucide-react';
import { Dialog } from '../../components/Dialog';
import { validateFile, AUDIO_UPLOAD_HINT } from '../../services/files';
import { parseTranscript, analyzeLocal } from '../../services/analysis';
import type { Project } from '../../domain/model';
export const NO_AI_MESSAGE =
  'Запись прикреплена. Для распознавания нажмите «AI-обработка». Поддерживаются WAV PCM mono или OggOpus mono до 30 секунд и 1 МБ';
export function ImportDialog({
  project,
  onClose,
  onImport,
  onMedia,
}: {
  project: Project;
  onClose: () => void;
  onImport: (patch: Partial<Project>) => boolean | void;
  onMedia: (file: File) => void;
}) {
  const [raw, setRaw] = useState('');
  const [title, setTitle] = useState(project.title);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const file = async (f?: File) => {
    if (!f || busy) return;
    setError('');
    try {
      if (validateFile(f) === 'text') {
        setBusy(true);
        setRaw(await f.text());
      } else {
        onMedia(f);
        setError(NO_AI_MESSAGE);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const analyze = () => {
    setError('');
    try {
      const segments = parseTranscript(raw);
      const analysis = analyzeLocal(segments);
      const saved = onImport({
        ...analysis,
        segments,
        title: title.trim() || project.title,
        mode: 'local',
        processingStatus: 'ready',
        summary: 'Черновик по явным речевым маркерам. Требуется проверка человеком.',
      });
      if (saved === false)
        throw new Error(
          'Не удалось сохранить проект. Освободите место в хранилище или обновите изменённый проект.',
        );
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Dialog title="Добавить материалы встречи" onClose={onClose}>
      <label>
        Название проекта
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
      </label>
      <div
        className="dropzone"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void file(e.dataTransfer.files[0]);
        }}
      >
        <Upload />
        <h3>Перетащите запись или транскрипцию</h3>
        <p>{AUDIO_UPLOAD_HINT}</p>
        <p className="muted">Готовая транскрипция: TXT, MD, SRT, VTT до 512 КБ.</p>
        <button disabled={busy} onClick={() => input.current?.click()}>
          Выбрать файл
        </button>
        <input
          ref={input}
          type="file"
          aria-label="Файл встречи"
          hidden
          accept=".mp3,.wav,.m4a,.mp4,.webm,.ogg,.mov,.txt,.md,.srt,.vtt"
          onChange={(e) => void file(e.target.files?.[0])}
        />
      </div>
      {project.media && (
        <p className="notice">
          Прикреплено: {project.media.name}. {NO_AI_MESSAGE}.
        </p>
      )}
      <label>
        Или вставьте транскрипцию
        <textarea
          rows={6}
          placeholder={'Заказчик: Нужно бронировать комнаты.\nАналитик: Кто сможет отменять бронь?'}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
        />
      </label>
      <p className="muted">
        Локальный разбор по речевым маркерам. Таймкоды обычного текста будут приблизительными.
        Записи и текст не отправляются в сеть.
      </p>
      {project.requirements.length > 0 && (
        <p className="notice">
          Новый текст заменит текущую транскрипцию и извлечённые элементы. При необходимости сначала
          экспортируйте проект.
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="action-row">
        <button className="primary" disabled={busy || !raw.trim()} onClick={analyze}>
          <FileText size={17} />
          {busy ? 'Чтение файла…' : 'Разобрать текст'}
        </button>
        <button onClick={onClose}>Готово</button>
      </div>
    </Dialog>
  );
}
