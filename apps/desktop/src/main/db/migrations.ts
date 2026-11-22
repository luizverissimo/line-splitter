/** Migrações versionadas. Nunca edite uma migração já publicada: acrescente uma nova no fim. */
export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export const migrations: readonly Migration[] = [
  {
    version: 1,
    name: 'settings e separations',
    sql: `
      CREATE TABLE settings (
        key        TEXT PRIMARY KEY NOT NULL,
        value      TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ) STRICT;

      CREATE TABLE separations (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        source_path       TEXT    NOT NULL,
        source_name       TEXT    NOT NULL,
        instrument        TEXT    NOT NULL CHECK (instrument IN ('vocals', 'drums', 'bass', 'guitar', 'piano')),
        audio_duration_s  REAL    NOT NULL CHECK (audio_duration_s > 0),
        processing_ms     INTEGER NOT NULL CHECK (processing_ms >= 0),
        device            TEXT    NOT NULL CHECK (device IN ('cuda', 'cpu')),
        bitrate_kbps      INTEGER NOT NULL CHECK (bitrate_kbps IN (192, 256, 320)),
        instrument_output TEXT    NOT NULL,
        rest_output       TEXT    NOT NULL
      ) STRICT;

      CREATE INDEX separations_created_at ON separations (created_at DESC);
    `,
  },
  {
    version: 2,
    name: 'modelo usado em cada separação (DEC-017)',
    sql: `
      -- As separações anteriores a esta versão foram feitas com o htdemucs_6s.
      ALTER TABLE separations ADD COLUMN model TEXT NOT NULL DEFAULT 'htdemucs_6s';
    `,
  },
];
