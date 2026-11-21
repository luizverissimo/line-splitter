import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useEngineStatus } from '../api/queries';

/** Chave da entrada atual do histórico do navegador (gravada pelo React Router no HashRouter). */
function historyKey(): string | undefined {
  const state: unknown = window.history.state;
  if (state && typeof state === 'object' && 'key' in state && typeof state.key === 'string') return state.key;
  return undefined;
}

/** Na abertura do app: se o motor não estiver pronto, leva à tela Motor; se estiver, fica no Início. */
export function StartupRedirect() {
  const status = useEngineStatus();
  const navigate = useNavigate();
  const location = useLocation();
  const decided = useRef(false);
  // Entrada de histórico da abertura: se o usuário já navegou (mesmo de volta ao Início), não redirecionamos.
  const initialKey = useRef(location.key);
  // O React Router aplica a navegação numa transição: a chave do `location` pode chegar depois da
  // resposta do motor. A entrada do histórico do navegador muda na hora, então ela também é conferida.
  const initialHistoryKey = useRef(historyKey());

  useEffect(() => {
    // Decide só pela primeira resposta (sucesso ou erro): depois disso o app nunca redireciona sozinho.
    if (decided.current || status.isPending) return;
    decided.current = true;
    const untouched =
      location.key === initialKey.current &&
      historyKey() === initialHistoryKey.current &&
      location.pathname === '/';
    if (status.isSuccess && !status.data.ready && untouched) {
      void navigate('/motor', { replace: true });
    }
  }, [status.isPending, status.isSuccess, status.data, location.key, location.pathname, navigate]);

  return null;
}
