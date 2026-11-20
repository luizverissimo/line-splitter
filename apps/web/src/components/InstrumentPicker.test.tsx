import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import type { Stem } from '@line-splitter/shared';
import { describe, expect, it } from 'vitest';
import { InstrumentPicker } from './InstrumentPicker';

function Harness() {
  const [stem, setStem] = useState<Stem | null>(null);
  return (
    <>
      <InstrumentPicker value={stem} onChange={setStem} />
      <output>{stem ?? 'nenhum'}</output>
    </>
  );
}

describe('InstrumentPicker', () => {
  it('mostra os 5 instrumentos do PRD com seleção única', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const radios = screen.getAllByRole('radio');
    expect(radios.map((r) => r.closest('label')?.textContent)).toEqual([
      'VozCanto e falas',
      'BateriaBateria e percussão',
      'BaixoLinha de baixo',
      'Guitarra/ViolãoGuitarras e violões',
      'Piano/TecladoPiano e teclados',
    ]);
    await user.click(screen.getByRole('radio', { name: /Baixo/ }));
    expect(screen.getByRole('status')).toHaveTextContent('bass');
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('status')).toHaveTextContent('guitar');
    expect(screen.getAllByRole('radio').filter((r) => (r as HTMLInputElement).checked)).toHaveLength(1);
  });

  it('desabilitado bloqueia a escolha', () => {
    render(<InstrumentPicker value={null} onChange={() => undefined} disabled />);
    for (const r of screen.getAllByRole('radio')) expect(r).toBeDisabled();
  });
});
