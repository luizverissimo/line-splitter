import {
  AppError,
  MAX_AUDIO_SECONDS,
  checkAudioFileBasics,
  extensionOf,
  tooLongMessage,
  type AudioInfo,
} from '@line-splitter/shared';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { run } from '../engine/exec';

const ffprobeOutputSchema = z.object({
  format: z.object({ format_name: z.string(), duration: z.string().optional() }),
  streams: z
    .array(
      z.object({
        codec_type: z.string(),
        codec_name: z.string().optional(),
        sample_rate: z.string().optional(),
        channels: z.number().optional(),
        duration: z.string().optional(),
      }),
    )
    .default([]),
});

const INVALID = 'Arquivo corrompido ou formato não suportado.';

/**
 * Confere um arquivo de áudio escolhido pelo usuário sem modificá-lo: extensão, tamanho,
 * leitura pelo ffprobe e duração. Devolve os metadados (sem a URL de mídia).
 */
export async function inspectAudio(filePath: string, ffprobe: string): Promise<Omit<AudioInfo, 'mediaUrl'>> {
  const fileName = path.basename(filePath);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    throw new AppError('NOT_FOUND', 'Arquivo não encontrado. Ele pode ter sido movido ou apagado.', filePath);
  }
  if (!stat.isFile()) throw new AppError('INVALID_AUDIO', 'O caminho escolhido não é um arquivo.', filePath);
  const basic = checkAudioFileBasics(fileName, stat.size);
  if (basic) throw new AppError('INVALID_AUDIO', basic, filePath);
  try {
    fs.accessSync(filePath, fs.constants.R_OK);
  } catch {
    throw new AppError('INVALID_AUDIO', 'Sem permissão para ler o arquivo.', filePath);
  }

  const r = await run(
    ffprobe,
    [
      '-v',
      'error',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      '-select_streams',
      'a',
      filePath,
    ],
    { timeoutMs: 60_000 },
  );
  if (r.error) {
    throw new AppError(
      'ENGINE_MISSING',
      'Não foi possível executar o ffprobe. Confira o FFmpeg na tela Motor.',
      r.error.message,
    );
  }
  if (r.code !== 0)
    throw new AppError('INVALID_AUDIO', INVALID, r.stderr.trim() || `ffprobe saiu com código ${r.code}`);

  let parsed: z.infer<typeof ffprobeOutputSchema>;
  try {
    parsed = ffprobeOutputSchema.parse(JSON.parse(r.stdout));
  } catch (err) {
    throw new AppError('INVALID_AUDIO', INVALID, err instanceof Error ? err.message : String(err));
  }
  const audio = parsed.streams.find((s) => s.codec_type === 'audio');
  if (!audio?.codec_name || !audio.sample_rate || !audio.channels) {
    throw new AppError('INVALID_AUDIO', 'O arquivo não tem uma faixa de áudio legível.', r.stdout);
  }
  const durationS = Number(parsed.format.duration ?? audio.duration);
  if (!Number.isFinite(durationS) || durationS <= 0) {
    throw new AppError('INVALID_AUDIO', 'Não foi possível ler a duração do áudio.', r.stdout);
  }
  if (durationS > MAX_AUDIO_SECONDS) throw new AppError('INVALID_AUDIO', tooLongMessage(durationS), filePath);

  const extension = extensionOf(fileName) as AudioInfo['extension'];
  return {
    path: filePath,
    fileName,
    name: fileName.slice(0, -(extension.length + 1)),
    extension,
    sizeBytes: stat.size,
    durationS,
    container: parsed.format.format_name,
    codec: audio.codec_name,
    sampleRate: Number(audio.sample_rate),
    channels: audio.channels,
  };
}
