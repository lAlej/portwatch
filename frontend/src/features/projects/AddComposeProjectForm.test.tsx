import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AddComposeProjectForm } from './AddComposeProjectForm';
import { useProjects } from './store';

const createAdHoc = vi.fn();
const COMPOSE = 'services:\n  web:\n    image: nginx:alpine\n';

beforeEach(() => {
  createAdHoc.mockReset();
  useProjects.setState({ createAdHoc });
});

const nameInput = () => screen.getByLabelText('Project name');
const composeInput = () => screen.getByLabelText('Compose file content');
const submit = () => screen.getByRole('button', { name: /Create & start|Creating…/ });

// user.type treats "{" as a key-descriptor; paste is the faithful way to enter YAML.
async function pasteCompose(user: ReturnType<typeof userEvent.setup>, text = COMPOSE) {
  await user.click(composeInput());
  await user.paste(text);
}

describe('AddComposeProjectForm', () => {
  it('needs both a name and a compose body', async () => {
    const user = userEvent.setup();
    render(<AddComposeProjectForm />);
    expect(submit()).toBeDisabled();

    await user.type(nameInput(), 'web');
    expect(submit()).toBeDisabled();

    await pasteCompose(user, '   \n  ');
    expect(submit()).toBeDisabled(); // whitespace-only is not a compose file

    await pasteCompose(user);
    expect(submit()).toBeEnabled();
  });

  it('does not accept a blank name even with compose content', async () => {
    const user = userEvent.setup();
    render(<AddComposeProjectForm />);
    await user.type(nameInput(), '   ');
    await pasteCompose(user);
    expect(submit()).toBeDisabled();
  });

  it('creates the project with the trimmed name and the compose text untouched', async () => {
    createAdHoc.mockResolvedValue({});
    const onCreated = vi.fn();
    const user = userEvent.setup();
    render(<AddComposeProjectForm onCreated={onCreated} />);

    await user.type(nameInput(), '  gluetun ');
    await pasteCompose(user);
    await user.click(submit());

    expect(createAdHoc).toHaveBeenCalledWith('gluetun', COMPOSE, []);
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(nameInput()).toHaveValue('');
    expect(composeInput()).toHaveValue('');
  });

  it('includes env vars and resets them after creating', async () => {
    createAdHoc.mockResolvedValue({});
    const user = userEvent.setup();
    render(<AddComposeProjectForm />);
    await user.type(nameInput(), 'web');
    await pasteCompose(user);
    await user.click(screen.getByRole('button', { name: /Add variable/ }));
    await user.type(screen.getByPlaceholderText('KEY'), 'TZ');
    await user.type(screen.getByPlaceholderText('value'), 'UTC');
    await user.click(submit());

    expect(createAdHoc).toHaveBeenCalledWith('web', COMPOSE, [{ key: 'TZ', value: 'UTC' }]);
    expect(screen.queryByPlaceholderText('KEY')).not.toBeInTheDocument();
  });

  it('keeps the input, shows the error and does not call onCreated when the server refuses', async () => {
    createAdHoc.mockRejectedValue(new Error('Project "web" already exists'));
    const onCreated = vi.fn();
    const user = userEvent.setup();
    render(<AddComposeProjectForm onCreated={onCreated} />);
    await user.type(nameInput(), 'web');
    await pasteCompose(user);
    await user.click(submit());

    expect(await screen.findByText('Project "web" already exists')).toBeInTheDocument();
    expect(onCreated).not.toHaveBeenCalled();
    expect(nameInput()).toHaveValue('web');
    expect(composeInput()).toHaveValue(COMPOSE);
  });

  it('shows progress and locks every field while creating', async () => {
    let finish!: () => void;
    createAdHoc.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    const user = userEvent.setup();
    render(<AddComposeProjectForm />);
    await user.type(nameInput(), 'web');
    await pasteCompose(user);
    await user.click(submit());

    expect(await screen.findByRole('button', { name: 'Creating…' })).toBeDisabled();
    expect(nameInput()).toBeDisabled();
    expect(composeInput()).toBeDisabled();
    finish();
    await screen.findByRole('button', { name: 'Create & start' });
  });
});
