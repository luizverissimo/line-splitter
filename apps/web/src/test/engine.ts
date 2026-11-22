import type { EngineModel } from '@line-splitter/shared';

/** Os dois modelos do motor (DEC-017), todos baixados ou todos faltando, como o main os descreve. */
export function testModels(ok: boolean): EngineModel[] {
  return [
    {
      id: 'melband-kim-ft2-bleedless',
      name: 'MelBand-RoFormer Kim FT2 Bleedless',
      instruments: ['Voz'],
      sizeBytes: 913_103_089,
      ok,
      detail: ok ? 'Baixado (870,8 MB)' : 'Não baixado (870,8 MB).',
    },
    {
      id: 'bs-roformer-sw',
      name: 'BS-Roformer-SW',
      instruments: ['Bateria', 'Baixo', 'Guitarra/Violão', 'Piano/Teclado'],
      sizeBytes: 699_416_805,
      ok,
      detail: ok ? 'Baixado (667,0 MB)' : 'Não baixado (667,0 MB).',
    },
  ];
}
