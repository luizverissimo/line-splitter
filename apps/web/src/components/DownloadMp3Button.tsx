import { Download } from 'lucide-react';
import { useState } from 'react';
import { call } from '../api/client';
import { errorDetails, errorMessage } from '../api/errors';
import { Button, ErrorAlert } from './ui';

interface Props {
  /** Caminho da faixa gerada (saída registrada no histórico). */
  path: string;
  /** Nome da faixa para leitores de tela, ex.: "Só Voz". */
  trackTitle: string;
  disabled?: boolean;
}

/** "Baixar MP3": abre o "Salvar como" do sistema e grava uma cópia da faixa onde o usuário escolher. */
export function DownloadMp3Button({ path, trackTitle, disabled = false }: Props) {
  const [saving, setSaving] = useState(false);
  const [savedTo, setSavedTo] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  const save = async () => {
    setSaving(true);
    setSavedTo(null);
    setError(null);
    try {
      const result = await call('file:saveCopy', { path });
      if (result) setSavedTo(result.savedTo);
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="download-mp3">
      <Button
        icon={<Download size={16} aria-hidden="true" />}
        loading={saving}
        disabled={disabled}
        aria-label={`Baixar MP3: ${trackTitle}`}
        onClick={() => void save()}
      >
        {saving ? 'Salvando…' : 'Baixar MP3'}
      </Button>
      {savedTo && (
        <p className="save-ok" role="status">
          Salvo em <span data-path>{savedTo}</span>
        </p>
      )}
      {error !== null && (
        <ErrorAlert
          title="Não foi possível salvar o MP3"
          message={errorMessage(error)}
          details={errorDetails(error)}
        />
      )}
    </div>
  );
}
