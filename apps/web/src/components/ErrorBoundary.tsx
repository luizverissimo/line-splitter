import { Component, type ErrorInfo, type ReactNode } from 'react';
import { errorDetails, errorMessage } from '../api/errors';

interface Props {
  children: ReactNode;
  /** Quando muda (ex.: a rota atual), o erro é descartado e a tela renderiza de novo. */
  resetKey?: string;
  /** Título do aviso; o boundary de página e o global usam textos diferentes. */
  title?: string;
}
interface State {
  error: unknown;
  hasError: boolean;
  errorKey: string | undefined;
}

/** Captura erros de renderização e oferece recuperação sem fechar o app. */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null, hasError: false, errorKey: undefined };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error, hasError: true };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (!state.hasError) return { errorKey: props.resetKey };
    if (state.errorKey !== props.resetKey) return { error: null, hasError: false, errorKey: props.resetKey };
    return null;
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('Erro de renderização capturado', error, info.componentStack);
  }

  private readonly reset = () => this.setState({ error: null, hasError: false });

  /** Leva à tela inicial (o roteador usa hash) e descarta o erro. */
  private readonly goHome = () => {
    window.location.hash = '#/';
    this.reset();
  };

  override render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    const details = errorDetails(this.state.error);
    return (
      <div role="alert" className="fatal-error">
        <h1>{this.props.title ?? 'Algo deu errado nesta tela'}</h1>
        <p>{errorMessage(this.state.error)}</p>
        {details && (
          <details>
            <summary>Detalhes técnicos</summary>
            <pre>{details}</pre>
          </details>
        )}
        <div className="actions">
          <button type="button" className="btn btn-primary" onClick={this.reset}>
            Tentar de novo
          </button>
          <button type="button" className="btn" onClick={this.goHome}>
            Voltar ao início
          </button>
        </div>
      </div>
    );
  }
}
