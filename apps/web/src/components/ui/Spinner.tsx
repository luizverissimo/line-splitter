interface Props {
  size?: number;
  /** Texto para leitores de tela; null quando o contexto já anuncia o carregamento. */
  label?: string | null;
}

export function Spinner({ size = 20, label = 'Carregando…' }: Props) {
  return (
    <span className="spinner-wrap" role={label ? 'status' : undefined}>
      <span className="spinner" style={{ width: size, height: size }} aria-hidden="true" />
      {label && <span className="sr-only">{label}</span>}
    </span>
  );
}

/** Bloco de carregamento centralizado com mensagem visível. */
export function LoadingState({ message }: { message: string }) {
  return (
    <div className="loading-state" role="status">
      <Spinner label={null} />
      <span>{message}</span>
    </div>
  );
}
