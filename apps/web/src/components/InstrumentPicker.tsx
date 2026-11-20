import { INSTRUMENTS, type Stem } from '@line-splitter/shared';
import { Drum, Guitar, Mic, Piano, Waves } from 'lucide-react';
import type { ReactNode } from 'react';
import { SelectableCard } from './ui';

const ICONS: Record<Stem, ReactNode> = {
  vocals: <Mic size={28} />,
  drums: <Drum size={28} />,
  bass: <Waves size={28} />,
  guitar: <Guitar size={28} />,
  piano: <Piano size={28} />,
};

interface Props {
  value: Stem | null;
  onChange: (stem: Stem) => void;
  disabled?: boolean;
}

/** Escolha do instrumento a separar: seleção única, operável por teclado (setas) e leitor de tela. */
export function InstrumentPicker({ value, onChange, disabled = false }: Props) {
  return (
    <fieldset className="instrument-picker" disabled={disabled}>
      <legend>Qual instrumento você quer separar?</legend>
      <div className="instrument-grid">
        {INSTRUMENTS.map((i) => (
          <SelectableCard
            key={i.stem}
            name="instrumento"
            value={i.stem}
            checked={value === i.stem}
            onSelect={() => onChange(i.stem)}
            title={i.label}
            description={i.description}
            icon={ICONS[i.stem]}
            disabled={disabled}
          />
        ))}
      </div>
    </fieldset>
  );
}
