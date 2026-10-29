import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Container, ContainerState } from '@/shared/lib/schemas';
import { useProjects } from '@/features/projects/store';
import { ContainerActions } from './ContainerActions';
import { useContainers } from './store';

const actions = {
  start: vi.fn(),
  pause: vi.fn(),
  unpause: vi.fn(),
  restart: vi.fn(),
  kill: vi.fn(),
};
const triggerDeploy = vi.fn();

const container = (state: ContainerState): Container => ({
  id: 'c1',
  name: 'web',
  image: 'nginx',
  state,
  status: '',
  created: 1,
  ports: [],
  uptimeSeconds: null,
  labels: {},
});

const deployState = (status: 'queued' | 'building' | 'success' | 'failed', projectId = 'p1') => ({
  deploymentId: 'd1',
  projectId,
  status,
  logs: [],
  exitCode: null,
  error: undefined,
});

beforeEach(() => {
  Object.values(actions).forEach((f) => f.mockReset());
  triggerDeploy.mockReset();
  useContainers.setState({ ...actions, projectFor: new Map() });
  useProjects.setState({ triggerDeploy, activeDeployId: null, deploys: {} });
});

const buttons = () => screen.queryAllByRole('button').map((b) => b.getAttribute('title'));

describe('which actions each state offers', () => {
  it.each<[ContainerState, string[]]>([
    ['running', ['Pause', 'Restart', 'Kill']],
    ['paused', ['Resume']],
    ['exited', ['Start']],
    ['created', ['Start']],
    ['restarting', ['Kill']],
    ['dead', []],
    ['removing', []],
    ['unknown', []],
  ])('%s -> %j', (state, expected) => {
    render(<ContainerActions container={container(state)} />);
    expect(buttons()).toEqual(expected);
  });
});

describe('triggering actions', () => {
  it.each([
    ['running', 'Pause', 'pause'],
    ['running', 'Restart', 'restart'],
    ['running', 'Kill', 'kill'],
    ['paused', 'Resume', 'unpause'],
    ['exited', 'Start', 'start'],
    ['restarting', 'Kill', 'kill'],
  ] as const)('%s + "%s" calls %s with the container id', async (state, title, action) => {
    const user = userEvent.setup();
    render(<ContainerActions container={container(state)} />);

    await user.click(screen.getByTitle(title));

    expect(actions[action]).toHaveBeenCalledWith('c1');
    for (const [name, fn] of Object.entries(actions)) {
      if (name !== action) expect(fn).not.toHaveBeenCalled();
    }
  });
});

describe('sizes', () => {
  it('md shows text labels next to the icons', () => {
    render(<ContainerActions container={container('running')} size="md" />);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restart' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kill' })).toBeInTheDocument();
  });
});

describe('edit compose', () => {
  it('is only offered when the page can open the editor', async () => {
    const { rerender } = render(<ContainerActions container={container('running')} />);
    expect(screen.queryByTitle('Edit compose file')).not.toBeInTheDocument();

    const onEditCompose = vi.fn();
    rerender(<ContainerActions container={container('running')} onEditCompose={onEditCompose} />);
    await userEvent.setup().click(screen.getByTitle('Edit compose file'));
    expect(onEditCompose).toHaveBeenCalledTimes(1);
  });
});

describe('rebuild & up', () => {
  it('is hidden while the owning project has not been resolved yet', () => {
    useContainers.setState({ projectFor: new Map() });
    render(<ContainerActions container={container('running')} />);
    expect(screen.queryByTitle('Rebuild & up')).not.toBeInTheDocument();
  });

  it('is hidden for containers that do not belong to a managed project', () => {
    useContainers.setState({ projectFor: new Map([['c1', null]]) });
    render(<ContainerActions container={container('running')} />);
    expect(screen.queryByTitle('Rebuild & up')).not.toBeInTheDocument();
  });

  it('deploys the owning project when clicked', async () => {
    useContainers.setState({ projectFor: new Map([['c1', 'p1']]) });
    const user = userEvent.setup();
    render(<ContainerActions container={container('exited')} />);

    await user.click(screen.getByTitle('Rebuild & up'));

    expect(triggerDeploy).toHaveBeenCalledWith('p1');
  });

  it('is disabled with an explanation while that project is already deploying', () => {
    useContainers.setState({ projectFor: new Map([['c1', 'p1']]) });
    useProjects.setState({ deploys: { d1: deployState('building') }, activeDeployId: 'd1' });
    render(<ContainerActions container={container('running')} />);
    expect(screen.getByTitle('Deploy already running')).toBeDisabled();
  });

  it('ignores a finished deploy of the same project', () => {
    useContainers.setState({ projectFor: new Map([['c1', 'p1']]) });
    useProjects.setState({ deploys: { d1: deployState('success') } });
    render(<ContainerActions container={container('running')} />);
    expect(screen.getByTitle('Rebuild & up')).toBeEnabled();
  });

  it('ignores a running deploy of a different project', () => {
    useContainers.setState({ projectFor: new Map([['c1', 'p1']]) });
    useProjects.setState({ deploys: { d1: deployState('building', 'other') } });
    render(<ContainerActions container={container('running')} />);
    expect(screen.getByTitle('Rebuild & up')).toBeEnabled();
  });
});

describe('while a deploy modal is open', () => {
  it('disables every action so nothing changes under a running deploy', () => {
    useContainers.setState({ projectFor: new Map([['c1', 'p1']]) });
    useProjects.setState({ activeDeployId: 'd1', deploys: { d1: deployState('queued', 'other') } });
    render(<ContainerActions container={container('running')} onEditCompose={() => undefined} />);

    const all = screen.getAllByRole('button');
    expect(all.length).toBeGreaterThanOrEqual(5);
    for (const b of all) expect(b).toBeDisabled();
  });

  it('does not fire an action when its button is disabled', async () => {
    useProjects.setState({ activeDeployId: 'd1' });
    const user = userEvent.setup();
    render(<ContainerActions container={container('running')} />);
    await user.click(screen.getByTitle('Kill'));
    expect(actions.kill).not.toHaveBeenCalled();
  });
});
