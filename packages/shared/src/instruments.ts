import { z } from 'zod';

/** Stems do modelo htdemucs_6s que o usuário pode isolar (PRD §5.3). */
export const STEMS = ['vocals', 'drums', 'bass', 'guitar', 'piano'] as const;
export const stemSchema = z.enum(STEMS, { error: 'Escolha um instrumento válido.' });
export type Stem = z.infer<typeof stemSchema>;

export interface InstrumentInfo {
  stem: Stem;
  /** Nome do cartão na tela. */
  label: string;
  /** Nome usado nos arquivos de saída: "<nome> - <fileLabel>.mp3" e "<nome> - sem <fileLabel>.mp3". */
  fileLabel: string;
  description: string;
}

export const INSTRUMENTS: readonly InstrumentInfo[] = [
  { stem: 'vocals', label: 'Voz', fileLabel: 'Voz', description: 'Canto e falas' },
  { stem: 'drums', label: 'Bateria', fileLabel: 'Bateria', description: 'Bateria e percussão' },
  { stem: 'bass', label: 'Baixo', fileLabel: 'Baixo', description: 'Linha de baixo' },
  {
    stem: 'guitar',
    label: 'Guitarra/Violão',
    fileLabel: 'Guitarra-Violão',
    description: 'Guitarras e violões',
  },
  { stem: 'piano', label: 'Piano/Teclado', fileLabel: 'Piano-Teclado', description: 'Piano e teclados' },
];

export function instrumentOf(stem: Stem): InstrumentInfo {
  const found = INSTRUMENTS.find((i) => i.stem === stem);
  if (!found) throw new Error(`Instrumento desconhecido: ${stem}`);
  return found;
}
