import { ProjectSchema, type Project } from '../domain/model';
export interface ProjectRepository {
  list(): Project[];
  save(p: Project): void;
  remove(id: string): void;
}
export const STORAGE_KEY = 'specflow.projects.v1';
export class LocalRepository implements ProjectRepository {
  constructor(private storage: Storage = localStorage) {}
  list() {
    const raw = this.storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    try {
      const envelope = JSON.parse(raw);
      if (envelope.version !== 1 || !Array.isArray(envelope.projects)) throw Error();
      return envelope.projects.map((p: unknown) => ProjectSchema.parse(p)) as Project[];
    } catch {
      throw new Error(
        'Локальные данные повреждены или имеют неподдерживаемую версию. Скачайте резервную копию и очистите хранилище в настройках проектов.',
      );
    }
  }
  save(p: Project) {
    ProjectSchema.parse(p);
    const all = this.list().filter((x) => x.id !== p.id);
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, projects: [p, ...all] }));
    } catch {
      throw new Error(
        'Не удалось сохранить: хранилище браузера заполнено. Экспортируйте проект и освободите место.',
      );
    }
  }
  remove(id: string) {
    const projects = this.list().filter((x) => x.id !== id);
    this.storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, projects }));
  }
}
