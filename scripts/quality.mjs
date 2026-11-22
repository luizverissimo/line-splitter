// Medição de vazamento dos separadores (DEC-017).
//   pnpm quality [--candidates a,b] [--tracks 12] [--song caminho/musica.mp3]
// Baixa para fixtures/quality/ (fora do git) os dois conjuntos com faixas verdadeiras, ambos CC-BY-4.0 e
// conferidos por MD5: MUSDB18 7 s (gravações reais; voz, bateria, baixo; ~147 MB) e BabySlakh 16 kHz
// (sintetizado de MIDI; guitarra e piano; ~883 MB). Roda cada candidato num processo Python próprio e grava
// fixtures/quality.md. Com --song, também separa a música indicada (MP3 em fixtures/quality/musica/) e mede o
// resíduo de cada faixa nos trechos em que o instrumento está ausente.
//
// Python: LINE_SPLITTER_QUALITY_PYTHON, ou o do motor de teste em /tmp/line-splitter-e2e-engine. Ele precisa de
// torch 2.6 e audio-separator 0.48.0 — o motor do app passa a instalá-los na T-904; antes disso, use a variável.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dir = path.join(root, 'fixtures', 'quality');
const DATASETS = [
  {
    name: 'MUSDB18 7 s',
    url: 'https://zenodo.org/records/3270814/files/MUSDB18-7-STEMS.zip',
    file: 'MUSDB18-7-STEMS.zip',
    md5: 'dc2bdfac5b46ce742bd60009866758a5',
    extracted: 'test',
    extract: (file) => ['unzip', ['-q', '-o', file, '-d', dir]],
  },
  {
    name: 'BabySlakh',
    url: 'https://zenodo.org/api/records/4603870/files/babyslakh_16k.tar.gz/content',
    file: 'babyslakh_16k.tar.gz',
    md5: '311096dc2bde7d61c97e930edbfc7f78',
    extracted: 'babyslakh_16k',
    extract: (file) => ['tar', ['xzf', file, '-C', dir]],
  },
];
const ALL_CANDIDATES = [
  'htdemucs_6s',
  'htdemucs_6s_shifts',
  'htdemucs_ft',
  'bs_roformer_sw',
  'melband_kim_ft2_bleedless',
  'bs_roformer_1297',
];
const LABELS = {
  'musdb:vocals': 'Voz (MUSDB)',
  'musdb:drums': 'Bateria (MUSDB)',
  'musdb:bass': 'Baixo (MUSDB)',
  'slakh:guitar': 'Guitarra (BabySlakh)',
  'slakh:piano': 'Piano (BabySlakh)',
};
const SONG_LABELS = { vocals: 'Voz', drums: 'Bateria', bass: 'Baixo', guitar: 'Guitarra', piano: 'Piano' };

function fail(message) {
  console.error(`\npnpm quality: ${message}`);
  process.exit(1);
}

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function requireCommand(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  if (r.error || r.status !== 0) fail(`o comando "${cmd}" é necessário e não foi encontrado no PATH.`);
}

function md5(file) {
  const hash = crypto.createHash('md5');
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(8 * 1024 * 1024);
  let n;
  while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) hash.update(buf.subarray(0, n));
  fs.closeSync(fd);
  return hash.digest('hex');
}

async function download(ds, dest) {
  // Retoma downloads interrompidos (o Zenodo às vezes corta arquivos grandes).
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const have = fs.existsSync(dest) ? fs.statSync(dest).size : 0;
    const res = await fetch(ds.url, { headers: have ? { Range: `bytes=${have}-` } : {} });
    if (res.status === 416) return;
    if (!res.ok) fail(`falha ao baixar ${ds.name} (HTTP ${res.status}).`);
    const append = res.status === 206;
    const out = fs.createWriteStream(dest, { flags: append ? 'a' : 'w' });
    try {
      for await (const chunk of res.body) out.write(chunk);
    } catch {
      console.log(`  download interrompido; retomando (tentativa ${attempt})…`);
    }
    await new Promise((r) => out.end(r));
    if (md5(dest) === ds.md5) return;
  }
}

async function ensureDataset(ds) {
  const file = path.join(dir, ds.file);
  if (!fs.existsSync(file) || md5(file) !== ds.md5) {
    console.log(`Baixando ${ds.name}…`);
    await download(ds, file);
    if (md5(file) !== ds.md5) fail(`o MD5 de ${ds.file} não confere; apague o arquivo e tente de novo.`);
  }
  if (!fs.existsSync(path.join(dir, ds.extracted))) {
    const [cmd, args] = ds.extract(file);
    const r = spawnSync(cmd, args, { stdio: 'inherit' });
    if (r.status !== 0) fail(`falha ao extrair ${ds.file}.`);
  }
}

function python() {
  const candidate =
    process.env.LINE_SPLITTER_QUALITY_PYTHON ||
    (process.platform === 'win32'
      ? 'C:\\line-splitter-e2e-engine\\venv\\Scripts\\python.exe'
      : '/tmp/line-splitter-e2e-engine/venv/bin/python');
  const check = spawnSync(candidate, ['-c', 'import audio_separator, soundfile, numpy, torch'], {
    encoding: 'utf8',
  });
  if (check.error || check.status !== 0) {
    fail(
      `o Python ${candidate} não tem audio-separator/torch. Defina LINE_SPLITTER_QUALITY_PYTHON com um Python que ` +
        'tenha torch 2.6 e audio-separator 0.48.0 (depois da T-904, o motor de teste já vem com eles).',
    );
  }
  return candidate;
}

const fmt = (v) => (v === null || v === undefined ? '—' : v.toFixed(1).replace('.', ','));

requireCommand('ffmpeg', ['-version']);
requireCommand('unzip', ['-v']);
requireCommand('tar', ['--version']);
fs.mkdirSync(dir, { recursive: true });
for (const ds of DATASETS) await ensureDataset(ds);
const py = python();
const candidates = arg('candidates', ALL_CANDIDATES.join(',')).split(',');
const tracks = arg('tracks', '12');
const song = arg('song', '');
const songDir = path.join(dir, 'musica');
if (song) fs.rmSync(songDir, { recursive: true, force: true });
const results = [];
for (const c of candidates) {
  const out = path.join(dir, `resultado-${c}.json`);
  const args = [path.join(root, 'scripts', 'quality', 'measure.py'), '--candidate', c];
  args.push('--musdb', dir, '--slakh', path.join(dir, 'babyslakh_16k'), '--models', path.join(dir, 'models'));
  args.push('--out', out, '--tracks', tracks);
  if (song) args.push('--song', path.resolve(song), '--song-out', songDir);
  console.log(`\n== ${c} ==`);
  const r = spawnSync(py, args, { stdio: 'inherit' });
  if (r.status !== 0) fail(`a medição de ${c} falhou (código ${r.status}).`);
  results.push(JSON.parse(fs.readFileSync(out, 'utf8')));
}

const device = results[0]?.dispositivo === 'cuda' ? 'GPU' : 'CPU';
const lines = [
  '# Vazamento por separador',
  '',
  `Gerado por \`pnpm quality\` em ${new Date().toISOString().slice(0, 10)} (${device}), até ${tracks} trechos por instrumento:`,
  'MUSDB18 7 s (gravações reais) e BabySlakh (10 s por música, sintetizado de MIDI), ambos CC-BY-4.0.',
  'Em dB: mediana (pior trecho). Vazamento, vazamento no resto, pausa e erro: menor é melhor. SDR: maior é melhor.',
  '',
  '| Instrumento | Separador | Vazamento | Vazamento no resto | Na pausa | Erro tocando | SDR | Trechos |',
  '|---|---|---|---|---|---|---|---|',
];
for (const key of Object.keys(LABELS)) {
  for (const r of results) {
    const m = r.instrumentos[key];
    if (!m) continue;
    const cell = (k) => `${fmt(m[k].mediana)} (${fmt(m[k].pior)})`;
    lines.push(
      `| ${LABELS[key]} | ${r.candidato} | ${cell('vazamento')} | ${cell('vazamento_no_resto')} | ${cell('pausa')} | ${cell('erro_tocando')} | ${cell('sdr')} | ${m.trechos} |`,
    );
  }
}
lines.push('', '| Separador | Tempo (s de processamento por s de áudio) |', '|---|---|');
for (const r of results) lines.push(`| ${r.candidato} | ${fmt(r.segundos_por_segundo_de_audio)} |`);

if (song) {
  const out = path.join(dir, 'resultado-musica.json');
  const r = spawnSync(
    py,
    [
      path.join(root, 'scripts', 'quality', 'measure.py'),
      '--song-metrics',
      songDir,
      '--song-candidates',
      candidates.join(','),
      '--song',
      path.resolve(song),
      '--out',
      out,
    ],
    { stdio: 'inherit' },
  );
  if (r.status !== 0) fail('a medição da música falhou.');
  const metrics = JSON.parse(fs.readFileSync(out, 'utf8'));
  lines.push(
    '',
    `## Música real: ${path.basename(song)}`,
    '',
    'Nível de cada faixa nos trechos em que todos os separadores concordam que o instrumento está ausente',
    '(dB relativos ao mix; menor é melhor). Faixas para ouvir em `fixtures/quality/musica/`.',
    '',
    '| Instrumento | Trechos ausentes (0,5 s) | ' + candidates.join(' | ') + ' |',
    '|---|---|' + candidates.map(() => '---').join('|') + '|',
  );
  for (const [stem, m] of Object.entries(metrics)) {
    lines.push(
      `| ${SONG_LABELS[stem]} | ${m.quadros_ausente} de ${m.quadros_total} | ` +
        candidates.map((c) => fmt(m.nivel_quando_ausente_db[c])).join(' | ') +
        ' |',
    );
  }
}
fs.writeFileSync(path.join(root, 'fixtures', 'quality.md'), `${lines.join('\n')}\n`);
console.log(`\n${lines.join('\n')}`);
