import { Link, Route, Routes } from 'react-router-dom';
import { AudioLines } from 'lucide-react';
import { LocalRepository } from '../services/persistence';
import { Workspace } from '../features/projects/Workspace';
import { Home } from '../features/projects/Home';
export const repository = new LocalRepository();
export function Brand() {
  return (
    <Link to="/" className="brand">
      <span className="brand-icon">
        <AudioLines size={23} />
      </span>
      SpecFlow<span className="brand-label">РАБОЧЕЕ ПРОСТРАНСТВО</span>
    </Link>
  );
}
export function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/project/:id" element={<Workspace />} />
      <Route
        path="*"
        element={
          <main>
            <Brand />
            <h1>Страница не найдена</h1>
            <Link to="/">К проектам</Link>
          </main>
        }
      />
    </Routes>
  );
}
