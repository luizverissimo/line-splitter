import { AudioLines, History, Home, Settings, Cpu } from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { useAppInfo } from '../api/queries';
import { ErrorBoundary } from './ErrorBoundary';
import { QueryError } from './QueryError';
import { StartupRedirect } from './StartupRedirect';

const links = [
  { to: '/', label: 'Início', icon: Home, end: true },
  { to: '/motor', label: 'Motor', icon: Cpu, end: false },
  { to: '/historico', label: 'Histórico', icon: History, end: false },
  { to: '/configuracoes', label: 'Configurações', icon: Settings, end: false },
];

function AppFooter() {
  const info = useAppInfo();
  if (info.isPending) return <footer className="app-footer">Carregando informações do aplicativo…</footer>;
  if (info.isError)
    return (
      <footer className="app-footer app-footer-error">
        <QueryError compact error={info.error} onRetry={() => void info.refetch()} />
      </footer>
    );
  const platform = { linux: 'Linux', win32: 'Windows', darwin: 'macOS' }[info.data.platform];
  return (
    <footer className="app-footer">
      {info.data.name} {info.data.version} · {platform} · Electron {info.data.electron}
    </footer>
  );
}

export function Layout() {
  const location = useLocation();
  return (
    <div className="app-shell">
      <StartupRedirect />
      <nav className="sidebar" aria-label="Navegação principal">
        <div className="brand">
          <AudioLines aria-hidden="true" />
          <span>Line Splitter</span>
        </div>
        <ul>
          {links.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
              >
                <Icon aria-hidden="true" size={18} />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="content">
        <main className="page">
          {/* Erro numa página não derruba a navegação; trocar de rota descarta o erro. */}
          <ErrorBoundary resetKey={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
        <AppFooter />
      </div>
    </div>
  );
}
