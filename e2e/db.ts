import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

/** Abre o banco real que o app criou na pasta de dados do teste (leitura feita fora do app, com o app fechado). */
export function openAppDb(userData: string): DatabaseSync {
  return new DatabaseSync(path.join(userData, 'line-splitter.db'));
}
