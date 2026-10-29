import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeSocket } from '@/test/fakeSocket';
import type { DeploymentStatus } from '@/shared/lib/schemas';

const socket = new FakeSocket();
vi.mock('@/shared/lib/ws', () => ({ getSocket: () => socket }));
vi.mock('./api', () => ({ projectsApi: {} }));

import { DeployLogModal } from './DeployLogModal';
import { useProjects } from './store';

function seed(status: DeploymentStatus = 'queued', extra: Record<string, unknown> = {}) {
  useProjects.setState({
    deploys: {
      d1: { deploymentId: 'd1', projectId: 'p1', status, logs: [], exitCode: null, error: undefined, ...extra },
    },
    activeDeployId: 'd1',
    lastStatusByProject: {},
  });
}

const emit = (event: unknown) => act(() => socket.receive('deploy:d1', event));
const subscribes = () => socket.emitted.filter((e) => e.event === 'subscribe').length;

beforeEach(() => {
  socket.emitted.length = 0;
  socket.off('deploy:d1');
  useProjects.setState({ deploys: {}, activeDeployId: null, lastStatusByProject: {} });
});

describe('DeployLogModal', () => {
  it('renders nothing for an unknown deployment', () => {
    const { container } = render(<DeployLogModal deploymentId="nope" onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('waits for output until the first line arrives', () => {
    seed();
    render(<DeployLogModal deploymentId="d1" onClose={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: 'Deploy log' })).toBeInTheDocument();
    expect(screen.getByText('Waiting for output…')).toBeInTheDocument();
  });

  it.each<[DeploymentStatus, string, boolean]>([
    ['queued', 'Queued', true],
    ['pulling', 'Pulling latest changes…', true],
    ['building', 'Building images…', true],
    ['starting', 'Starting containers…', true],
    ['success', 'Deploy succeeded', false],
    ['failed', 'Deploy failed', false],
    ['cancelled', 'Deploy cancelled', false],
  ])('%s shows "%s" (spinner: %s)', (status, label, spinning) => {
    seed(status);
    render(<DeployLogModal deploymentId="d1" onClose={vi.fn()} />);
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.queryByLabelText('loading') !== null).toBe(spinning);
  });

  it('streams log lines live and tells stderr apart', () => {
    seed('building');
    render(<DeployLogModal deploymentId="d1" onClose={vi.fn()} />);

    emit({ kind: 'log', line: 'Step 1/5 : FROM node:22', stream: 'stdout' });
    emit({ kind: 'log', line: 'npm warn deprecated', stream: 'stderr' });

    expect(screen.getByText('Step 1/5 : FROM node:22')).not.toHaveClass('text-state-error');
    expect(screen.getByText('npm warn deprecated')).toHaveClass('text-state-error');
    expect(screen.queryByText('Waiting for output…')).not.toBeInTheDocument();
  });

  it('follows the status changes pushed by the server', () => {
    seed('queued');
    render(<DeployLogModal deploymentId="d1" onClose={vi.fn()} />);
    emit({ kind: 'status', status: 'building' });
    expect(screen.getByText('Building images…')).toBeInTheDocument();
    emit({ kind: 'status', status: 'success' });
    emit({ kind: 'exit', exitCode: 0 });
    expect(screen.getByText('Deploy succeeded')).toBeInTheDocument();
    expect(screen.getByText('exit 0')).toBeInTheDocument();
    expect(screen.queryByLabelText('loading')).not.toBeInTheDocument();
  });

  it('shows the exit code together with the failure reason', () => {
    seed('failed', { exitCode: 1, error: 'compose build failed' });
    render(<DeployLogModal deploymentId="d1" onClose={vi.fn()} />);
    expect(screen.getByText('exit 1 — compose build failed')).toBeInTheDocument();
  });

  it('subscribes to its deployment once and unsubscribes when it goes away', () => {
    seed();
    const { unmount } = render(<DeployLogModal deploymentId="d1" onClose={vi.fn()} />);
    expect(socket.emitted).toContainEqual({ event: 'subscribe', payload: { channel: 'deploy', id: 'd1' } });

    unmount();
    expect(socket.emitted).toContainEqual({ event: 'unsubscribe', payload: { channel: 'deploy', id: 'd1' } });
    expect(socket.listenerCount('deploy:d1')).toBe(0);
  });

  it('keeps one subscription for the whole deploy instead of re-subscribing on every log line', () => {
    seed('building');
    render(<DeployLogModal deploymentId="d1" onClose={vi.fn()} />);

    for (let i = 0; i < 50; i++) emit({ kind: 'log', line: `line ${i}`, stream: 'stdout' });
    emit({ kind: 'status', status: 'starting' });

    expect(subscribes()).toBe(1);
    expect(socket.emitted.filter((e) => e.event === 'unsubscribe')).toHaveLength(0);
    expect(screen.getByText('line 49')).toBeInTheDocument();
  });

  it('close discards the deploy state and notifies the parent', async () => {
    seed('success');
    const onClose = vi.fn();
    render(<DeployLogModal deploymentId="d1" onClose={onClose} />);

    await userEvent.setup().click(screen.getByRole('button', { name: /Close/ }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(useProjects.getState().deploys['d1']).toBeUndefined();
    expect(useProjects.getState().activeDeployId).toBeNull();
  });
});
