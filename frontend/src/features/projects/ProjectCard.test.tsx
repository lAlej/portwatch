import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { DeploymentStatus, Project } from '@/shared/lib/schemas';
import { ProjectCard } from './ProjectCard';

const project = (overrides: Partial<Project> = {}): Project => ({
  id: 'p1',
  name: 'shop',
  cloneUrl: 'https://github.com/me/shop.git',
  path: '/projects/shop',
  composeFile: 'docker-compose.yml',
  hasDockerfile: false,
  createdAt: 1,
  envVars: [],
  ...overrides,
});

function setup(props: Partial<Parameters<typeof ProjectCard>[0]> = {}) {
  const handlers = { onDeploy: vi.fn(), onDelete: vi.fn(), onEditEnv: vi.fn() };
  render(
    <ProjectCard project={project()} lastStatus={undefined} deploying={false} {...handlers} {...props} />,
  );
  return handlers;
}

describe('ProjectCard', () => {
  it('shows the project name and where it came from', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'shop' })).toBeInTheDocument();
    expect(screen.getByText('https://github.com/me/shop.git')).toBeInTheDocument();
    expect(screen.getByText('compose: docker-compose.yml')).toBeInTheDocument();
  });

  it('describes an ad-hoc project (no repo)', () => {
    setup({ project: project({ cloneUrl: '' }) });
    expect(screen.getByText('ad-hoc compose (no repo)')).toBeInTheDocument();
  });

  it('mentions a Dockerfile-only repo', () => {
    setup({ project: project({ composeFile: '', hasDockerfile: true }) });
    expect(screen.getByText('Dockerfile only (no compose)')).toBeInTheDocument();
  });

  it.each<[DeploymentStatus | undefined, string]>([
    [undefined, 'never deployed'],
    ['queued', 'queued'],
    ['pulling', 'pulling'],
    ['building', 'building'],
    ['starting', 'starting'],
    ['success', 'deployed'],
    ['failed', 'failed'],
    ['cancelled', 'cancelled'],
  ])('labels the last deployment %s as "%s"', (status, label) => {
    setup({ lastStatus: status });
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('counts configured env vars only when there are some', () => {
    const { unmount } = render(
      <ProjectCard
        project={project()}
        lastStatus={undefined}
        deploying={false}
        onDeploy={vi.fn()}
        onDelete={vi.fn()}
        onEditEnv={vi.fn()}
      />,
    );
    expect(screen.queryByText(/env$/)).not.toBeInTheDocument();
    unmount();

    setup({ project: project({ envVars: [{ key: 'A', value: '1' }, { key: 'B', value: '2' }] }) });
    expect(screen.getByText(/2 env/)).toBeInTheDocument();
  });

  describe('primary button', () => {
    it('says "Pull & deploy" for repos and "Start" for ad-hoc projects', () => {
      setup();
      expect(screen.getByRole('button', { name: 'Pull & deploy' })).toBeInTheDocument();
    });

    it('says "Start" for an ad-hoc project', () => {
      setup({ project: project({ cloneUrl: '' }) });
      expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
    });

    it('is disabled and reads "Deploying…" while a deploy runs', () => {
      setup({ deploying: true });
      expect(screen.getByRole('button', { name: 'Deploying…' })).toBeDisabled();
    });

    it('triggers the deploy', async () => {
      const { onDeploy } = setup();
      await userEvent.setup().click(screen.getByRole('button', { name: 'Pull & deploy' }));
      expect(onDeploy).toHaveBeenCalledTimes(1);
    });
  });

  it('exposes accessible edit-env and delete controls that name the project', async () => {
    const { onEditEnv, onDelete } = setup();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Edit env vars for shop' }));
    await user.click(screen.getByRole('button', { name: 'Delete project shop' }));

    expect(onEditEnv).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
