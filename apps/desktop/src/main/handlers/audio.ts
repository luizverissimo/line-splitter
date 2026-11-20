import { AppError, ipc } from '@line-splitter/shared';
import { inspectAudio } from '../audio/inspect';
import { detectFfmpeg } from '../engine/detect';
import type { MediaRegistry } from '../media/registry';
import type { SettingsRepository } from '../settings/repository';

/** Arquivo de entrada escolhido atualmente (o único que o renderer pode tocar além das saídas registradas). */
export class CurrentInput {
  private current: string | null = null;
  constructor(private readonly media: MediaRegistry) {}

  set(filePath: string): string {
    if (this.current && this.current !== filePath) this.media.unregister(this.current);
    this.current = filePath;
    return this.media.register(filePath);
  }

  get path(): string | null {
    return this.current;
  }
}

export function audioHandlers(settings: SettingsRepository, input: CurrentInput) {
  return {
    'audio:inspect': ipc.defineHandler('audio:inspect', async ({ path: filePath }) => {
      const ffmpeg = await detectFfmpeg(settings.get().ffmpegPath);
      if (!ffmpeg.ok || !ffmpeg.ffprobePath) throw new AppError('ENGINE_MISSING', ffmpeg.detail);
      const info = await inspectAudio(filePath, ffmpeg.ffprobePath);
      return { ...info, mediaUrl: input.set(filePath) };
    }),
  };
}
