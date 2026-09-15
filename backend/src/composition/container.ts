import Dockerode from 'dockerode';
import { loadConfig, type AppConfig } from '../lib/env.js';
import { PinoLogger } from '../adapters/logging/PinoLogger.js';
import { BcryptPasswordHasher } from '../adapters/auth/BcryptPasswordHasher.js';
import { JwtTokenService } from '../adapters/auth/JwtTokenService.js';
import { EnvAuthService } from '../adapters/auth/EnvAuthService.js';
import { DockerContainerRepository } from '../adapters/docker/DockerContainerRepository.js';
import { DockerStatsProvider } from '../adapters/docker/DockerStatsProvider.js';
import { DockerLogStreamer } from '../adapters/docker/DockerLogStreamer.js';
import { SystemInfoStatsProvider } from '../adapters/system/SystemInfoStatsProvider.js';
import { HostGit } from '../adapters/projects/HostGit.js';
import { HostDockerComposeRunner } from '../adapters/projects/HostDockerComposeRunner.js';
import { HostDeployRunner } from '../adapters/projects/HostDeployRunner.js';
import { FileProjectsRepository } from '../adapters/projects/FileProjectsRepository.js';
import { NdjsonDeploymentsRepository } from '../adapters/projects/NdjsonDeploymentsRepository.js';
import { LoginUser } from '../domain/usecases/auth/LoginUser.js';
import { GetCurrentUser } from '../domain/usecases/auth/GetCurrentUser.js';
import { ListContainers } from '../domain/usecases/containers/ListContainers.js';
import { StartContainer } from '../domain/usecases/containers/StartContainer.js';
import { PauseContainer } from '../domain/usecases/containers/PauseContainer.js';
import { UnpauseContainer } from '../domain/usecases/containers/UnpauseContainer.js';
import { RestartContainer } from '../domain/usecases/containers/RestartContainer.js';
import { KillContainer } from '../domain/usecases/containers/KillContainer.js';
import { InspectContainer } from '../domain/usecases/containers/InspectContainer.js';
import { GetProjectForContainer } from '../domain/usecases/containers/GetProjectForContainer.js';
import { GetSystemSnapshot } from '../domain/usecases/stats/GetSystemSnapshot.js';
import { SubscribeSystemStats } from '../domain/usecases/stats/SubscribeSystemStats.js';
import { SubscribeContainerStats } from '../domain/usecases/stats/SubscribeContainerStats.js';
import { CloneProject } from '../domain/usecases/projects/CloneProject.js';
import { ListProjects } from '../domain/usecases/projects/ListProjects.js';
import { DeleteProject } from '../domain/usecases/projects/DeleteProject.js';
import { TriggerDeploy } from '../domain/usecases/projects/TriggerDeploy.js';
import { ListDeployments } from '../domain/usecases/projects/ListDeployments.js';
import { UpdateProjectEnv } from '../domain/usecases/projects/UpdateProjectEnv.js';
import type { Logger } from '../domain/ports/Logger.js';
import type { ContainerRepository } from '../domain/ports/ContainerRepository.js';
import type { LogStreamer } from '../domain/ports/LogStreamer.js';
import type { TokenService } from '../domain/ports/TokenService.js';
import type { SystemStatsProvider, ContainerStatsProvider } from '../domain/ports/StatsProvider.js';
import type { ProjectsRepository } from '../domain/ports/ProjectsRepository.js';
import type { DeploymentsRepository } from '../domain/ports/DeploymentsRepository.js';
import type { DeployRunner } from '../domain/ports/DeployRunner.js';
import type { DeployPublisher } from '../domain/ports/DeployPublisher.js';

export interface AppWiring {
  config: AppConfig;
  logger: Logger;
  useCases: {
    login: LoginUser;
    getCurrentUser: GetCurrentUser;
    listContainers: ListContainers;
    start: StartContainer;
    pause: PauseContainer;
    unpause: UnpauseContainer;
    restart: RestartContainer;
    kill: KillContainer;
    inspect: InspectContainer;
    getProjectForContainer: GetProjectForContainer;
    systemSnapshot: GetSystemSnapshot;
    subscribeSystem: SubscribeSystemStats;
    subscribeContainer: SubscribeContainerStats;
    cloneProject: CloneProject;
    listProjects: ListProjects;
    deleteProject: DeleteProject;
    triggerDeploy: TriggerDeploy;
    listDeployments: ListDeployments;
    updateProjectEnv: UpdateProjectEnv;
  };
  ports: {
    containerRepo: ContainerRepository;
    containerStats: ContainerStatsProvider;
    systemStats: SystemStatsProvider;
    logStreamer: LogStreamer;
    tokens: TokenService;
    dockerStats: DockerStatsProvider;
    projects: ProjectsRepository;
    deployments: DeploymentsRepository;
    deployRunner: DeployRunner;
    deployPublisher: DeployPublisher;
  };
}
class PublisherSlot implements DeployPublisher {
  private current: DeployPublisher = { publish: () => undefined };
  set(p: DeployPublisher): void {
    this.current = p;
  }
  publish(deploymentId: string, event: import('../domain/ports/DeployRunner.js').DeployEvent): void {
    this.current.publish(deploymentId, event);
  }
}

export function buildApp(config: AppConfig): AppWiring {
  const logger = new PinoLogger(config.LOG_LEVEL, config.NODE_ENV !== 'production');

  const docker = new Dockerode({ socketPath: config.DOCKER_SOCKET_PATH });
  const containerRepo = new DockerContainerRepository(docker);
  const containerStats = new DockerStatsProvider(docker);
  const logStreamer = new DockerLogStreamer(docker);
  const systemStats = new SystemInfoStatsProvider();

  const hasher = new BcryptPasswordHasher();
  const tokens = new JwtTokenService(config.JWT_SECRET);
  const authService = new EnvAuthService(config, hasher);

  const projectsRepo = new FileProjectsRepository(config.PROJECTS_DIR);
  const deploymentsRepo = new NdjsonDeploymentsRepository(config.PROJECTS_DIR);
  const git = new HostGit();
  const compose = new HostDockerComposeRunner();
  const deployRunner: DeployRunner = new HostDeployRunner({ git, compose, logger });
  const publisherSlot = new PublisherSlot();

  const projects: ProjectsRepository = projectsRepo;
  const deployments: DeploymentsRepository = deploymentsRepo;

  return {
    config,
    logger,
    useCases: {
      login: new LoginUser({ authService, tokens, logger }),
      getCurrentUser: new GetCurrentUser(),
      listContainers: new ListContainers(containerRepo),
      start: new StartContainer({ containerRepo, logger }),
      pause: new PauseContainer({ containerRepo, logger }),
      unpause: new UnpauseContainer({ containerRepo, logger }),
      restart: new RestartContainer({ containerRepo, logger }),
      kill: new KillContainer({ containerRepo, logger }),
      inspect: new InspectContainer(containerRepo),
      getProjectForContainer: new GetProjectForContainer({
        containers: containerRepo,
        projects,
      }),
      systemSnapshot: new GetSystemSnapshot(systemStats),
      subscribeSystem: new SubscribeSystemStats(systemStats),
      subscribeContainer: new SubscribeContainerStats(containerStats),
      cloneProject: new CloneProject({
        repo: projects,
        git,
        logger,
        projectsDir: config.PROJECTS_DIR,
      }),
      listProjects: new ListProjects(projects),
      deleteProject: new DeleteProject({ repo: projects, git, logger }),
      triggerDeploy: new TriggerDeploy({
        runner: deployRunner,
        publisher: publisherSlot,
        deployments,
        projects,
        logger,
      }),
      listDeployments: new ListDeployments(deployments),
      updateProjectEnv: new UpdateProjectEnv({ repo: projects, git }),
    },
    ports: {
      containerRepo,
      containerStats,
      systemStats,
      logStreamer,
      tokens,
      dockerStats: containerStats,
      projects,
      deployments,
      deployRunner,
      deployPublisher: publisherSlot,
    },
  };
}

export function buildFromEnv(): AppWiring {
  return buildApp(loadConfig());
}

export function setDeployPublisher(
  wiring: AppWiring,
  publisher: DeployPublisher,
): void {
  (wiring.ports.deployPublisher as PublisherSlot).set(publisher);
}
