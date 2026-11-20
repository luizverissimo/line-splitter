import { AppError, formatBytes } from '@line-splitter/shared';
import { Download, RefreshCw, Square } from 'lucide-react';
import { errorDetails, errorMessage } from '../api/errors';
import { useModelDownload } from '../state/ModelDownloadContext';
import { Button, ErrorAlert, ProgressBar } from './ui';

/** Download dos pesos do htdemucs_6s com progresso real, cancelamento e nova tentativa. */
export function ModelDownloadPanel({ downloaded }: { downloaded: boolean }) {
  const dl = useModelDownload();
  if (downloaded && !dl.running && !dl.result) return null;

  const cancelled = dl.error instanceof AppError && dl.error.code === 'CANCELLED';
  const failed = Boolean(dl.error) && !cancelled;
  const percent = dl.progress ? (dl.progress.receivedBytes / dl.progress.totalBytes) * 100 : null;

  return (
    <div className="install-panel">
      <h2>Modelo de separação</h2>
      {!dl.running && !dl.result && (
        <p className="page-intro">
          Baixa os pesos do modelo htdemucs_6s (cerca de 52 MB). Depois disso o app funciona sem internet.
        </p>
      )}
      {dl.running && (
        <ProgressBar
          value={percent}
          label={
            dl.progress
              ? `Baixando o modelo: ${formatBytes(dl.progress.receivedBytes)} de ${formatBytes(dl.progress.totalBytes)}`
              : 'Conectando…'
          }
        />
      )}
      {dl.result && !dl.running && (
        <p className="save-ok" role="status">
          Modelo baixado e conferido ({formatBytes(dl.result.sizeBytes)}).
        </p>
      )}
      {cancelled && !dl.running && (
        <p className="engine-warning" role="status">
          {errorMessage(dl.error)}
        </p>
      )}
      {failed && !dl.running && (
        <ErrorAlert
          title="O download do modelo falhou"
          message={errorMessage(dl.error)}
          details={errorDetails(dl.error)}
        />
      )}
      <div className="actions">
        {dl.running ? (
          <Button
            variant="danger"
            icon={<Square size={16} aria-hidden="true" />}
            onClick={dl.cancel}
            loading={dl.cancelling}
          >
            Cancelar download
          </Button>
        ) : (
          !downloaded && (
            <Button
              variant="primary"
              icon={
                failed ? (
                  <RefreshCw size={16} aria-hidden="true" />
                ) : (
                  <Download size={16} aria-hidden="true" />
                )
              }
              onClick={dl.start}
            >
              {failed ? 'Tentar de novo' : 'Baixar modelo'}
            </Button>
          )
        )}
      </div>
    </div>
  );
}
