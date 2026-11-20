import type { ReactNode } from 'react';

interface Props {
  title: string;
  message: string;
  details?: string | undefined;
  detailsLabel?: string;
  actions?: ReactNode;
}

/** Aviso de erro com mensagem legível e detalhes técnicos expansíveis. */
export function ErrorAlert({ title, message, details, detailsLabel = 'Detalhes técnicos', actions }: Props) {
  return (
    <div role="alert" className="query-error">
      <strong>{title}</strong>
      <p>{message}</p>
      {details && (
        <details>
          <summary>{detailsLabel}</summary>
          <pre>{details}</pre>
        </details>
      )}
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}
