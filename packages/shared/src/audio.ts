import { z } from 'zod';
import { formatBytes, formatDuration } from './format';

export const ACCEPTED_EXTENSIONS = ['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg'] as const;
export const MAX_AUDIO_BYTES = 500 * 1024 * 1024;
export const MAX_AUDIO_SECONDS = 30 * 60;

export const ACCEPTED_LABEL = 'MP3, WAV, FLAC, M4A/AAC ou OGG';

export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? fileName.slice(dot + 1).toLowerCase() : '';
}

export function isAcceptedExtension(fileName: string): boolean {
  return (ACCEPTED_EXTENSIONS as readonly string[]).includes(extensionOf(fileName));
}

/** Validação rápida no cliente (antes de chamar o main): extensão e tamanho. Devolve a mensagem de erro ou null. */
export function checkAudioFileBasics(fileName: string, sizeBytes: number): string | null {
  if (!isAcceptedExtension(fileName)) {
    return `Formato não suportado. Envie um arquivo ${ACCEPTED_LABEL}.`;
  }
  if (sizeBytes > MAX_AUDIO_BYTES) {
    return `Arquivo grande demais (${formatBytes(sizeBytes)}). O limite é ${formatBytes(MAX_AUDIO_BYTES)}.`;
  }
  if (sizeBytes === 0) return 'O arquivo está vazio.';
  return null;
}

/** Arredonda para cima: 30:00,3 aparece como 30:01, nunca igual ao limite. */
export const tooLongMessage = (durationS: number) =>
  `Áudio longo demais (${formatDuration(Math.ceil(durationS))}). O limite é ${formatDuration(MAX_AUDIO_SECONDS)}.`;

export const audioInspectInputSchema = z.object({
  path: z
    .string()
    .min(1, 'Caminho do arquivo vazio.')
    .refine((v) => v.startsWith('/') || /^[A-Za-z]:[\\/]/.test(v) || v.startsWith('\\\\'), {
      message: 'O caminho do arquivo precisa ser absoluto.',
    }),
});

export const audioInfoSchema = z.object({
  path: z.string().min(1),
  fileName: z.string().min(1),
  /** Nome sem extensão, usado nos nomes das saídas. */
  name: z.string().min(1),
  extension: z.enum(ACCEPTED_EXTENSIONS),
  sizeBytes: z.number().int().positive().max(MAX_AUDIO_BYTES),
  durationS: z.number().positive().max(MAX_AUDIO_SECONDS),
  /** Contêiner informado pelo ffprobe (ex.: "mp3", "wav", "mov,mp4,m4a,3gp,3g2,mj2"). */
  container: z.string().min(1),
  codec: z.string().min(1),
  sampleRate: z.number().int().positive(),
  channels: z.number().int().positive(),
  /** URL opaca `media://audio/<token>` para tocar o original no renderer. */
  mediaUrl: z.string().startsWith('media://'),
});
export type AudioInfo = z.infer<typeof audioInfoSchema>;
