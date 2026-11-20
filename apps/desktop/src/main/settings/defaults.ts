import { app } from 'electron';
import type { Settings } from '@line-splitter/shared';
import path from 'node:path';

/** Padrões do PRD §5.5/§5.7: pasta de Música do sistema, 320 kbps, dispositivo automático, motor no PATH. */
export function defaultSettings(): Settings {
  return {
    outputDir: path.join(app.getPath('music'), 'Line Splitter'),
    bitrateKbps: 320,
    device: 'auto',
    pythonPath: '',
    ffmpegPath: '',
  };
}
