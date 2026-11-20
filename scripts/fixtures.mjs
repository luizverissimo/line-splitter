// Gera os áudios de teste com o FFmpeg real (nada baixado, nada versionado). Ver DEC-005.
//   node scripts/fixtures.mjs          gera os clipes curtos e os arquivos inválidos
//   node scripts/fixtures.mjs --long   também gera o WAV de 31 min (teste de limite de duração)
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const FIXTURES_DIR = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'fixtures');

/** Clipe "musical" sintético de 8 s, estéreo 44,1 kHz: baixo, melodia com vibrato, bumbo e chimbal sintetizados. */
const MUSIC_FILTER = [
  "aevalsrc='0.35*sin(2*PI*55*t)+0.25*sin(2*PI*110*t)':s=44100:d=8[bass]",
  "aevalsrc='0.3*sin(2*PI*(440+6*sin(2*PI*5*t))*t)*(0.6+0.4*sin(2*PI*0.5*t))':s=44100:d=8[lead]",
  "aevalsrc='0.9*sin(2*PI*60*t)*exp(-25*mod(t,0.5))':s=44100:d=8[kick]",
  'anoisesrc=d=8:c=white:a=0.5:r=44100,highpass=f=6000,volume=0.35[hatraw]',
  "aevalsrc='exp(-60*mod(t+0.25,0.5))':s=44100:d=8[hatenv]",
  '[hatraw][hatenv]amultiply[hat]',
  '[bass][lead][kick][hat]amix=inputs=4:normalize=0,volume=0.6,pan=stereo|c0=c0|c1=c0,alimiter=limit=0.8:level=0[out]',
].join(';');

export const fixtures = {
  wav: path.join(FIXTURES_DIR, 'musica-curta.wav'),
  mp3: path.join(FIXTURES_DIR, 'musica-curta.mp3'),
  flac: path.join(FIXTURES_DIR, 'musica-curta.flac'),
  m4a: path.join(FIXTURES_DIR, 'musica-curta.m4a'),
  ogg: path.join(FIXTURES_DIR, 'musica-curta.ogg'),
  aac: path.join(FIXTURES_DIR, 'musica-curta.aac'),
  corrupted: path.join(FIXTURES_DIR, 'corrompido.mp3'),
  wrongExtension: path.join(FIXTURES_DIR, 'audio-valido.wma'),
  notAudio: path.join(FIXTURES_DIR, 'texto-com-extensao.wav'),
  tooLarge: path.join(FIXTURES_DIR, 'grande-demais.wav'),
  tooLong: path.join(FIXTURES_DIR, 'longa-31min.wav'),
};

export const SHORT_DURATION_S = 8;

/**
 * Gera `out` num arquivo temporário e renomeia no fim: execução interrompida nunca deixa arquivo truncado.
 * @param {string} out
 * @param {string[]} args
 */
function ffmpegTo(out, args) {
  const ext = path.extname(out);
  const tmp = `${out.slice(0, -ext.length)}.parcial${ext}`;
  ffmpeg([...args, tmp]);
  fs.renameSync(tmp, out);
}

/**
 * @param {string} out
 * @param {string | Buffer} data
 */
function writeAtomic(out, data) {
  fs.writeFileSync(`${out}.parcial`, data);
  fs.renameSync(`${out}.parcial`, out);
}

/** @param {string[]} args */
function ffmpeg(args) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8' });
  if (r.error) throw new Error(`FFmpeg não encontrado no PATH: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`FFmpeg falhou (${args.join(' ')}):\n${r.stderr}`);
}

/** @type {(file: string, deps: string[]) => boolean} */
const fresh = (file, deps) =>
  fs.existsSync(file) &&
  deps.every((d) => fs.existsSync(d) && fs.statSync(d).mtimeMs <= fs.statSync(file).mtimeMs);

export function generateFixtures({ long = false } = {}) {
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });
  if (!fs.existsSync(fixtures.wav)) {
    ffmpegTo(fixtures.wav, [
      '-filter_complex',
      MUSIC_FILTER,
      '-map',
      '[out]',
      '-ar',
      '44100',
      '-c:a',
      'pcm_s16le',
    ]);
  }
  /** @type {[string, string[]][]} */
  const encodes = [
    [fixtures.mp3, ['-c:a', 'libmp3lame', '-b:a', '192k']],
    [fixtures.flac, ['-c:a', 'flac']],
    [fixtures.m4a, ['-c:a', 'aac', '-b:a', '192k']],
    [fixtures.ogg, ['-c:a', 'libvorbis', '-q:a', '5']],
    [fixtures.aac, ['-c:a', 'aac', '-b:a', '192k', '-f', 'adts']],
    [fixtures.wrongExtension, ['-c:a', 'libmp3lame', '-b:a', '128k', '-f', 'mp3']],
  ];
  for (const [out, codec] of encodes) {
    if (!fresh(out, [fixtures.wav])) ffmpegTo(out, ['-i', fixtures.wav, ...codec]);
  }
  if (!fs.existsSync(fixtures.corrupted)) {
    // Cabeçalho ID3 válido seguido de lixo: parece MP3 pela extensão, mas não decodifica.
    const junk = Buffer.alloc(64 * 1024);
    for (let i = 0; i < junk.length; i += 1) junk[i] = (i * 7919 + 13) % 251;
    writeAtomic(fixtures.corrupted, Buffer.concat([Buffer.from('ID3\x04\x00\x00\x00\x00\x00\x00'), junk]));
  }
  if (!fs.existsSync(fixtures.notAudio)) {
    writeAtomic(fixtures.notAudio, 'Isto é um arquivo de texto, não um áudio.\n'.repeat(200));
  }
  if (!fs.existsSync(fixtures.tooLarge) || fs.statSync(fixtures.tooLarge).size <= 500 * 1024 * 1024) {
    // Arquivo esparso de 501 MB: ocupa quase nada em disco, mas o tamanho reportado passa do limite.
    const fd = fs.openSync(fixtures.tooLarge, 'w');
    fs.ftruncateSync(fd, 501 * 1024 * 1024);
    fs.closeSync(fd);
  }
  if (long && !fs.existsSync(fixtures.tooLong)) {
    // 31 min em mono 8 kHz: passa do limite de 30 min ocupando ~30 MB.
    ffmpegTo(fixtures.tooLong, [
      '-f',
      'lavfi',
      '-i',
      'sine=f=220:r=8000:d=1860',
      '-ac',
      '1',
      '-c:a',
      'pcm_s16le',
    ]);
  }
  return fixtures;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  generateFixtures({ long: process.argv.includes('--long') });
  for (const [name, file] of Object.entries(fixtures)) {
    if (fs.existsSync(file)) console.log(`${name.padEnd(15)} ${path.relative(process.cwd(), file)}`);
  }
}
