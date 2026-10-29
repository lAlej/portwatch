import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '@/shared/lib/schemas';

vi.mock('./api', () => ({ projectsApi: {} }));
vi.mock('@/shared/lib/ws', () => ({ getSocket: () => ({ on: vi.fn(), off: vi.fn(), emit: vi.fn() }) }));

import { ProjectsPage } from './ProjectsPage';
import { useProjects } from './store';

const fetch = vi.fn();
const triggerDeploy = vi.fn();
const remove = vi.fn();

const project = (id: string, name = id): Project => ({
  id,
  name,
  cloneUrl: `https://github.com/me/${name}.git`,
  path: `/projects/${name}`,
  composeFile: 'docker-compose.yml',
  hasDockerfile: false,
  createdAt: 1,
  envVars: [],
});

beforeEach(() => {
  fetch.mockReset().mockResolvedValue(undefined);
  triggerDeploy.mockReset().mockResolvedValue('d1');
  remove.mockReset().mockResolvedValue(undefined);
  useProjects.setState({
    items: [],
    loading: false,
    error: null,
    lastStatusByProject: {},
    deploys: {},
    activeDeployId: null,
    fetch,
    triggerDeploy,
    remove,
  });
});
afterEach(() => vi.restoreAllMocks());

describe('ProjectsPage states', () => {
  it('loads the projects when opened', () => {
    render(<ProjectsPage />);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('shows a spinner while the first load is running', () => {
    useProjects.setState({ loading: true });
    render(<ProjectsPage />);
    expect(screen.getByText('Loading projects…')).toBeInTheDocument();
  });

  it('shows the load error', () => {
    useProjects.setState({ error: 'Unauthorized' });
    render(<ProjectsPage />);
    expect(screen.getByText('Unauthorized')).toBeInTheDocument();
  });

  it('invites the admin to add the first project', () => {
    render(<ProjectsPage />);
    expect(screen.getByText(/No projects yet/)).toBeInTheDocument();
  });

  it('keeps showing projects during a background refresh instead of flashing the spinner', () => {
    useProjects.setState({ items: [project('a', 'shop')], loading: true });
    render(<ProjectsPage />);
    expect(screen.getByRole('heading', { name: 'shop' })).toBeInTheDocument();
    expect(screen.queryByText('Loading projects…')).not.toBeInTheDocument();
  });

  it('lists a card per project with its last deployment status', () => {
    useProjects.setState({
      items: [project('a', 'shop'), project('b', 'blog')],
      lastStatusByProject: { a: 'success', b: 'failed' },
    });
    render(<ProjectsPage />);
    expect(screen.getByRole('heading', { name: 'shop' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'blog' })).toBeInTheDocument();
    expect(screen.getByText('deployed')).toBeInTheDocument();
    expect(screen.getByText('failed')).toBeInTheDocument();
  });
});

describe('adding projects', () => {
  it('offers cloning first and switches to pasting a compose file and back', async () => {
    const user = userEvent.setup();
    render(<ProjectsPage />);
    expect(screen.getByRole('heading', { name: 'Clone a repo' })).toBeInTheDocument();
    expect(screen.getByLabelText('Clone URL')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /paste a compose file instead/ }));
    expect(screen.getByRole('heading', { name: 'Paste a compose file' })).toBeInTheDocument();
    expect(screen.getByLabelText('Compose file content')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /clone a repo instead/ }));
    expect(screen.getByLabelText('Clone URL')).toBeInTheDocument();
  });

  it('returns to the clone form after a compose project is created', async () => {
    const createAdHoc = vi.fn().mockResolvedValue({});
    useProjects.setState({ createAdHoc });
    const user = userEvent.setup();
    render(<ProjectsPage />);

    await user.click(screen.getByRole('button', { name: /paste a compose file instead/ }));
    await user.type(screen.getByLabelText('Project name'), 'web');
    await user.click(screen.getByLabelText('Compose file content'));
    await user.paste('services:\n  web:\n    image: nginx\n');
    await user.click(screen.getByRole('button', { name: /Create & start/ }));

    expect(createAdHoc).toHaveBeenCalledWith('web', 'services:\n  web:\n    image: nginx\n', []);
    expect(await screen.findByLabelText('Clone URL')).toBeInTheDocument();
  });
});

describe('deploying', () => {
  beforeEach(() => useProjects.setState({ items: [project('a', 'shop')] }));

  it('starts a deploy for that project', async () => {
    await userEvent.setup().click(renderAndGet('Pull & deploy'));
    expect(triggerDeploy).toHaveBeenCalledWith('a');
  });

  it('does not crash the page when the server refuses the deploy', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    triggerDeploy.mockRejectedValue(new Error("is this dashboard's own compose project"));
    await userEvent.setup().click(renderAndGet('Pull & deploy'));
    await waitFor(() => expect(log).toHaveBeenCalled());
    expect(screen.getByRole('heading', { name: 'shop' })).toBeInTheDocument();
  });

  it('disables the button of a project that is being deployed, and only that one', () => {
    useProjects.setState({
      items: [project('a', 'shop'), project('b', 'blog')],
      deploys: {
        d1: { deploymentId: 'd1', projectId: 'a', status: 'building', logs: [], exitCode: null, error: undefined },
      },
    });
    render(<ProjectsPage />);
    expect(screen.getByRole('button', { name: 'Deploying…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Pull & deploy' })).toBeEnabled();
  });

  it('treats a finished deploy as idle', () => {
    useProjects.setState({
      deploys: {
        d1: { deploymentId: 'd1', projectId: 'a', status: 'success', logs: [], exitCode: 0, error: undefined },
      },
    });
    render(<ProjectsPage />);
    expect(screen.getByRole('button', { name: 'Pull & deploy' })).toBeEnabled();
  });
});

describe('deleting', () => {
  beforeEach(() => useProjects.setState({ items: [project('a', 'shop')] }));

  it('asks for confirmation and removes the project when accepted', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<ProjectsPage />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Delete project shop' }));

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('cloned directory will also be removed'));
    expect(remove).toHaveBeenCalledWith('a');
  });

  it('does nothing when the admin cancels', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<ProjectsPage />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Delete project shop' }));
    expect(remove).not.toHaveBeenCalled();
  });

  it('survives a failed delete', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    remove.mockRejectedValue(new Error('nope'));
    render(<ProjectsPage />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Delete project shop' }));
    await waitFor(() => expect(log).toHaveBeenCalled());
    expect(screen.getByRole('heading', { name: 'shop' })).toBeInTheDocument();
  });
});

describe('editing environment variables', () => {
  it('opens the editor for the chosen project and closes it again', async () => {
    useProjects.setState({ items: [project('a', 'shop'), project('b', 'blog')] });
    const user = userEvent.setup();
    render(<ProjectsPage />);

    await user.click(screen.getByRole('button', { name: 'Edit env vars for blog' }));
    expect(screen.getByRole('dialog', { name: /Environment variables · blog/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

function renderAndGet(buttonName: string): HTMLElement {
  render(<ProjectsPage />);
  return screen.getByRole('button', { name: buttonName });
}
