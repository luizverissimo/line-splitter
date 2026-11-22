"""Mede o vazamento de um separador ("candidato") em músicas com faixas verdadeiras (DEC-017).

Uso:
  python measure.py --candidate <nome> --musdb <pasta MUSDB18-7> --slakh <pasta babyslakh_16k>
                    --models <pasta> --out <json> [--tracks N] [--song arquivo --song-out pasta]
  python measure.py --song-metrics <pasta com os MP3 da música> --song arquivo --out <json>

Conjuntos (ambos CC-BY-4.0):
- MUSDB18 7 s (gravações reais): voz, bateria, baixo;
- BabySlakh 16 kHz (sintetizado de MIDI, 20 músicas): guitarra e piano (e de novo bateria/baixo).

Métricas por instrumento (dB; mediana e pior trecho):
- vazamento: na faixa do instrumento, parte explicada pelo resto da música relativa à parte explicada pelo
  instrumento (mínimos quadrados) — menor é melhor;
- vazamento_no_resto: o contrário, o instrumento que sobra na faixa "sem o instrumento" — menor é melhor;
- pausa: mixagem refeita com o instrumento silenciado na segunda metade; energia da faixa estimada nessa metade
  relativa ao acompanhamento — vazamento puro, sem a reverberação do próprio instrumento — menor é melhor;
- erro_tocando: energia de (estimado − verdadeiro) relativa ao instrumento na primeira metade — menor é melhor;
- sdr: SDR clássico — maior é melhor.
Na música real (sem faixa verdadeira), --song-metrics mede o nível de cada faixa estimada nos trechos em que
TODOS os candidatos concordam que o instrumento está ausente (≥ 20 dB abaixo do mix) — menor é melhor.
"""
import argparse
import glob
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time

import numpy as np
import soundfile as sf

SR = 44100
DEMUCS_APP = {'segment_size': 'Default', 'shifts': 1, 'overlap': 0.25, 'segments_enabled': True}
DEMUCS_HQ = {'segment_size': 'Default', 'shifts': 4, 'overlap': 0.5, 'segments_enabled': True}
ALL5 = ['vocals', 'drums', 'bass', 'guitar', 'piano']
CANDIDATES = {
    # nome: (arquivo do modelo no audio-separator, instrumentos, parâmetros do Demucs)
    'htdemucs_6s': ('htdemucs_6s.yaml', ALL5, DEMUCS_APP),  # o motor atual do app
    'htdemucs_6s_shifts': ('htdemucs_6s.yaml', ALL5, DEMUCS_HQ),
    'htdemucs_ft': ('htdemucs_ft.yaml', ['vocals', 'drums', 'bass'], DEMUCS_APP),
    'bs_roformer_sw': ('BS-Roformer-SW.ckpt', ALL5, None),
    'melband_kim_ft2_bleedless': ('mel_band_roformer_kim_ft2_bleedless_unwa.ckpt', ['vocals'], None),
    'bs_roformer_1297': ('model_bs_roformer_ep_317_sdr_12.9755.ckpt', ['vocals'], None),
    # O próprio app: o executor da separação (apps/desktop/src/main/separation/runner.ts) com o modelo que o
    # app escolhe para cada instrumento (--app-runner e --app-models, preparados pelo quality.mjs).
    'app': ('(modelo do app por instrumento)', ALL5, None),
}
MUSDB_STREAMS = {'mix': 0, 'drums': 1, 'bass': 2, 'other': 3, 'vocals': 4}
SLAKH_CLASS = {'Guitar': 'guitar', 'Piano': 'piano', 'Drums': 'drums', 'Bass': 'bass'}
SLAKH_WINDOW_S = 10


def decode(src, dst, stream=None):
    cmd = ['ffmpeg', '-v', 'error', '-y', '-i', src]
    if stream is not None:
        cmd += ['-map', f'0:a:{stream}']
    subprocess.run(cmd + ['-ar', str(SR), '-ac', '2', '-c:a', 'pcm_f32le', dst], check=True)
    audio, _ = sf.read(dst, dtype='float32')
    return audio


def db(num, den):
    return float(10 * np.log10((num + 1e-12) / (den + 1e-12)))


def rms_frames(a, hop):
    return np.array([np.sqrt(np.mean(a[i : i + hop] ** 2)) + 1e-9 for i in range(0, len(a) - hop + 1, hop)])


class Separator:
    def __init__(self, model_file, models_dir, work, demucs_params):
        from audio_separator.separator import Separator as AS

        kwargs = {'output_dir': work, 'output_format': 'WAV', 'model_file_dir': models_dir, 'log_level': 40}
        if demucs_params:
            kwargs['demucs_params'] = demucs_params
        self.work = work
        self.sep = AS(**kwargs)
        self.sep.load_model(model_filename=model_file)

    def run(self, wav_path, stems):
        files = self.sep.separate(wav_path)
        files = [f if os.path.isabs(f) else os.path.join(self.work, f) for f in files]
        out = {}
        for stem in stems:
            match = [f for f in files if f'({stem})' in os.path.basename(f).lower()]
            if not match:
                raise RuntimeError(f'o modelo não gerou a faixa {stem}: {files}')
            out[stem], _ = sf.read(match[0], dtype='float32')
        for f in files:
            os.remove(f)
        return out


class AppRunner:
    """Separa como o app: chama o executor do app num processo Python próprio, como o processo principal faz."""

    def __init__(self, runner, models_by_stem, models_dir, work):
        self.runner, self.models, self.models_dir, self.work = runner, models_by_stem, models_dir, work

    def run(self, wav_path, stems):
        out = {}
        for stem in stems:
            checkpoint, config = self.models[stem]
            job = tempfile.mkdtemp(prefix='app-', dir=self.work)
            r = subprocess.run(
                [sys.executable, self.runner, checkpoint, config, self.models_dir, job, wav_path, stem],
                capture_output=True,
                text=True,
            )
            if r.returncode != 0 or 'LINE_SPLITTER_SEPARACAO_OK' not in r.stdout:
                raise RuntimeError(f'executor do app falhou ({stem}): {r.stderr[-2000:]}')
            out[stem], _ = sf.read(os.path.join(job, 'instrumento.wav'), dtype='float32')
            shutil.rmtree(job, ignore_errors=True)
        return out


def musdb_excerpts(root, n, work):
    tracks = sorted(glob.glob(os.path.join(root, 'test', '*.stem.mp4')))[:n]
    if len(tracks) < n:
        sys.exit(f'Trechos do MUSDB18 não encontrados em {root}/test (rode pelo "pnpm quality").')
    for t in tracks:
        st = {k: decode(t, os.path.join(work, f'musdb-{k}.wav'), v) for k, v in MUSDB_STREAMS.items() if k != 'mix'}
        size = min(len(x) for x in st.values())
        yield os.path.basename(t), {k: x[:size] for k, x in st.items()}


def slakh_excerpts(root, n, work, target):
    """Uma janela de 10 s por música em que o instrumento-alvo e o resto estão tocando."""
    tracks = sorted(glob.glob(os.path.join(root, 'Track*')))
    if not tracks:
        sys.exit(f'BabySlakh não encontrado em {root} (rode pelo "pnpm quality").')
    found = 0
    for t in tracks:
        if found >= n:
            break
        meta = open(os.path.join(t, 'metadata.yaml'), encoding='utf-8').read()
        classes = dict(re.findall(r'^  (S\d+):\n(?:    .*\n)*?    inst_class: (.+)$', meta, re.M))
        stems = {}
        for sid, cls in classes.items():
            wav = os.path.join(t, 'stems', f'{sid}.wav')
            if not os.path.exists(wav):
                continue
            key = SLAKH_CLASS.get(cls.strip(), 'other')
            audio = decode(wav, os.path.join(work, 'slakh-stem.wav'))
            stems[key] = stems.get(key, 0) + audio
        if target not in stems:
            continue
        size = min(len(x) for x in stems.values())
        stems = {k: x[:size] for k, x in stems.items()}
        rest = sum(x for k, x in stems.items() if k != target)
        hop = SR * SLAKH_WINDOW_S
        tr, rr = rms_frames(stems[target], hop), rms_frames(rest, hop)
        score = np.minimum(20 * np.log10(tr), 20 * np.log10(rr))
        best = int(np.argmax(score))
        if score[best] < -40:
            continue
        a, b = best * hop, best * hop + hop
        found += 1
        yield f'{os.path.basename(t)}@{best * SLAKH_WINDOW_S}s', {k: x[a:b] for k, x in stems.items()}


def evaluate(sep, st, target, work):
    """Métricas de um instrumento num trecho com faixas verdadeiras."""
    n = len(st[target])
    others = sum(x for k, x in st.items() if k != target)
    mix = others + st[target]
    p = os.path.join(work, 'mix.wav')
    sf.write(p, mix, SR, subtype='FLOAT')
    t0 = time.time()
    e = sep.run(p, [target])[target][:n]
    elapsed = time.time() - t0
    target_a = st[target][: len(e)]
    others = others[: len(e)]
    basis = np.stack([target_a.ravel(), others.ravel()], 1)
    coef, *_ = np.linalg.lstsq(basis, e.ravel(), rcond=None)
    leak = db(np.sum((coef[1] * others) ** 2), np.sum((coef[0] * target_a) ** 2))
    rest_e = mix[: len(e)] - e
    coef_r, *_ = np.linalg.lstsq(basis, rest_e.ravel(), rcond=None)
    leak_rest = db(np.sum((coef_r[0] * target_a) ** 2), np.sum((coef_r[1] * others) ** 2))
    sdr = db(np.sum(target_a**2), np.sum((target_a - e) ** 2))
    h, q = len(e) // 2, SR // 2
    muted = target_a.copy()
    muted[h:] = 0
    sf.write(p, others + muted, SR, subtype='FLOAT')
    ep = sep.run(p, [target])[target][: len(e)]
    pause = db(np.sum(ep[h + q :] ** 2), np.sum(others[h + q :] ** 2))
    err = db(np.sum((ep[: h - q] - muted[: h - q]) ** 2), np.sum(muted[: h - q] ** 2))
    return {'vazamento': leak, 'vazamento_no_resto': leak_rest, 'pausa': pause, 'erro_tocando': err, 'sdr': sdr}, elapsed / (n / SR)


def summarize(values):
    out = {}
    for m in ['vazamento', 'vazamento_no_resto', 'pausa', 'erro_tocando', 'sdr']:
        xs = [v[m] for v in values]
        worst = min(xs) if m == 'sdr' else max(xs)
        out[m] = {'mediana': float(np.median(xs)), 'pior': float(worst)}
    return out


def measure(a):
    model_file, stems, demucs_params = CANDIDATES[a.candidate]
    work = tempfile.mkdtemp(prefix='ls-quality-')
    if a.candidate == 'app':
        if not a.app_runner or not a.app_models:
            sys.exit('O candidato "app" exige --app-runner e --app-models (rode pelo "pnpm quality").')
        sep = AppRunner(a.app_runner, json.loads(a.app_models), a.models, work)
    else:
        sep = Separator(model_file, a.models, work, demucs_params)
    rows, speed = {}, []
    # MUSDB: voz, bateria, baixo (gravações reais).
    for name, st in musdb_excerpts(a.musdb, a.tracks, work):
        for target in [s for s in ['vocals', 'drums', 'bass'] if s in stems]:
            r, s = evaluate(sep, st, target, work)
            rows.setdefault(('musdb', target), []).append(r)
            speed.append(s)
        print(f'{a.candidate}: MUSDB {name}', flush=True)
    # BabySlakh: guitarra e piano.
    for target in [s for s in ['guitar', 'piano'] if s in stems]:
        for name, st in slakh_excerpts(a.slakh, a.tracks, work, target):
            r, s = evaluate(sep, st, target, work)
            rows.setdefault(('slakh', target), []).append(r)
            speed.append(s)
            print(f'{a.candidate}: BabySlakh {target} {name}', flush=True)
    summary = {
        'candidato': a.candidate,
        'modelo': model_file,
        'parametros_demucs': demucs_params,
        'segundos_por_segundo_de_audio': float(np.mean(speed)),
        'dispositivo': 'cuda' if __import__('torch').cuda.is_available() else 'cpu',
        'instrumentos': {
            f'{ds}:{t}': {'trechos': len(v), **summarize(v)} for (ds, t), v in rows.items()
        },
    }
    if a.song:
        os.makedirs(a.song_out, exist_ok=True)
        mix = decode(a.song, os.path.join(work, 'musica.wav'))  # decode grava WAV de ponto flutuante
        est = sep.run(os.path.join(work, 'musica.wav'), stems)
        for s, e in est.items():
            n = min(len(e), len(mix))
            for name, audio in [(f'{s}-{a.candidate}', e[:n]), (f'sem-{s}-{a.candidate}', mix[:n] - e[:n])]:
                w = os.path.join(work, name + '.wav')
                sf.write(w, audio, SR)
                subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', w, '-b:a', '192k', os.path.join(a.song_out, name + '.mp3')], check=True)
                os.remove(w)
    with open(a.out, 'w', encoding='utf-8') as f:
        json.dump(summary, f, indent=1, ensure_ascii=False)


def song_metrics(a):
    """Nível de cada faixa estimada nos trechos em que todos os candidatos dizem que o instrumento está ausente."""
    work = tempfile.mkdtemp(prefix='ls-quality-song-')
    mix = decode(a.song, os.path.join(work, 'mix.wav'))
    hop = SR // 2
    mix_r = rms_frames(mix, hop)
    result = {}
    for stem in ALL5:
        # Só os candidatos desta execução (a pasta pode ter MP3 de execuções anteriores).
        files = [(c, os.path.join(a.song_metrics, f'{stem}-{c}.mp3')) for c in a.song_candidates.split(',')]
        files = [(c, f) for c, f in files if os.path.exists(f)]
        if len(files) < 2:
            continue
        rel = {}
        for cand, f in files:
            r = rms_frames(decode(f, os.path.join(work, 'est.wav')), hop)
            n = min(len(r), len(mix_r))
            rel[cand] = 20 * np.log10(r[:n] / mix_r[:n])
        n = min(len(v) for v in rel.values())
        audible = 20 * np.log10(mix_r[:n]) > -45
        absent = np.all(np.stack([v[:n] < -20 for v in rel.values()]), 0) & audible
        result[stem] = {
            'quadros_ausente': int(absent.sum()),
            'quadros_total': int(n),
            'nivel_quando_ausente_db': {c: (float(np.median(v[:n][absent])) if absent.any() else None) for c, v in rel.items()},
        }
    with open(a.out, 'w', encoding='utf-8') as f:
        json.dump(result, f, indent=1, ensure_ascii=False)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--candidate', choices=sorted(CANDIDATES))
    ap.add_argument('--musdb')
    ap.add_argument('--slakh')
    ap.add_argument('--models')
    ap.add_argument('--out', required=True)
    ap.add_argument('--tracks', type=int, default=12)
    ap.add_argument('--song')
    ap.add_argument('--song-out')
    ap.add_argument('--song-metrics')
    ap.add_argument('--song-candidates', help='candidatos (separados por vírgula) considerados no --song-metrics')
    ap.add_argument('--app-runner', help='arquivo .py com o executor da separação do app')
    ap.add_argument('--app-models', help='JSON {instrumento: [pesos, configuração]} com o modelo do app por instrumento')
    a = ap.parse_args()
    if a.song_metrics:
        if not a.song_candidates:
            ap.error('--song-metrics exige --song-candidates')
        song_metrics(a)
    elif a.candidate:
        measure(a)
    else:
        ap.error('informe --candidate ou --song-metrics')


if __name__ == '__main__':
    main()
