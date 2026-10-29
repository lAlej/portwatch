import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Container } from '@/shared/lib/schemas';

const containersApi = vi.hoisted(() => ({
  list: vi.fn(),
  start: vi.fn(),
  pause: vi.fn(),
  unpause: vi.fn(),
  restart: vi.fn(),
  kill: vi.fn(),
  inspect: vi.fn(),
  getProject: vi.fn(),
}));
vi.mock('./api', () => ({ containersApi }));

import { ContainerTable } from './ContainerTable';
import { useContainers } from './store';

const VIEW_KEY = 'portwatch:containers:view';

const container = (id: string, overrides: Partial<Container> = {}): Container => ({
  id,
  name: `name-${id}`,
  image: `image-${id}`,
  state: 'running',
  status: 'Up',
  created: 1,
  ports: [],
  uptimeSeconds: 10,
  labels: {},
  ...overrides,
});

const inProject = (project: string) => ({ 'com.docker.compose.project': project });

function renderTable() {
  return render(
    <MemoryRouter>
      <ContainerTable />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  Object.values(containersApi).forEach((f) => f.mockReset());
  containersApi.list.mockResolvedValue([]);
  containersApi.getProject.mockResolvedValue(null);
  useContainers.setState({ items: [], loading: false, error: null, projectFor: new Map() });
  localStorage.clear();
});
afterEach(() => vi.useRealTimers());

describe('flat view (default)', () => {
  it('lists every container with its image and state', async () => {
    containersApi.list.mockResolvedValue([
      container('a', { name: 'web', image: 'nginx:alpine' }),
      container('b', { name: 'db', image: 'postgres:16', state: 'exited' }),
    ]);
    renderTable();

    expect(await screen.findByText('web')).toBeInTheDocument();
    expect(screen.getByText('nginx:alpine')).toBeInTheDocument();
    expect(screen.getByText('db')).toBeInTheDocument();
    expect(screen.getByText('exited')).toBeInTheDocument();
  });

  it('links each container to its detail page', async () => {
    containersApi.list.mockResolvedValue([container('abc123', { name: 'web' })]);
    renderTable();
    expect(await screen.findByRole('link', { name: /web/ })).toHaveAttribute('href', '/containers/abc123');
  });

  it('counts visible and running containers', async () => {
    containersApi.list.mockResolvedValue([
      container('a'),
      container('b'),
      container('c', { state: 'paused' }),
      container('d', { state: 'exited' }),
    ]);
    renderTable();
    const header = (await screen.findByText(/visible/)).parentElement!;
    await waitFor(() => expect(header).toHaveTextContent('4 visible'));
    expect(header).toHaveTextContent('2 running');
  });

  it('shows ports as public:private, at most three', async () => {
    const ports = [80, 443, 8080, 9090].map((p) => ({ privatePort: p, publicPort: p + 1, type: 'tcp', ip: null }));
    containersApi.list.mockResolvedValue([container('a', { ports })]);
    renderTable();
    const row = (await screen.findByText('name-a')).closest('tr')!;
    expect(row).toHaveTextContent('81:80');
    expect(row).toHaveTextContent('444:443');
    expect(row).toHaveTextContent('8081:8080');
    expect(row).not.toHaveTextContent('9091:9090');
  });

  it('marks unpublished ports with a dash', async () => {
    containersApi.list.mockResolvedValue([
      container('a', { ports: [{ privatePort: 5432, publicPort: null, type: 'tcp', ip: null }] }),
    ]);
    renderTable();
    expect((await screen.findByText('name-a')).closest('tr')).toHaveTextContent('-:5432');
  });

  it('shows an empty state when the host runs nothing', async () => {
    renderTable();
    expect(await screen.findByText('No containers running.')).toBeInTheDocument();
  });

  it('shows the loading error without dropping the table', async () => {
    containersApi.list.mockRejectedValue(new Error('Docker engine is not reachable'));
    renderTable();
    expect(await screen.findByText('Docker engine is not reachable')).toBeInTheDocument();
    expect(screen.getByText(/Containers of this dashboard are hidden/)).toBeInTheDocument();
  });

  it('refreshes the list every five seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderTable();
    await waitFor(() => expect(containersApi.list).toHaveBeenCalledTimes(1));

    await vi.advanceTimersByTimeAsync(5000);
    expect(containersApi.list).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(5000);
    expect(containersApi.list).toHaveBeenCalledTimes(3);
  });

  it('stops polling once unmounted', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { unmount } = renderTable();
    await waitFor(() => expect(containersApi.list).toHaveBeenCalledTimes(1));
    unmount();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(containersApi.list).toHaveBeenCalledTimes(1);
  });
});

describe('grouped view', () => {
  const fleet = [
    container('1', { name: 'zeta-web', labels: inProject('zeta') }),
    container('2', { name: 'zeta-db', labels: inProject('zeta'), state: 'exited' }),
    container('3', { name: 'alpha-api', labels: inProject('alpha') }),
    container('4', { name: 'loner', labels: {} }),
  ];

  async function openGrouped() {
    containersApi.list.mockResolvedValue(fleet);
    const user = userEvent.setup();
    renderTable();
    await screen.findByText('zeta-web');
    await user.click(screen.getByTitle('Grouped by compose project'));
  }

  it('groups containers by compose project, alphabetically, with standalone last', async () => {
    await openGrouped();
    const names = screen
      .getAllByText(/^(alpha|zeta|standalone)$/)
      .map((el) => el.textContent);
    expect(names).toEqual(['alpha', 'zeta', 'standalone']);
  });

  it('shows running/total for each group', async () => {
    await openGrouped();
    const summaryOf = (project: string) => screen.getByText(project).closest('summary')!;
    expect(summaryOf('zeta')).toHaveTextContent('1/2 running');
    expect(summaryOf('alpha')).toHaveTextContent('1/1 running');
    expect(summaryOf('standalone')).toHaveTextContent('1/1 running');
  });

  it('keeps standalone containers collapsed but compose projects open', async () => {
    await openGrouped();
    expect(screen.getByText('zeta').closest('details')).toHaveAttribute('open');
    expect(screen.getByText('standalone').closest('details')).not.toHaveAttribute('open');
  });

  it('reports the number of groups', async () => {
    await openGrouped();
    expect(screen.getByText(/groups/).parentElement).toHaveTextContent('3 groups');
  });

  it('remembers the chosen view for the next visit', async () => {
    await openGrouped();
    expect(localStorage.getItem(VIEW_KEY)).toBe('grouped');
  });

  it('restores the saved view on load', async () => {
    localStorage.setItem(VIEW_KEY, 'grouped');
    containersApi.list.mockResolvedValue(fleet);
    renderTable();
    expect(await screen.findByText('alpha')).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Image' })).not.toBeInTheDocument();
  });

  it('can switch back to the flat list', async () => {
    await openGrouped();
    await userEvent.setup().click(screen.getByTitle('Flat list'));
    expect(screen.getByRole('columnheader', { name: 'Image' })).toBeInTheDocument();
    expect(localStorage.getItem(VIEW_KEY)).toBe('flat');
  });

  it('ignores a corrupt saved value', async () => {
    localStorage.setItem(VIEW_KEY, 'sideways');
    containersApi.list.mockResolvedValue(fleet);
    renderTable();
    await screen.findByText('zeta-web');
    expect(screen.getByRole('columnheader', { name: 'Image' })).toBeInTheDocument();
  });
});
