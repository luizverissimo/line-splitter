import { errorDetails, errorMessage } from '../api/errors';

interface Props {
  error: unknown;
  onRetry: () => void;
  title?: string;
  /** Versão de uma linha, para rodapés e espaços pequenos. */
  compact?: boolean;
}

/** Erro de carregamento de dados com ação de nova tentativa. */
export function QueryError({ error, onRetry, title = 'Não foi possível carregar', compact = false }: Props) {
  if (compact) {
    return (
      <span role="alert" className="query-error-compact">
        {errorMessage(error)}{' '}
        <button type="button" className="link-button" onClick={onRetry}>
          Tentar de novo
        </button>
      </span>
    );
  }
  const details = errorDetails(error);
  return (
    <div role="alert" className="query-error">
      <strong>{title}</strong>
      <p>{errorMessage(error)}</p>
      {details && (
        <details>
          <summary>Detalhes técnicos</summary>
          <pre>{details}</pre>
        </details>
      )}
      <button type="button" className="btn" onClick={onRetry}>
        Tentar de novo
      </button>
    </div>
  );
}
