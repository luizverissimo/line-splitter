import type { Stem } from '@line-splitter/shared';
import type { Db } from '../db/database';

export interface NewSeparation {
  sourcePath: string;
  sourceName: string;
  stem: Stem;
  audioDurationS: number;
  processingMs: number;
  device: 'cuda' | 'cpu';
  bitrateKbps: 192 | 256 | 320;
  instrumentOutput: string;
  restOutput: string;
  /** Nome do modelo de separação usado. */
  model: string;
}

export interface SeparationRow extends NewSeparation {
  id: number;
  createdAt: string;
}

interface DbRow {
  id: number;
  created_at: string;
  source_path: string;
  source_name: string;
  instrument: Stem;
  audio_duration_s: number;
  processing_ms: number;
  device: 'cuda' | 'cpu';
  bitrate_kbps: 192 | 256 | 320;
  instrument_output: string;
  rest_output: string;
  model: string;
}

const fromDb = (r: DbRow): SeparationRow => ({
  id: r.id,
  createdAt: r.created_at,
  sourcePath: r.source_path,
  sourceName: r.source_name,
  stem: r.instrument,
  audioDurationS: r.audio_duration_s,
  processingMs: r.processing_ms,
  device: r.device,
  bitrateKbps: r.bitrate_kbps,
  instrumentOutput: r.instrument_output,
  restOutput: r.rest_output,
  model: r.model,
});

/** Separações concluídas (só entram aqui depois que os dois MP3 estão na pasta de saída — RN-13). */
export class HistoryRepository {
  constructor(private readonly db: Db) {}

  insert(s: NewSeparation): SeparationRow {
    const { lastInsertRowid } = this.db
      .prepare(
        `INSERT INTO separations (source_path, source_name, instrument, audio_duration_s, processing_ms, device,
           bitrate_kbps, instrument_output, rest_output, model)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        s.sourcePath,
        s.sourceName,
        s.stem,
        s.audioDurationS,
        s.processingMs,
        s.device,
        s.bitrateKbps,
        s.instrumentOutput,
        s.restOutput,
        s.model,
      );
    const row = this.get(Number(lastInsertRowid));
    if (!row) throw new Error('Registro de separação não encontrado logo após gravar.');
    return row;
  }

  get(id: number): SeparationRow | null {
    const row = this.db.prepare('SELECT * FROM separations WHERE id = ?').get(id) as DbRow | undefined;
    return row ? fromDb(row) : null;
  }

  /** Mais recentes primeiro. */
  list(): SeparationRow[] {
    return (
      this.db.prepare('SELECT * FROM separations ORDER BY created_at DESC, id DESC').all() as DbRow[]
    ).map(fromDb);
  }

  /** O caminho é uma saída registrada no histórico? (só essas o renderer pode abrir/mostrar/apagar) */
  isKnownOutput(filePath: string): boolean {
    const row = this.db
      .prepare('SELECT 1 FROM separations WHERE instrument_output = ? OR rest_output = ? LIMIT 1')
      .get(filePath, filePath);
    return row !== undefined;
  }

  remove(id: number): boolean {
    return this.db.prepare('DELETE FROM separations WHERE id = ?').run(id).changes > 0;
  }
}
