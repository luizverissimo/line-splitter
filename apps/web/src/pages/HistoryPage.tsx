import { formatDuration, instrumentOf, type HistoryItem } from '@line-splitter/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FolderOpen, History, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { call } from '../api/client';
import { errorDetails, errorMessage } from '../api/errors';
import { QueryError } from '../components/QueryError';
import { AudioPlayer, Button, ConfirmDialog, EmptyState, ErrorAlert, LoadingState } from '../components/ui';

const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p;
const dateFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

function Output({ title, output }: { title: string; output: HistoryItem['instrument'] }) {
  return (
    <div className="history-output">
      <span className="history-output-title">{title}</span>
      <span className="result-file" data-path>
        {output.path}
      </span>
      {output.exists && output.url ? (
        <AudioPlayer src={output.url} title={baseName(output.path)} />
      ) : (
        <span className="history-missing">Arquivo não encontrado</span>
      )}
    </div>
  );
}

function HistoryEntry({ item, onRemove }: { item: HistoryItem; onRemove: (item: HistoryItem) => void }) {
  const [actionError, setActionError] = useState<string | null>(null);
  const label = instrumentOf(item.stem).label;
  const folderTarget = item.instrument.exists
    ? item.instrument.path
    : item.rest.exists
      ? item.rest.path
      : null;
  return (
    <li className="history-item">
      <div className="history-head">
        <div>
          <h2>
            <span data-path>{item.sourceName}</span> · {label}
          </h2>
          <p className="history-meta">
            {dateFormat.format(new Date(item.createdAt))} · áudio de {formatDuration(item.audioDurationS)} ·
            processado em {formatDuration(item.processingMs / 1000)} ({item.device === 'cuda' ? 'GPU' : 'CPU'}
            , {item.bitrateKbps} kbps)
          </p>
          <p className="history-meta">
            Original: <span data-path>{item.sourcePath}</span>
          </p>
        </div>
        <div className="actions">
          <Button
            icon={<FolderOpen size={16} aria-hidden="true" />}
            disabled={!folderTarget}
            onClick={() => {
              if (!folderTarget) return;
              setActionError(null);
              call('shell:openFolder', { path: folderTarget }).catch((err: unknown) =>
                setActionError(errorMessage(err)),
              );
            }}
          >
            Abrir pasta
          </Button>
          <Button
            variant="danger"
            icon={<Trash2 size={16} aria-hidden="true" />}
            onClick={() => onRemove(item)}
          >
            Remover
          </Button>
        </div>
      </div>
      <Output title={`Só ${label}`} output={item.instrument} />
      <Output title={`Sem ${label}`} output={item.rest} />
      {actionError && <ErrorAlert title="Não foi possível abrir a pasta" message={actionError} />}
    </li>
  );
}

export function HistoryPage() {
  const queryClient = useQueryClient();
  const history = useQuery({ queryKey: ['history'], queryFn: () => call('history:list', undefined) });
  const [removing, setRemoving] = useState<HistoryItem | null>(null);
  const [deleteFiles, setDeleteFiles] = useState(false);
  const remove = useMutation({
    mutationFn: (input: { id: number; deleteFiles: boolean }) => call('history:remove', input),
    onSuccess: () => {
      setRemoving(null);
      void queryClient.invalidateQueries({ queryKey: ['history'] });
    },
    onError: () => void queryClient.invalidateQueries({ queryKey: ['history'] }),
  });

  return (
    <section aria-labelledby="page-title">
      <h1 id="page-title">Histórico</h1>
      <p className="page-intro">Separações já feitas neste computador.</p>
      {history.isPending && <LoadingState message="Carregando o histórico…" />}
      {history.isError && (
        <QueryError
          title="Não foi possível carregar o histórico"
          error={history.error}
          onRetry={() => void history.refetch()}
        />
      )}
      {history.isSuccess && history.data.length === 0 && (
        <EmptyState
          icon={<History size={28} />}
          title="Nenhuma separação ainda"
          message="Escolha um arquivo de áudio e um instrumento para fazer a primeira."
          action={
            <Link to="/" className="btn btn-primary">
              Fazer a primeira separação
            </Link>
          }
        />
      )}
      {history.isSuccess && history.data.length > 0 && (
        <ul className="history-list" aria-label="Separações">
          {history.data.map((item) => (
            <HistoryEntry
              key={item.id}
              item={item}
              onRemove={(i) => {
                remove.reset();
                setDeleteFiles(false);
                setRemoving(i);
              }}
            />
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={removing !== null}
        title="Remover do histórico?"
        confirmLabel="Remover"
        danger
        busy={remove.isPending}
        onCancel={() => setRemoving(null)}
        onConfirm={() => removing && remove.mutate({ id: removing.id, deleteFiles })}
      >
        <p>{removing ? `${removing.sourceName} · ${instrumentOf(removing.stem).label}` : ''}</p>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={deleteFiles}
            onChange={(e) => setDeleteFiles(e.currentTarget.checked)}
          />
          Apagar também os arquivos MP3
        </label>
        <p className="field-hint">O arquivo original nunca é apagado.</p>
        {remove.isError && (
          <ErrorAlert
            title="Não foi possível remover"
            message={errorMessage(remove.error)}
            details={errorDetails(remove.error)}
          />
        )}
      </ConfirmDialog>
    </section>
  );
}
