import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DayForm } from './DayForm';

describe('DayForm', () => {
  it('blocks an invalid date before calling the API', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<DayForm submitLabel="Adicionar dia" onSubmit={onSubmit} />);
    await user.clear(screen.getByLabelText('Data'));
    await user.click(screen.getByRole('button', { name: 'Adicionar dia' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('data válida');
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
