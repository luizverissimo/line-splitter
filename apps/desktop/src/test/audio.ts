import { spawnSync } from 'node:child_process';

export interface ProbeResult {
  formatName: string;
  durationS: number;
  codec: string;
  sampleRate: number;
  channels: number;
  bitRate: number | null;
}

/** Lê codec, duração, sample rate, canais e bitrate com o `ffprobe` real. */
export function probe(file: string): ProbeResult {
  const r = spawnSync(
    'ffprobe',
    ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', '-select_streams', 'a:0', file],
    { encoding: 'utf8' },
  );
  if (r.error) throw new Error(`ffprobe não encontrado no PATH: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`ffprobe não conseguiu ler ${file}: ${r.stderr.trim()}`);
  const data = JSON.parse(r.stdout) as {
    format?: { format_name?: string; duration?: string; bit_rate?: string };
    streams?: { codec_name?: string; sample_rate?: string; channels?: number; bit_rate?: string }[];
  };
  const stream = data.streams?.[0];
  if (!stream || !data.format) throw new Error(`Nenhuma faixa de áudio em ${file}`);
  const bitRate = stream.bit_rate ?? data.format.bit_rate;
  return {
    formatName: data.format.format_name ?? '',
    durationS: Number(data.format.duration),
    codec: stream.codec_name ?? '',
    sampleRate: Number(stream.sample_rate),
    channels: stream.channels ?? 0,
    bitRate: bitRate ? Number(bitRate) : null,
  };
}
