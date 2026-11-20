import {
  BITRATES,
  DEVICE_LABELS,
  settingsSchema,
  type Bitrate,
  type DevicePreference,
  type Settings,
} from '@line-splitter/shared';
import { FolderOpen } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { call } from '../api/client';
import { errorDetails, errorMessage } from '../api/errors';
import { useSettings, useUpdateSettings } from '../api/queries';
import { QueryError } from '../components/QueryError';
import { Button, ErrorAlert, LoadingState } from '../components/ui';

type FieldErrors = Partial<Record<keyof Settings, string>>;

function SettingsForm({ initial }: { initial: Settings }) {
  const [savedValues, setSavedValues] = useState<Settings>(initial);
  const [form, setForm] = useState<Settings>(initial);
  const [nothingToSave, setNothingToSave] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [saved, setSaved] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const update = useUpdateSettings();

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setFieldErrors((e) => ({ ...e, [key]: undefined }));
    setSaved(false);
    setNothingToSave(false);
  };

  const pick = async (key: 'outputDir' | 'pythonPath' | 'ffmpegPath') => {
    setPickError(null);
    try {
      const chosen =
        key === 'outputDir'
          ? await call('dialog:chooseDirectory', {
              title: 'Escolher pasta de saída',
              defaultPath: form.outputDir,
            })
          : await call('dialog:chooseFile', {
              title:
                key === 'pythonPath' ? 'Escolher o executável do Python' : 'Escolher o executável do FFmpeg',
              ...(form[key] ? { defaultPath: form[key] } : {}),
            });
      if (chosen) set(key, chosen);
    } catch (err) {
      setPickError(errorMessage(err));
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSaved(false);
    const parsed = settingsSchema.safeParse(form);
    if (!parsed.success) {
      const errors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof Settings | undefined;
        if (key && !errors[key]) errors[key] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }
    // Envia só o que mudou: chaves não tocadas continuam seguindo o padrão do sistema.
    const patch = Object.fromEntries(
      (Object.keys(parsed.data) as (keyof Settings)[])
        .filter((key) => parsed.data[key] !== savedValues[key])
        .map((key) => [key, parsed.data[key]]),
    ) as Partial<Settings>;
    if (Object.keys(patch).length === 0) {
      update.reset();
      setNothingToSave(true);
      return;
    }
    update.mutate(patch, {
      onSuccess: (settings) => {
        setSavedValues(settings);
        setForm(settings);
        setSaved(true);
      },
    });
  };

  const fieldError = (key: keyof Settings) =>
    fieldErrors[key] ? (
      <p className="field-error" id={`${key}-erro`} role="alert">
        {fieldErrors[key]}
      </p>
    ) : null;
  const describedBy = (key: keyof Settings, hint?: string) =>
    [fieldErrors[key] ? `${key}-erro` : '', hint ?? ''].filter(Boolean).join(' ') || undefined;

  return (
    <form className="settings-form" onSubmit={submit} noValidate>
      {/* Durante o salvamento nada pode ser editado: a resposta substitui o formulário. */}
      <fieldset className="settings-fields" disabled={update.isPending}>
        <legend className="sr-only">Preferências</legend>
        <div className="field">
          <label htmlFor="outputDir">Pasta de saída</label>
          <div className="field-row">
            <input
              id="outputDir"
              value={form.outputDir}
              onChange={(e) => set('outputDir', e.currentTarget.value)}
              aria-invalid={Boolean(fieldErrors.outputDir)}
              aria-describedby={describedBy('outputDir', 'outputDir-dica')}
            />
            <Button icon={<FolderOpen size={16} aria-hidden="true" />} onClick={() => void pick('outputDir')}>
              Escolher…
            </Button>
          </div>
          <p className="field-hint" id="outputDir-dica">
            Os dois MP3 de cada separação são salvos aqui. A pasta é criada se não existir.
          </p>
          {fieldError('outputDir')}
        </div>

        <div className="field">
          <label htmlFor="bitrateKbps">Qualidade do MP3</label>
          <select
            id="bitrateKbps"
            value={form.bitrateKbps}
            onChange={(e) => set('bitrateKbps', Number(e.currentTarget.value) as Bitrate)}
          >
            {BITRATES.map((b) => (
              <option key={b} value={b}>
                {b} kbps{b === 320 ? ' (máxima)' : ''}
              </option>
            ))}
          </select>
          {fieldError('bitrateKbps')}
        </div>

        <div className="field">
          <label htmlFor="device">Dispositivo de processamento</label>
          <select
            id="device"
            value={form.device}
            onChange={(e) => set('device', e.currentTarget.value as DevicePreference)}
          >
            {(Object.keys(DEVICE_LABELS) as DevicePreference[]).map((d) => (
              <option key={d} value={d}>
                {DEVICE_LABELS[d]}
              </option>
            ))}
          </select>
          {fieldError('device')}
        </div>

        {(['pythonPath', 'ffmpegPath'] as const).map((key) => {
          const label = key === 'pythonPath' ? 'Python' : 'FFmpeg';
          return (
            <div className="field" key={key}>
              <label htmlFor={key}>Caminho do {label}</label>
              <div className="field-row">
                <input
                  id={key}
                  value={form[key]}
                  placeholder="Detectar automaticamente"
                  onChange={(e) => set(key, e.currentTarget.value)}
                  aria-invalid={Boolean(fieldErrors[key])}
                  aria-describedby={describedBy(key, `${key}-dica`)}
                />
                <Button onClick={() => void pick(key)}>Escolher…</Button>
                <Button onClick={() => set(key, '')} disabled={form[key] === ''}>
                  Usar detecção automática
                </Button>
              </div>
              <p className="field-hint" id={`${key}-dica`}>
                Deixe vazio para procurar o {label} instalado no sistema.
              </p>
              {fieldError(key)}
            </div>
          );
        })}
      </fieldset>

      {pickError && <ErrorAlert title="Não foi possível abrir o diálogo" message={pickError} />}
      {update.isError && (
        <ErrorAlert
          title="Não foi possível salvar"
          message={errorMessage(update.error)}
          details={errorDetails(update.error)}
        />
      )}

      <div className="actions">
        <Button type="submit" variant="primary" loading={update.isPending}>
          Salvar configurações
        </Button>
        {nothingToSave && (
          <span className="save-ok" role="status">
            Nenhuma alteração para salvar.
          </span>
        )}
        {saved && (
          <span className="save-ok" role="status">
            Configurações salvas.
          </span>
        )}
      </div>
    </form>
  );
}

export function SettingsPage() {
  const settings = useSettings();
  return (
    <section aria-labelledby="page-title">
      <h1 id="page-title">Configurações</h1>
      <p className="page-intro">Pasta de saída, qualidade do MP3, dispositivo e caminhos do motor.</p>
      {settings.isPending && <LoadingState message="Carregando configurações…" />}
      {settings.isError && (
        <QueryError
          title="Não foi possível carregar as configurações"
          error={settings.error}
          onRetry={() => void settings.refetch()}
        />
      )}
      {settings.isSuccess && <SettingsForm initial={settings.data} />}
    </section>
  );
}
