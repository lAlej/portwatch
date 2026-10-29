import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { EnvVar } from '@/shared/lib/schemas';
import { EnvVarsEditor } from './EnvVarsEditor';

/** Controlled wrapper so typing behaves like it does inside the real forms. */
function Harness({ initial = [], onChange, disabled }: { initial?: EnvVar[]; onChange?: (v: EnvVar[]) => void; disabled?: boolean }) {
  const [value, setValue] = useState<EnvVar[]>(initial);
  return (
    <EnvVarsEditor
      value={value}
      disabled={disabled}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

describe('EnvVarsEditor', () => {
  it('explains how to add the first variable when there are none', () => {
    render(<Harness />);
    expect(screen.getByText(/No env vars/)).toBeInTheDocument();
    expect(screen.queryAllByPlaceholderText('KEY')).toHaveLength(0);
  });

  it('adds an empty row', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: /Add variable/ }));

    expect(onChange).toHaveBeenLastCalledWith([{ key: '', value: '' }]);
    expect(screen.getByPlaceholderText('KEY')).toBeInTheDocument();
    expect(screen.queryByText(/No env vars/)).not.toBeInTheDocument();
  });

  it('edits the key and the value of a row independently', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness initial={[{ key: '', value: '' }]} onChange={onChange} />);

    await user.type(screen.getByPlaceholderText('KEY'), 'API_URL');
    await user.type(screen.getByPlaceholderText('value'), 'https://x.test');

    expect(onChange).toHaveBeenLastCalledWith([{ key: 'API_URL', value: 'https://x.test' }]);
  });

  it('keeps the other rows intact when one changes', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Harness
        initial={[
          { key: 'A', value: '1' },
          { key: 'B', value: '2' },
        ]}
        onChange={onChange}
      />,
    );

    await user.type(screen.getAllByPlaceholderText('value')[1]!, '3');

    expect(onChange).toHaveBeenLastCalledWith([
      { key: 'A', value: '1' },
      { key: 'B', value: '23' },
    ]);
  });

  it('removes only the chosen row', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Harness
        initial={[
          { key: 'A', value: '1' },
          { key: 'B', value: '2' },
          { key: 'C', value: '3' },
        ]}
        onChange={onChange}
      />,
    );

    await user.click(screen.getAllByRole('button', { name: 'Remove variable' })[1]!);

    expect(onChange).toHaveBeenLastCalledWith([
      { key: 'A', value: '1' },
      { key: 'C', value: '3' },
    ]);
  });

  it('shows secrets as plain text values but never autocompletes or spellchecks them', () => {
    render(<Harness initial={[{ key: 'TOKEN', value: 's3cret' }]} />);
    const value = screen.getByPlaceholderText('value');
    expect(value).toHaveAttribute('autocomplete', 'off');
    expect(value).toHaveAttribute('spellcheck', 'false');
  });

  it('locks every control while the form is busy', () => {
    render(<Harness disabled initial={[{ key: 'A', value: '1' }]} />);
    expect(screen.getByRole('button', { name: /Add variable/ })).toBeDisabled();
    expect(screen.getByPlaceholderText('KEY')).toBeDisabled();
    expect(screen.getByPlaceholderText('value')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove variable' })).toBeDisabled();
  });
});
