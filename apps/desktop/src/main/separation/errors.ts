/** O PyTorch não conseguiu ler os pesos do modelo (arquivo truncado ou trocado). */
export const isCorruptedModel = (log: string) =>
  /ModelLoadingError|Invalid checksum|PytorchStreamReader failed|failed finding central directory|invalid load key|UnpicklingError|unexpected EOF|legacy \.tar format|Failed to load Roformer model/i.test(
    log,
  );

/** Traduz a saída do separador/PyTorch/FFmpeg numa mensagem para o usuário. */
export function explainEngineFailure(log: string): string {
  if (/CUDA out of memory|OutOfMemoryError|CUBLAS_STATUS_ALLOC_FAILED/i.test(log)) {
    return 'Memória da GPU insuficiente para esta música. Escolha "CPU" em Configurações e tente de novo.';
  }
  if (/MemoryError|Cannot allocate memory|std::bad_alloc|DefaultCPUAllocator: can't allocate/i.test(log)) {
    return 'Memória RAM insuficiente para separar esta música. Feche outros programas e tente de novo.';
  }
  if (
    /LoadAudioError|Could not load file|could not read the file|Invalid data found|Error opening input|could not open/i.test(
      log,
    )
  ) {
    return 'O motor não conseguiu ler este arquivo de áudio. Ele pode estar corrompido.';
  }
  if (isCorruptedModel(log)) {
    return 'O arquivo do modelo está corrompido. Baixe os modelos de novo na tela Motor.';
  }
  if (/No module named|ModuleNotFoundError/i.test(log)) {
    return 'O motor está incompleto. Reinstale o motor em Configurações.';
  }
  if (/Killed|SIGKILL|SIGTERM|terminou com SIG/i.test(log)) {
    return 'O processo de separação foi encerrado inesperadamente.';
  }
  return 'A separação falhou. Veja o log técnico para os detalhes.';
}
