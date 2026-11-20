import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { QueryError } from './QueryError';

describe('QueryError', () => {
  it('mostra título, mensagem e chama a nova tentativa', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <QueryError error={new Error('Sem acesso ao banco')} onRetry={onRetry} title="Falha no histórico" />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Falha no histórico');
    expect(screen.getByText('Sem acesso ao banco')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
