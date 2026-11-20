import {
  AppError,
  SETTINGS_KEYS,
  settingsSchema,
  type Settings,
  type SettingsUpdate,
} from '@line-splitter/shared';
import type { Db } from '../db/database';

/** Preferências guardadas na tabela `settings` (uma linha por chave, valor em JSON). */
export class SettingsRepository {
  constructor(
    private readonly db: Db,
    private readonly defaults: Settings,
  ) {}

  /** Valores salvos sobre os padrões. Valor salvo que não passe mais no schema volta ao padrão. */
  get(): Settings {
    const rows = this.db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
    const stored = new Map(rows.map((r) => [r.key, r.value]));
    const merged: Record<string, unknown> = { ...this.defaults };
    for (const key of SETTINGS_KEYS) {
      const raw = stored.get(key);
      if (raw === undefined) continue;
      try {
        const candidate = { ...merged, [key]: JSON.parse(raw) as unknown };
        if (settingsSchema.safeParse(candidate).success) merged[key] = candidate[key];
      } catch {
        // JSON corrompido: mantém o padrão para esta chave.
        continue;
      }
    }
    return settingsSchema.parse(merged);
  }

  /** Grava as chaves enviadas numa única transação e devolve o conjunto completo. */
  update(patch: SettingsUpdate): Settings {
    const next = settingsSchema.safeParse({ ...this.get(), ...patch });
    if (!next.success) throw new AppError('VALIDATION', next.error.issues.map((i) => i.message).join(' '));
    const upsert = this.db.prepare(`
      INSERT INTO settings (key, value, updated_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`);
    this.db.transaction(() => {
      for (const key of Object.keys(patch) as (keyof Settings)[]) {
        upsert.run(key, JSON.stringify(next.data[key]));
      }
    })();
    return next.data;
  }
}
