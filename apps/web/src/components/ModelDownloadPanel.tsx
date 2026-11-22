import { AppError, formatBytes, type EngineModel } from '@line-splitter/shared';
import { Download, RefreshCw, Square } from 'lucide-react';
import { errorDetails, errorMessage } from '../api/errors';
import { useModelDownload } from '../state/ModelDownloadContext';
import { Button, ErrorAlert, ProgressBar } from './ui';

/** Download dos modelos de separação com progresso real, cancelamento, retomada e nova tentativa. */
export function ModelDownloadPanel({ downloaded, models }: { downloaded: boolean; models: EngineModel[] }) {
  const dl = useModelDownload();
  if (downloaded && !dl.running && !dl.result) return null;

  const cancelled = dl.error instanceof AppError && dl.error.code === 'CANCELLED';
  const failed = Boolean(dl.error) && !cancelled;
  const percent = dl.progress ? (dl.progress.receivedBytes / dl.progress.totalBytes) * 100 : null;
  const missing = models.filter((m) => !m.ok);
  const missingBytes = missing.reduce((sum, m) => sum + m.sizeBytes, 0);

  return (
    <div className="install-panel">
      <h2>Modelos de separação</h2>
      {!dl.running && !dl.result && missing.length > 0 && (
        <p className="page-intro">
          Baixa {missing.length === 1 ? 'o modelo' : 'os modelos'} {missing.map((m) => m.name).join(', ')} (
          {formatBytes(missingBytes)} no total). Se o download for interrompido, ele continua de onde parou.
          Depois disso o app funciona sem internet.
        </p>
      )}
      {dl.running && (
        <ProgressBar
          value={percent}
          label={
            dl.progress
              ? `Baixando ${dl.progress.model}: ${formatBytes(dl.progress.receivedBytes)} de ${formatBytes(dl.progress.totalBytes)}`
              : 'Conectando…'
          }
        />
      )}
      {dl.result && !dl.running && (
        <p className="save-ok" role="status">
          Modelos baixados e conferidos ({formatBytes(dl.result.sizeBytes)}).
        </p>
      )}
      {cancelled && !dl.running && (
        <p className="engine-warning" role="status">
          {errorMessage(dl.error)}
        </p>
      )}
      {failed && !dl.running && (
        <ErrorAlert
          title="O download dos modelos falhou"
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
              {failed ? 'Tentar de novo' : 'Baixar modelos'}
            </Button>
          )
        )}
      </div>
    </div>
  );
}
