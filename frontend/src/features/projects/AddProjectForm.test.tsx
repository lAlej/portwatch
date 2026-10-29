import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AddProjectForm } from './AddProjectForm';
import { useProjects } from './store';

const add = vi.fn();

beforeEach(() => {
  add.mockReset();
  useProjects.setState({ add });
});

const urlInput = () => screen.getByLabelText('Clone URL');
const submit = () => screen.getByRole('button', { name: /Clone & add|Cloning…/ });

describe('AddProjectForm', () => {
  it('cannot be submitted without a url', async () => {
    const user = userEvent.setup();
    render(<AddProjectForm />);
    expect(submit()).toBeDisabled();

    await user.type(urlInput(), '   ');
    expect(submit()).toBeDisabled();

    await user.type(urlInput(), 'https://github.com/me/app.git');
    expect(submit()).toBeEnabled();
  });

  it('clones with the trimmed url and clears the form on success', async () => {
    add.mockResolvedValue({});
    const user = userEvent.setup();
    render(<AddProjectForm />);

    await user.type(urlInput(), '  git@github.com:me/private.git  ');
    await user.click(submit());

    expect(add).toHaveBeenCalledWith('git@github.com:me/private.git', []);
    expect(urlInput()).toHaveValue('');
  });

  it('sends the environment variables that were entered', async () => {
    add.mockResolvedValue({});
    const user = userEvent.setup();
    render(<AddProjectForm />);

    await user.type(urlInput(), 'https://github.com/me/app.git');
    await user.click(screen.getByRole('button', { name: /Add variable/ }));
    await user.type(screen.getByPlaceholderText('KEY'), 'PORT');
    await user.type(screen.getByPlaceholderText('value'), '8080');
    await user.click(submit());

    expect(add).toHaveBeenCalledWith('https://github.com/me/app.git', [{ key: 'PORT', value: '8080' }]);
    expect(screen.queryByPlaceholderText('KEY')).not.toBeInTheDocument(); // reset after success
  });

  it('shows the server error and keeps what the user typed', async () => {
    add.mockRejectedValue(new Error('git clone failed: Permission denied (publickey)'));
    const user = userEvent.setup();
    render(<AddProjectForm />);

    await user.type(urlInput(), 'git@github.com:me/private.git');
    await user.click(submit());

    expect(await screen.findByText(/Permission denied \(publickey\)/)).toBeInTheDocument();
    expect(urlInput()).toHaveValue('git@github.com:me/private.git');
    expect(submit()).toBeEnabled();
  });

  it('falls back to a generic message for non-Error failures', async () => {
    add.mockRejectedValue('boom');
    const user = userEvent.setup();
    render(<AddProjectForm />);
    await user.type(urlInput(), 'https://x.test/a.git');
    await user.click(submit());
    expect(await screen.findByText('Failed to add project')).toBeInTheDocument();
  });

  it('clears an old error when the user tries again', async () => {
    add.mockRejectedValueOnce(new Error('first failure')).mockResolvedValueOnce({});
    const user = userEvent.setup();
    render(<AddProjectForm />);
    await user.type(urlInput(), 'https://x.test/a.git');
    await user.click(submit());
    expect(await screen.findByText('first failure')).toBeInTheDocument();

    await user.click(submit());
    expect(screen.queryByText('first failure')).not.toBeInTheDocument();
  });

  it('shows progress and locks the form while cloning', async () => {
    let finish!: () => void;
    add.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    const user = userEvent.setup();
    render(<AddProjectForm />);
    await user.type(urlInput(), 'https://x.test/a.git');
    await user.click(submit());

    expect(await screen.findByRole('button', { name: 'Cloning…' })).toBeDisabled();
    expect(urlInput()).toBeDisabled();

    finish();
    expect(await screen.findByRole('button', { name: 'Clone & add' })).toBeDisabled(); // empty again
  });

  it('submits with Enter', async () => {
    add.mockResolvedValue({});
    const user = userEvent.setup();
    render(<AddProjectForm />);
    await user.type(urlInput(), 'https://x.test/a.git{Enter}');
    expect(add).toHaveBeenCalledTimes(1);
  });
});
