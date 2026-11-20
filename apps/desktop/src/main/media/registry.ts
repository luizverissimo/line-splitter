import { randomBytes } from 'node:crypto';
import path from 'node:path';

export const MEDIA_SCHEME = 'media';
export const MEDIA_HOST = 'audio';

/**
 * Lista de arquivos de áudio que o renderer pode tocar. O renderer nunca vê nem escolhe caminhos:
 * recebe uma URL opaca `media://audio/<token>` para cada arquivo liberado pelo processo principal.
 */
export class MediaRegistry {
  private readonly byToken = new Map<string, string>();
  private readonly byPath = new Map<string, string>();

  /** Libera um arquivo (caminho absoluto) e devolve a URL para o renderer. Idempotente por caminho. */
  register(filePath: string): string {
    if (!path.isAbsolute(filePath)) throw new Error(`Caminho de mídia precisa ser absoluto: ${filePath}`);
    const normalized = path.normalize(filePath);
    let token = this.byPath.get(normalized);
    if (!token) {
      token = randomBytes(18).toString('base64url');
      this.byPath.set(normalized, token);
      this.byToken.set(token, normalized);
    }
    return `${MEDIA_SCHEME}://${MEDIA_HOST}/${token}`;
  }

  /** Revoga a liberação de um arquivo. */
  unregister(filePath: string): void {
    const normalized = path.normalize(filePath);
    const token = this.byPath.get(normalized);
    if (!token) return;
    this.byPath.delete(normalized);
    this.byToken.delete(token);
  }

  /** Caminho liberado para uma URL `media://`, ou null se não for uma URL conhecida. */
  resolve(url: string): string | null {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return null;
    }
    if (parsed.protocol !== `${MEDIA_SCHEME}:` || parsed.host !== MEDIA_HOST) return null;
    const token = parsed.pathname.replace(/^\//, '');
    return this.byToken.get(token) ?? null;
  }

  has(filePath: string): boolean {
    return this.byPath.has(path.normalize(filePath));
  }
}
