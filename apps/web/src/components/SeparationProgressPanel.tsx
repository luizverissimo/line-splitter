import { AppError, PHASE_LABELS, formatDuration, instrumentOf } from '@line-splitter/shared';
import { Copy, Square } from 'lucide-react';
import { useEffect, useState } from 'react';
import { errorDetails, errorMessage } from '../api/errors';
import { useSeparation } from '../state/SeparationContext';
import { Button, ErrorAlert, ProgressBar } from './ui';

/** Separação em andamento: progresso real, tempo decorrido, cancelar e erro com log técnico. */
export function SeparationProgressPanel({ onBack }: { onBack: () => void }) {
  const sep = useSeparation();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!sep.running) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [sep.running]);

  const elapsed = sep.startedAt ? Math.max(0, (now - sep.startedAt) / 1000) : 0;
  const cancelled = sep.error instanceof AppError && sep.error.code === 'CANCELLED';
  const label = sep.stem ? instrumentOf(sep.stem).label : '';

  if (sep.running) {
    return (
      <div className="separation-panel" aria-live="polite">
        <h2>Separando: {label}</h2>
        <ProgressBar
          value={sep.progress?.percent ?? null}
          label={sep.progress ? PHASE_LABELS[sep.progress.phase] : PHASE_LABELS.preparing}
        />
        <p className="elapsed">
          Tempo decorrido: <span>{formatDuration(elapsed)}</span>
        </p>
        <div className="actions">
          <Button
            variant="danger"
            icon={<Square size={16} aria-hidden="true" />}
            onClick={sep.cancel}
            loading={sep.cancelling}
          >
            Cancelar
          </Button>
        </div>
      </div>
    );
  }

  if (cancelled) {
    return (
      <div className="separation-panel">
        <p className="engine-warning" role="status">
          {errorMessage(sep.error)}
        </p>
        <Button onClick={onBack}>Escolher instrumento</Button>
      </div>
    );
  }

  if (sep.error) {
    const details = errorDetails(sep.error);
    return (
      <div className="separation-panel">
        <ErrorAlert
          title="A separação falhou"
          message={errorMessage(sep.error)}
          details={details}
          detailsLabel="Ver log técnico"
          actions={
            <>
              {details && (
                <Button
                  icon={<Copy size={16} aria-hidden="true" />}
                  onClick={() => void navigator.clipboard.writeText(details)}
                >
                  Copiar log
                </Button>
              )}
              <Button onClick={onBack}>Tentar de novo</Button>
            </>
          }
        />
      </div>
    );
  }
  return null;
}
