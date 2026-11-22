import { AppError } from '@line-splitter/shared';
import { Download, Square } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { errorDetails, errorMessage } from '../api/errors';
import { useEngineInstall } from '../state/EngineInstallContext';
import { Button, ErrorAlert, ProgressBar } from './ui';

interface Props {
  /** Python do sistema disponível (sem ele não há como criar o ambiente). */
  pythonOk: boolean;
  /** Separador (audio-separator + PyTorch) já instalado e funcionando. */
  installed: boolean;
}

/** Instalação do motor com etapas, log ao vivo e cancelamento. */
export function EngineInstallPanel({ pythonOk, installed }: Props) {
  const install = useEngineInstall();
  const logRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [install.log]);

  const cancelled = install.error instanceof AppError && install.error.code === 'CANCELLED';
  const progress = install.step ? ((install.step.step - 1) / install.step.total) * 100 : null;

  return (
    <div className="install-panel">
      <h2>Instalação do motor</h2>
      {!install.running && !installed && (
        <p className="page-intro">
          Cria um ambiente Python só do Line Splitter e instala o PyTorch e o separador (audio-separator). São
          alguns GB e exige internet uma vez.
        </p>
      )}
      {install.running && (
        <ProgressBar
          value={progress}
          label={
            install.step
              ? `Etapa ${install.step.step} de ${install.step.total}: ${install.step.label}`
              : 'Preparando…'
          }
        />
      )}
      {(install.running || install.log.length > 0) && (
        <pre ref={logRef} className="install-log" aria-label="Log da instalação" tabIndex={0}>
          {install.log.join('\n')}
        </pre>
      )}
      {install.result && !install.running && (
        <p className="save-ok" role="status">
          Motor instalado: audio-separator {install.result.separator}, PyTorch {install.result.torch}
          {install.result.cuda ? ' com GPU (CUDA).' : ' (CPU).'}
        </p>
      )}
      {cancelled && !install.running && (
        <p className="engine-warning" role="status">
          {errorMessage(install.error)}
        </p>
      )}
      {Boolean(install.error) && !cancelled && !install.running && (
        <ErrorAlert
          title="A instalação do motor falhou"
          message={errorMessage(install.error)}
          details={errorDetails(install.error)}
          detailsLabel="Log técnico"
        />
      )}
      <div className="actions">
        {install.running ? (
          <Button
            variant="danger"
            icon={<Square size={16} aria-hidden="true" />}
            onClick={install.cancel}
            loading={install.cancelling}
          >
            Cancelar instalação
          </Button>
        ) : (
          !installed && (
            <Button
              variant="primary"
              icon={<Download size={16} aria-hidden="true" />}
              onClick={() => install.start(false)}
              disabled={!pythonOk}
            >
              Instalar motor
            </Button>
          )
        )}
        {!pythonOk && !install.running && !installed && (
          <span className="field-hint">Instale o Python primeiro (instruções acima).</span>
        )}
      </div>
    </div>
  );
}
