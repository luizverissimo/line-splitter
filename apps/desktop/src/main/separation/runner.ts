/**
 * Executor da separação (DEC-017), rodado com o Python do motor: `python -c RUNNER_SCRIPT <args>`.
 *
 * Carrega o modelo direto da pasta do motor — sem a rotina de download do audio-separator, que consulta o
 * GitHub mesmo com o modelo no disco —, separa só a faixa pedida e calcula o "resto" como mix − faixa.
 * A entrada é um WAV de ponto flutuante (convertido antes pelo FFmpeg), então a saída também é de ponto
 * flutuante e sem normalização: mix − faixa é exato, sem corte nem mudança de volume.
 *
 * Argumentos: <pesos> <configuração> <pasta dos modelos> <pasta de trabalho> <mix.wav> <instrumento>
 * Saída: <pasta de trabalho>/instrumento.wav e resto.wav; a última linha impressa é RUNNER_OK.
 */
export const RUNNER_OK = 'LINE_SPLITTER_SEPARACAO_OK';

export const RUNNER_SCRIPT = [
  'import logging, os, sys',
  'import soundfile as sf',
  'from audio_separator.separator import Separator',
  'checkpoint, config, models_dir, work, mix_path, stem = sys.argv[1:7]',
  'out_dir = os.path.join(work, "faixas")',
  'os.makedirs(out_dir, exist_ok=True)',
  'sep = Separator(output_dir=out_dir, output_format="WAV", model_file_dir=models_dir, log_level=logging.WARNING,',
  '                use_soundfile=True, output_single_stem=stem)',
  // O construtor só aceita limiar ≤ 1 (e reduz o volume de faixas com pico acima dele); o valor é lido ao
  // carregar o modelo, então um limiar alto aqui desliga a normalização e mantém mix − faixa exato.
  'sep.normalization_threshold = 1000.0',
  'model_path = os.path.join(models_dir, checkpoint)',
  'config_path = os.path.join(models_dir, config)',
  'for f in (model_path, config_path):',
  '    if not os.path.isfile(f): raise FileNotFoundError("Arquivo do modelo ausente: " + f)',
  'sep.download_model_files = lambda _name: (checkpoint, "MDXC", checkpoint, model_path, config_path)',
  'sep.load_model(model_filename=checkpoint)',
  'outputs = [o if os.path.isabs(o) else os.path.join(out_dir, o) for o in sep.separate(mix_path)]',
  'match = [o for o in outputs if "(" + stem + ")" in os.path.basename(o).lower()]',
  'if not match: raise RuntimeError("O separador não gerou a faixa " + stem + ": " + repr(outputs))',
  'mix, sr = sf.read(mix_path, dtype="float32", always_2d=True)',
  'est, sr_est = sf.read(match[0], dtype="float32", always_2d=True)',
  'if sr_est != sr: raise RuntimeError("Taxas de amostragem diferentes: %d e %d" % (sr, sr_est))',
  'n = min(len(mix), len(est))',
  'sf.write(os.path.join(work, "instrumento.wav"), est[:n], sr, subtype="FLOAT")',
  'sf.write(os.path.join(work, "resto.wav"), mix[:n] - est[:n], sr, subtype="FLOAT")',
  `print("${RUNNER_OK}", flush=True)`,
].join('\n');

/** Último percentual de uma barra do tqdm (o audio-separator imprime "NN%|" enquanto separa). */
export function parseSeparatorProgress(chunk: string): number | null {
  let last: number | null = null;
  for (const m of chunk.matchAll(/(\d{1,3})%\|/g)) last = Number(m[1]);
  return last !== null && last >= 0 && last <= 100 ? last : null;
}
