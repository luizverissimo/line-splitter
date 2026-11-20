import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useEngineStatus } from '../api/queries';

/** Na abertura do app: se o motor não estiver pronto, leva à tela Motor; se estiver, fica no Início. */
export function StartupRedirect() {
  const status = useEngineStatus();
  const navigate = useNavigate();
  const location = useLocation();
  const decided = useRef(false);
  // Entrada de histórico da abertura: se o usuário já navegou (mesmo de volta ao Início), não redirecionamos.
  const initialKey = useRef(location.key);

  useEffect(() => {
    // Decide só pela primeira resposta (sucesso ou erro): depois disso o app nunca redireciona sozinho.
    if (decided.current || status.isPending) return;
    decided.current = true;
    const untouched = location.key === initialKey.current && location.pathname === '/';
    if (status.isSuccess && !status.data.ready && untouched) {
      void navigate('/motor', { replace: true });
    }
  }, [status.isPending, status.isSuccess, status.data, location.key, location.pathname, navigate]);

  return null;
}
