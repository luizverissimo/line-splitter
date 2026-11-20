import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router';
import { App, AppRoutes } from './App';
import { createQueryClient } from './api/queryClient';
import './styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('Elemento #root ausente em index.html');

// Hash router: as rotas funcionam também com o build carregado do disco pelo Electron.
createRoot(container).render(
  <StrictMode>
    <App queryClient={createQueryClient()}>
      <HashRouter>
        <AppRoutes />
      </HashRouter>
    </App>
  </StrictMode>,
);
