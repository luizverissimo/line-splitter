import type { EngineItem, EngineStatus } from '@line-splitter/shared';
import { CheckCircle2, Cpu, RefreshCw, XCircle } from 'lucide-react';
import { useAppInfo, useEngineStatus } from '../api/queries';
import { EngineInstallPanel } from '../components/EngineInstallPanel';
import { QueryError } from '../components/QueryError';
import { Button, LoadingState } from '../components/ui';

type Platform = 'linux' | 'win32' | 'darwin';

const INSTALL_HELP: Record<'python' | 'ffmpeg', Record<Platform, { title: string; steps: string[] }>> = {
  python: {
    linux: {
      title: 'Instalar o Python no Linux',
      steps: [
        'Abra um terminal e rode:',
        'sudo apt install python3 python3-venv',
        'Depois clique em "Verificar de novo".',
      ],
    },
    win32: {
      title: 'Instalar o Python no Windows',
      steps: [
        'Abra o PowerShell e rode:',
        'winget install -e --id Python.Python.3.12',
        'Ou baixe o instalador em python.org e marque "Add python.exe to PATH".',
        'Feche e abra o Line Splitter e clique em "Verificar de novo".',
      ],
    },
    darwin: {
      title: 'Instalar o Python no macOS',
      steps: ['Abra o Terminal e rode:', 'brew install python', 'Depois clique em "Verificar de novo".'],
    },
  },
  ffmpeg: {
    linux: {
      title: 'Instalar o FFmpeg no Linux',
      steps: ['Abra um terminal e rode:', 'sudo apt install ffmpeg', 'Depois clique em "Verificar de novo".'],
    },
    win32: {
      title: 'Instalar o FFmpeg no Windows',
      steps: [
        'Abra o PowerShell e rode:',
        'winget install -e --id Gyan.FFmpeg',
        'Feche e abra o Line Splitter e clique em "Verificar de novo".',
        'Se instalou em outra pasta, informe o caminho do ffmpeg.exe em Configurações.',
      ],
    },
    darwin: {
      title: 'Instalar o FFmpeg no macOS',
      steps: ['Abra o Terminal e rode:', 'brew install ffmpeg', 'Depois clique em "Verificar de novo".'],
    },
  },
};

const isCommand = (step: string) => /^(sudo |winget |brew )/.test(step);

function StatusRow({ label, item }: { label: string; item: EngineItem }) {
  return (
    <li className={`engine-item ${item.ok ? 'ok' : 'fail'}`}>
      {item.ok ? (
        <CheckCircle2 aria-hidden="true" className="engine-icon" />
      ) : (
        <XCircle aria-hidden="true" className="engine-icon" />
      )}
      <div>
        <strong>
          {label}
          <span className="sr-only">{item.ok ? ': pronto' : ': com problema'}</span>
        </strong>
        <span className="engine-detail">{item.detail}</span>
      </div>
    </li>
  );
}

function InstallHelp({ which, platform }: { which: 'python' | 'ffmpeg'; platform: Platform }) {
  const help = INSTALL_HELP[which][platform];
  return (
    <div className="install-help">
      <h3>{help.title}</h3>
      <ol>
        {help.steps.map((step) => (
          <li key={step}>{isCommand(step) ? <code>{step}</code> : step}</li>
        ))}
      </ol>
    </div>
  );
}

function DeviceInfo({ device, engineReady }: { device: EngineStatus['device']; engineReady: boolean }) {
  const text = !engineReady
    ? 'definido depois de instalar o motor (a GPU é detectada pelo PyTorch)'
    : device.effective === 'cuda'
      ? `GPU: ${device.gpuName ?? 'NVIDIA (CUDA)'}`
      : device.cudaAvailable
        ? 'CPU (escolhida nas Configurações)'
        : 'CPU';
  return (
    <div className="engine-device">
      <Cpu aria-hidden="true" size={18} />
      <span>
        Dispositivo em uso: <strong>{text}</strong>
      </span>
      {device.warning && <p className="engine-warning">{device.warning}</p>}
    </div>
  );
}

export function EnginePage() {
  const status = useEngineStatus();
  const info = useAppInfo();
  // Sem saber a plataforma (app:info falhou), mostramos as instruções de todas, avisando o motivo.
  const platforms: Platform[] = info.isSuccess
    ? [info.data.platform]
    : info.isError
      ? ['linux', 'win32']
      : [];

  return (
    <section aria-labelledby="page-title">
      <h1 id="page-title">Motor de separação</h1>
      <p className="page-intro">Situação do Python, do Demucs, do FFmpeg e do modelo usados na separação.</p>

      {status.isPending && <LoadingState message="Verificando o motor…" />}
      {status.isError && (
        <QueryError
          title="Não foi possível verificar o motor"
          error={status.error}
          onRetry={() => void status.refetch()}
        />
      )}
      {status.isSuccess && (
        <div className="engine">
          <p className={`engine-summary ${status.data.ready ? 'ok' : 'fail'}`} role="status">
            {status.data.ready
              ? 'Tudo pronto para separar.'
              : 'O motor ainda não está pronto. Resolva os itens marcados abaixo.'}
          </p>
          <ul className="engine-list" aria-label="Itens do motor">
            <StatusRow label="Python" item={status.data.python} />
            <StatusRow label="FFmpeg" item={status.data.ffmpeg} />
            <StatusRow label="Demucs" item={status.data.demucs} />
            <StatusRow label="Modelo htdemucs_6s" item={status.data.model} />
          </ul>
          <DeviceInfo device={status.data.device} engineReady={status.data.demucs.ok} />
          {info.isError && (!status.data.python.ok || !status.data.ffmpeg.ok) && (
            <p className="engine-warning" role="status">
              Não foi possível identificar o sistema operacional; seguem as instruções para Linux e Windows.
            </p>
          )}
          {!status.data.python.ok &&
            platforms.map((p) => <InstallHelp key={`python-${p}`} which="python" platform={p} />)}
          {!status.data.ffmpeg.ok &&
            platforms.map((p) => <InstallHelp key={`ffmpeg-${p}`} which="ffmpeg" platform={p} />)}
          <EngineInstallPanel pythonOk={status.data.python.ok} installed={status.data.demucs.ok} />
        </div>
      )}

      <div className="actions engine-actions">
        <Button
          icon={<RefreshCw size={16} aria-hidden="true" />}
          onClick={() => void status.refetch()}
          loading={status.isFetching}
        >
          Verificar de novo
        </Button>
      </div>
    </section>
  );
}
