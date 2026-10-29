import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '@/shared/lib/schemas';
import { EditEnvModal } from './EditEnvModal';
import { useProjects } from './store';

const updateEnv = vi.fn();

const project = (overrides: Partial<Project> = {}): Project => ({
  id: 'p1',
  name: 'shop',
  cloneUrl: 'https://github.com/me/shop.git',
  path: '/opt/portwatch-projects/shop',
  composeFile: 'docker-compose.yml',
  hasDockerfile: false,
  createdAt: 1,
  envVars: [{ key: 'PORT', value: '8080' }],
  ...overrides,
});

beforeEach(() => {
  updateEnv.mockReset();
  useProjects.setState({ updateEnv });
});

describe('EditEnvModal', () => {
  it('is an accessible modal titled with the project name', () => {
    render(<EditEnvModal project={project()} onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: /Environment variables · shop/ });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('starts from the project variables and says where the .env is written', () => {
    render(<EditEnvModal project={project()} onClose={vi.fn()} />);
    expect(screen.getByPlaceholderText('KEY')).toHaveValue('PORT');
    expect(screen.getByPlaceholderText('value')).toHaveValue('8080');
    expect(screen.getByText('/opt/portwatch-projects/shop/.env')).toBeInTheDocument();
    expect(screen.getByText(/next deploy/)).toBeInTheDocument();
  });

  it('saves the edited variables and closes', async () => {
    updateEnv.mockResolvedValue(undefined);
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<EditEnvModal project={project()} onClose={onClose} />);

    await user.clear(screen.getByPlaceholderText('value'));
    await user.type(screen.getByPlaceholderText('value'), '9090');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(updateEnv).toHaveBeenCalledWith('p1', [{ key: 'PORT', value: '9090' }]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('can add and remove variables before saving', async () => {
    updateEnv.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<EditEnvModal project={project()} onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Remove variable' }));
    await user.click(screen.getByRole('button', { name: /Add variable/ }));
    await user.type(screen.getByPlaceholderText('KEY'), 'TZ');
    await user.type(screen.getByPlaceholderText('value'), 'UTC');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(updateEnv).toHaveBeenCalledWith('p1', [{ key: 'TZ', value: 'UTC' }]);
  });

  it('stays open and shows the server error when saving fails', async () => {
    updateEnv.mockRejectedValue(new Error('envVars.0.key: must match [A-Za-z_][A-Za-z0-9_]*'));
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<EditEnvModal project={project()} onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText(/must match/)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('locks the form while saving', async () => {
    let finish!: () => void;
    updateEnv.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    const user = userEvent.setup();
    render(<EditEnvModal project={project()} onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByPlaceholderText('KEY')).toBeDisabled();
    finish();
  });

  it('closes without saving from Cancel and from Close', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<EditEnvModal project={project()} onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: /Close/ }));

    expect(onClose).toHaveBeenCalledTimes(2);
    expect(updateEnv).not.toHaveBeenCalled();
  });

  it('picks up variables that changed underneath it', () => {
    const { rerender } = render(<EditEnvModal project={project()} onClose={vi.fn()} />);
    rerender(<EditEnvModal project={project({ envVars: [{ key: 'NEW', value: 'x' }] })} onClose={vi.fn()} />);
    expect(screen.getByPlaceholderText('KEY')).toHaveValue('NEW');
  });
});
