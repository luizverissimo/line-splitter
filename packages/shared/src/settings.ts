import { z } from 'zod';

export const BITRATES = [192, 256, 320] as const;
export const bitrateSchema = z.union([z.literal(192), z.literal(256), z.literal(320)], {
  error: 'Escolha 192, 256 ou 320 kbps.',
});
export type Bitrate = z.infer<typeof bitrateSchema>;

export const deviceSchema = z.enum(['auto', 'cuda', 'cpu'], { error: 'Escolha Automático, GPU ou CPU.' });
export type DevicePreference = z.infer<typeof deviceSchema>;

export const DEVICE_LABELS: Record<DevicePreference, string> = {
  auto: 'Automático (GPU se disponível)',
  cuda: 'GPU (CUDA)',
  cpu: 'CPU',
};

/** Caminho absoluto (Linux ou Windows) ou vazio. */
const absolutePath = (message: string) =>
  z
    .string({ error: message })
    .trim()
    .refine((v) => v.startsWith('/') || /^[A-Za-z]:[\\/]/.test(v) || v.startsWith('\\\\'), { message });

export const settingsSchema = z.object({
  outputDir: absolutePath('A pasta de saída precisa ser um caminho absoluto.').refine((v) => v.length > 0, {
    message: 'Escolha a pasta de saída.',
  }),
  bitrateKbps: bitrateSchema,
  device: deviceSchema,
  /** Vazio = procurar `python3`/`python` no PATH. */
  pythonPath: z.union([z.literal(''), absolutePath('O caminho do Python precisa ser absoluto.')]),
  /** Vazio = procurar `ffmpeg` no PATH. */
  ffmpegPath: z.union([z.literal(''), absolutePath('O caminho do FFmpeg precisa ser absoluto.')]),
});
export type Settings = z.infer<typeof settingsSchema>;

export const settingsUpdateSchema = settingsSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nenhuma configuração enviada.' });
export type SettingsUpdate = z.infer<typeof settingsUpdateSchema>;

export const SETTINGS_KEYS = Object.keys(settingsSchema.shape) as (keyof Settings)[];
