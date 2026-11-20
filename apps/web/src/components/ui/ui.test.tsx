import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';
import { ConfirmDialog } from './ConfirmDialog';
import { EmptyState } from './EmptyState';
import { ErrorAlert } from './ErrorAlert';
import { ProgressBar } from './ProgressBar';
import { SelectableCard } from './SelectableCard';
import { LoadingState, Spinner } from './Spinner';

describe('Button', () => {
  it('chama onClick e fica desabilitado e ocupado durante loading', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { rerender } = render(<Button onClick={onClick}>Salvar</Button>);
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(onClick).toHaveBeenCalledOnce();

    rerender(
      <Button onClick={onClick} loading>
        Salvar
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Salvar' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    await user.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('aplica a variante', () => {
    render(<Button variant="danger">Apagar</Button>);
    expect(screen.getByRole('button', { name: 'Apagar' })).toHaveClass('btn', 'btn-danger');
  });
});

describe('SelectableCard', () => {
  function Group() {
    const [value, setValue] = useState('');
    return (
      <fieldset>
        <legend>Instrumento</legend>
        {['Voz', 'Baixo', 'Bateria'].map((v) => (
          <SelectableCard key={v} name="inst" value={v} title={v} checked={value === v} onSelect={setValue} />
        ))}
        <output>{value || 'nenhum'}</output>
      </fieldset>
    );
  }

  it('seleção única por clique e por teclado', async () => {
    const user = userEvent.setup();
    render(<Group />);
    await user.click(screen.getByRole('radio', { name: 'Baixo' }));
    expect(screen.getByRole('radio', { name: 'Baixo' })).toBeChecked();
    expect(screen.getByRole('status')).toHaveTextContent('Baixo');

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Bateria' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Baixo' })).not.toBeChecked();
    expect(screen.getByRole('status')).toHaveTextContent('Bateria');
  });
});

describe('ProgressBar', () => {
  it('expõe o valor para tecnologias assistivas e limita a 0–100', () => {
    const { rerender } = render(<ProgressBar value={42.4} label="Separando" />);
    const bar = screen.getByRole('progressbar', { name: 'Separando' });
    expect(bar).toHaveAttribute('aria-valuenow', '42');
    expect(screen.getByText('42%')).toBeInTheDocument();
    rerender(<ProgressBar value={130} label="Separando" />);
    expect(bar).toHaveAttribute('aria-valuenow', '100');
  });

  it('modo indeterminado não informa valor', () => {
    render(<ProgressBar value={null} label="Preparando" />);
    expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow');
  });
});

describe('ErrorAlert, EmptyState e carregando', () => {
  it('ErrorAlert mostra detalhes expansíveis e ações', () => {
    render(
      <ErrorAlert
        title="Falha na separação"
        message="Memória insuficiente na GPU."
        details="CUDA out of memory"
        actions={<Button>Tentar de novo</Button>}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Falha na separação');
    expect(screen.getByText('CUDA out of memory')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
  });

  it('EmptyState e LoadingState', () => {
    render(
      <>
        <EmptyState title="Nenhuma separação" message="Faça a primeira." action={<Button>Começar</Button>} />
        <LoadingState message="Verificando o motor…" />
        <Spinner />
      </>,
    );
    expect(screen.getByRole('heading', { name: 'Nenhuma separação' })).toBeInTheDocument();
    expect(screen.getByText('Verificando o motor…')).toBeInTheDocument();
    expect(screen.getAllByRole('status')).toHaveLength(2);
  });
});

describe('ConfirmDialog', () => {
  it('abre como modal, confirma e cancela (inclusive com Esc)', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const { rerender } = render(
      <ConfirmDialog
        open={false}
        title="Remover?"
        confirmLabel="Remover"
        onConfirm={onConfirm}
        onCancel={onCancel}
      >
        <p>Esta ação não pode ser desfeita.</p>
      </ConfirmDialog>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    rerender(
      <ConfirmDialog
        open
        title="Remover?"
        confirmLabel="Remover"
        danger
        onConfirm={onConfirm}
        onCancel={onCancel}
      >
        <p>Esta ação não pode ser desfeita.</p>
      </ConfirmDialog>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Remover?' });
    expect(dialog).toHaveAttribute('open');
    await user.click(screen.getByRole('button', { name: 'Remover' }));
    expect(onConfirm).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onCancel).toHaveBeenCalledOnce();
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('enquanto ocupado não cancela e mostra confirmação em andamento', () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        busy
        title="Remover?"
        confirmLabel="Remover"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      >
        <p>x</p>
      </ConfirmDialog>,
    );
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remover' })).toHaveAttribute('aria-busy', 'true');
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
    expect(onCancel).not.toHaveBeenCalled();
  });
});
