import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InvalidStateError } from '../../../lib/errors.js';
import {
  InMemoryProjectsRepository,
  fakeLogger,
  makeProject,
  makeTmpDir,
  removeDir,
} from '../../../testing/fakes.js';
import { CreateAdHocComposeProject } from './CreateAdHocComposeProject.js';

const COMPOSE = 'services:\n  web:\n    image: nginx:alpine\n';

describe('CreateAdHocComposeProject', () => {
  let dir: string;
  let repo: InMemoryProjectsRepository;
  let useCase: CreateAdHocComposeProject;

  beforeEach(async () => {
    dir = await makeTmpDir();
    repo = new InMemoryProjectsRepository();
    useCase = new CreateAdHocComposeProject({ repo, logger: fakeLogger(), projectsDir: dir });
  });
  afterEach(() => removeDir(dir));

  it('writes docker-compose.yml and registers a project without a clone url', async () => {
    const { project } = await useCase.execute({ name: 'web', composeContent: COMPOSE });

    expect(project).toMatchObject({
      name: 'web',
      cloneUrl: '',
      path: join(dir, 'web'),
      composeFile: 'docker-compose.yml',
      hasDockerfile: false,
      envVars: [],
    });
    expect(await fs.readFile(join(dir, 'web', 'docker-compose.yml'), 'utf8')).toBe(COMPOSE);
    expect(await repo.get(project.id)).toEqual(project);
    // No stray temp file left behind by the atomic write.
    expect(await fs.readdir(join(dir, 'web'))).toEqual(['docker-compose.yml']);
  });

  it('writes a .env only when env vars are provided, skipping blank keys', async () => {
    await useCase.execute({ name: 'plain', composeContent: COMPOSE });
    await expect(fs.access(join(dir, 'plain', '.env'))).rejects.toThrow();

    const { project } = await useCase.execute({
      name: 'withenv',
      composeContent: COMPOSE,
      envVars: [
        { key: 'PORT', value: '8080' },
        { key: ' ', value: 'dropped' },
      ],
    });
    expect(project.envVars).toEqual([{ key: 'PORT', value: '8080' }]);
    expect(await fs.readFile(join(dir, 'withenv', '.env'), 'utf8')).toBe('PORT=8080\n');
  });

  it('quotes values that contain whitespace or shell-special characters', async () => {
    await useCase.execute({
      name: 'quoted',
      composeContent: COMPOSE,
      envVars: [
        { key: 'GREETING', value: 'hello world' },
        { key: 'EMPTY', value: '' },
      ],
    });
    const env = await fs.readFile(join(dir, 'quoted', '.env'), 'utf8');
    expect(env.split('\n')).toEqual(['GREETING="hello world"', 'EMPTY=', '']);
  });

  it('sanitizes the name so it cannot escape the projects directory', async () => {
    const { project } = await useCase.execute({
      name: '../../etc/Evil Name',
      composeContent: COMPOSE,
    });
    expect(project.name).toBe('etc-evil-name');
    expect(project.path).toBe(join(dir, 'etc-evil-name'));
    await expect(fs.access(join(dir, 'etc-evil-name', 'docker-compose.yml'))).resolves.toBeUndefined();
  });

  it('rejects blank names and blank compose content', async () => {
    await expect(useCase.execute({ name: '  ', composeContent: COMPOSE })).rejects.toThrow(
      /name is required/,
    );
    await expect(useCase.execute({ name: 'x', composeContent: '   \n' })).rejects.toThrow(
      /composeContent is required/,
    );
    expect(await repo.list()).toHaveLength(0);
  });

  it('rejects a name that is already registered, without overwriting its files', async () => {
    await useCase.execute({ name: 'web', composeContent: COMPOSE });
    await expect(useCase.execute({ name: 'Web', composeContent: 'other: 1' })).rejects.toThrow(
      /already exists/,
    );
    expect(await fs.readFile(join(dir, 'web', 'docker-compose.yml'), 'utf8')).toBe(COMPOSE);
  });

  it("refuses the dashboard's own project name before touching the disk", async () => {
    await expect(
      useCase.execute({ name: 'portwatch', composeContent: COMPOSE }),
    ).rejects.toBeInstanceOf(InvalidStateError);
    await expect(fs.access(join(dir, 'portwatch'))).rejects.toThrow();
  });

  it('does not collide with unrelated registered projects', async () => {
    await repo.upsert(makeProject({ name: 'other' }));
    await expect(useCase.execute({ name: 'web', composeContent: COMPOSE })).resolves.toBeDefined();
  });
});
