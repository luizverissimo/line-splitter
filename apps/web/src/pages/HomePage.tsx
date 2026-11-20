import {
  ACCEPTED_EXTENSIONS,
  ACCEPTED_LABEL,
  isAcceptedExtension,
  formatBytes,
  formatDuration,
  type AudioInfo,
} from '@line-splitter/shared';
import { FileAudio, FolderOpen, Upload } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useFileDrop } from '../state/FileDropContext';
import { call } from '../api/client';
import { errorDetails, errorMessage } from '../api/errors';
import { Scissors } from 'lucide-react';
import { Link } from 'react-router';
import { useEngineStatus } from '../api/queries';
import { InstrumentPicker } from '../components/InstrumentPicker';
import { SeparationProgressPanel } from '../components/SeparationProgressPanel';
import { SeparationResultPanel } from '../components/SeparationResultPanel';
import { AudioPlayer, Button, EmptyState, ErrorAlert, LoadingState } from '../components/ui';
import { useSeparation } from '../state/SeparationContext';
import { useHomeState } from '../state/HomeStateContext';
import { QueryError } from '../components/QueryError';

const CONTAINER_LABELS: Record<string, string> = {
  mp3: 'MP3',
  wav: 'WAV',
  flac: 'FLAC',
  ogg: 'OGG',
  aac: 'AAC',
  'mov,mp4,m4a,3gp,3g2,mj2': 'M4A',
};

export function audioFormatLabel(audio: AudioInfo): string {
  const container = CONTAINER_LABELS[audio.container] ?? audio.extension.toUpperCase();
  const channels =
    audio.channels === 1 ? 'mono' : audio.channels === 2 ? 'estéreo' : `${audio.channels} canais`;
  return `${container} · ${audio.codec} · ${(audio.sampleRate / 1000).toLocaleString('pt-BR')} kHz · ${channels}`;
}

export function HomePage() {
  const { state, setState, stem, setStem } = useHomeState();
  const drop = useFileDrop();
  // Só a resposta da última inspeção pedida vale (evita que uma resposta antiga sobrescreva a nova).
  const requestId = useRef(0);
  const inspecting = state.kind === 'inspecting';
  const sep = useSeparation();
  const engine = useEngineStatus();
  const busy = inspecting || sep.running;
  const showResult = Boolean(sep.result) && !sep.running;
  const showProgress = sep.running || Boolean(sep.error);

  const inspect = async (filePath: string, fileName: string) => {
    const id = (requestId.current += 1);
    sep.reset();
    setStem(null);
    setState({ kind: 'inspecting', fileName });
    try {
      const audio = await call('audio:inspect', { path: filePath });
      if (requestId.current === id) setState({ kind: 'ready', audio });
    } catch (error) {
      if (requestId.current === id)
        setState({ kind: 'error', title: 'Não foi possível usar este arquivo', error });
    }
  };

  // Enquanto inspeciona, soltar outro arquivo é ignorado.
  useEffect(() => {
    drop.setAccepting(!busy);
    return () => drop.setAccepting(true);
  }, [drop, busy]);

  // Arquivo solto em qualquer lugar da janela (a navegação para o Início é feita pelo FileDropProvider).
  const inspectRef = useRef(inspect);
  useEffect(() => {
    inspectRef.current = inspect;
  });
  const { subscribe } = drop;
  useEffect(
    () =>
      subscribe((file) => {
        if (file.kind === 'file') void inspectRef.current(file.path, file.fileName);
        else setState({ kind: 'error', title: file.title, error: new Error(file.message) });
      }),
    [subscribe, setState],
  );

  const choose = async () => {
    try {
      const chosen = await call('dialog:chooseFile', {
        title: 'Escolher arquivo de áudio',
        filters: [{ name: `Áudio (${ACCEPTED_LABEL})`, extensions: [...ACCEPTED_EXTENSIONS] }],
      });
      if (!chosen) return;
      const fileName = chosen.split(/[\\/]/).pop() ?? chosen;
      // O filtro do diálogo pode ser contornado digitando o nome: confere a extensão antes do main.
      // O tamanho só o processo principal consegue ler (via stat).
      if (!isAcceptedExtension(fileName)) {
        setState({
          kind: 'error',
          title: 'Não foi possível usar este arquivo',
          error: new Error(`Formato não suportado. Envie um arquivo ${ACCEPTED_LABEL}.`),
        });
        return;
      }
      await inspect(chosen, fileName);
    } catch (error) {
      setState({ kind: 'error', title: 'Não foi possível abrir o diálogo', error });
    }
  };

  return (
    <section aria-labelledby="page-title">
      <h1 id="page-title">Início</h1>
      <p className="page-intro">Escolha um arquivo de áudio e o instrumento que deseja separar.</p>

      <div
        className={`dropzone${drop.dragging ? ' dragging' : ''}`}
        aria-label="Área para soltar o arquivo de áudio"
        role="region"
      >
        <Upload aria-hidden="true" size={32} />
        <p>
          <strong>Arraste e solte um arquivo de áudio na janela</strong>
          <br />
          {ACCEPTED_LABEL} · até 500 MB e 30 minutos
        </p>
        <Button
          variant="primary"
          icon={<FolderOpen size={16} aria-hidden="true" />}
          onClick={() => void choose()}
          disabled={busy}
        >
          Escolher arquivo
        </Button>
      </div>

      {state.kind === 'empty' && (
        <EmptyState
          icon={<FileAudio size={28} />}
          title="Nenhum arquivo escolhido"
          message="O arquivo original nunca é alterado: o Line Splitter só lê o áudio e grava dois MP3 novos."
        />
      )}
      {state.kind === 'inspecting' && <LoadingState message={`Lendo ${state.fileName}…`} />}
      {state.kind === 'error' && (
        <ErrorAlert
          title={state.title}
          message={errorMessage(state.error)}
          details={errorDetails(state.error)}
        />
      )}
      {state.kind === 'ready' && (
        <div className="audio-card" aria-label="Arquivo escolhido">
          <h2>{state.audio.fileName}</h2>
          <dl className="audio-meta">
            <div>
              <dt>Duração</dt>
              <dd>{formatDuration(state.audio.durationS)}</dd>
            </div>
            <div>
              <dt>Formato</dt>
              <dd>{audioFormatLabel(state.audio)}</dd>
            </div>
            <div>
              <dt>Tamanho</dt>
              <dd>{formatBytes(state.audio.sizeBytes)}</dd>
            </div>
          </dl>
          <AudioPlayer src={state.audio.mediaUrl} title={`original: ${state.audio.fileName}`} />
        </div>
      )}
      {state.kind === 'ready' && !showResult && !showProgress && (
        <div className="separate-step">
          <InstrumentPicker value={stem} onChange={setStem} />
          {engine.isPending && <LoadingState message="Verificando o motor de separação…" />}
          {engine.isError && (
            <QueryError
              compact
              error={engine.error}
              onRetry={() => void engine.refetch()}
              title="Não foi possível verificar o motor"
            />
          )}
          {engine.isSuccess && !engine.data.ready && (
            <p className="engine-warning" role="status">
              O motor de separação ainda não está pronto. <Link to="/motor">Abrir a tela Motor</Link>
            </p>
          )}
          <Button
            variant="primary"
            icon={<Scissors size={16} aria-hidden="true" />}
            disabled={!stem || !engine.isSuccess || !engine.data.ready}
            onClick={() => stem && sep.start(stem)}
          >
            Separar
          </Button>
        </div>
      )}
      {state.kind === 'ready' && showProgress && <SeparationProgressPanel onBack={() => sep.reset()} />}
      {state.kind === 'ready' && showResult && sep.result && (
        <SeparationResultPanel
          result={sep.result}
          onSeparateAnother={() => {
            sep.reset();
            setStem(null);
          }}
          onNewFile={() => {
            sep.reset();
            setStem(null);
            setState({ kind: 'empty' });
          }}
        />
      )}
    </section>
  );
}
