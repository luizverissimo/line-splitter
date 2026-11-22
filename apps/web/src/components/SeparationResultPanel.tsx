import { formatDuration, instrumentOf, type SeparationResult } from '@line-splitter/shared';
import { FilePlus2, FolderOpen, Repeat, Search } from 'lucide-react';
import { useState } from 'react';
import { call } from '../api/client';
import { errorMessage } from '../api/errors';
import { DownloadMp3Button } from './DownloadMp3Button';
import { AudioPlayer, Button, ErrorAlert } from './ui';

const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p;

interface Props {
  result: SeparationResult;
  onSeparateAnother: () => void;
  onNewFile: () => void;
}

/** Os dois MP3 gerados, com players, baixar MP3, abrir pasta/mostrar arquivo e próximos passos. */
export function SeparationResultPanel({ result, onSeparateAnother, onNewFile }: Props) {
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const label = instrumentOf(result.stem).label;

  // Enquanto o sistema abre a pasta/arquivo, os botões ficam desabilitados (evita pedidos repetidos).
  const act = async (fn: () => Promise<unknown>) => {
    setActionError(null);
    setPending(true);
    try {
      await fn();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  const tracks = [
    { title: `Só ${label}`, path: result.instrumentPath, url: result.instrumentUrl },
    { title: `Sem ${label}`, path: result.restPath, url: result.restUrl },
  ];

  return (
    <div className="result-panel" aria-label="Resultado da separação">
      <h2>Pronto! Dois arquivos gerados</h2>
      <p className="page-intro">
        Processado em {formatDuration(result.processingMs / 1000)} usando{' '}
        {result.device === 'cuda' ? 'a GPU' : 'a CPU'}.
      </p>
      {tracks.map((t) => (
        <div className="result-track" key={t.path}>
          <div className="result-track-head">
            <strong>{t.title}</strong>
            <span className="result-file" data-path>
              {baseName(t.path)}
            </span>
            <Button
              icon={<Search size={16} aria-hidden="true" />}
              disabled={pending}
              onClick={() => void act(() => call('shell:showFile', { path: t.path }))}
            >
              Mostrar arquivo
            </Button>
          </div>
          <AudioPlayer src={t.url} title={baseName(t.path)} />
          <DownloadMp3Button path={t.path} trackTitle={t.title} />
        </div>
      ))}
      {actionError && <ErrorAlert title="Não foi possível concluir a ação" message={actionError} />}
      <div className="actions">
        <Button
          icon={<FolderOpen size={16} aria-hidden="true" />}
          disabled={pending}
          onClick={() => void act(() => call('shell:openFolder', { path: result.instrumentPath }))}
        >
          Abrir pasta
        </Button>
        <Button variant="primary" icon={<Repeat size={16} aria-hidden="true" />} onClick={onSeparateAnother}>
          Separar outro instrumento
        </Button>
        <Button icon={<FilePlus2 size={16} aria-hidden="true" />} onClick={onNewFile}>
          Novo arquivo
        </Button>
      </div>
    </div>
  );
}
