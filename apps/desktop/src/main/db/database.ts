import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { migrations as defaultMigrations, type Migration } from './migrations';

export type Db = Database.Database;
export const DB_FILENAME = 'line-splitter.db';

/** Aplica, em ordem e cada uma numa transação, as migrações acima da versão atual (PRAGMA user_version). */
export function migrate(db: Db, migrations: readonly Migration[] = defaultMigrations): number {
  const versions = migrations.map((m) => m.version);
  if (versions.some((v, i) => v !== i + 1)) {
    throw new Error('Migrações precisam ter versões sequenciais começando em 1.');
  }
  const current = db.pragma('user_version', { simple: true }) as number;
  if (current > migrations.length) {
    throw new Error(
      `Banco na versão ${current}, mais nova que este aplicativo (${migrations.length}). Atualize o Line Splitter.`,
    );
  }
  for (const migration of migrations.slice(current)) {
    db.transaction(() => {
      db.exec(migration.sql);
      db.pragma(`user_version = ${migration.version}`);
    })();
  }
  return db.pragma('user_version', { simple: true }) as number;
}

/** Abre (criando se preciso) o banco na pasta de dados e aplica as migrações. */
export function openDatabase(userDataDir: string): Db {
  fs.mkdirSync(userDataDir, { recursive: true });
  const db = new Database(path.join(userDataDir, DB_FILENAME));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 3000');
  try {
    migrate(db);
  } catch (err) {
    db.close();
    throw err;
  }
  return db;
}
