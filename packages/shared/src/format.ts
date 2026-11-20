/** Formata segundos como "m:ss" ou "h:mm:ss" (usado em durações de áudio e tempo decorrido). */
export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    throw new RangeError(`Duração inválida: ${totalSeconds}`);
  }
  const s = Math.floor(totalSeconds);
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/** Formata bytes em unidade legível (B, KB, MB, GB) com vírgula decimal. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    throw new RangeError(`Tamanho inválido: ${bytes}`);
  }
  const units = ['B', 'KB', 'MB', 'GB'] as const;
  let value = Math.round(bytes);
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const text = unit === 0 ? String(value) : value.toFixed(1).replace('.', ',');
  return `${text} ${units[unit]}`;
}
