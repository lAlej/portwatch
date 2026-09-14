import type { SystemStatsProvider } from '../../ports/StatsProvider.js';
import type { SystemStats } from '../../entities/SystemStats.js';

export class GetSystemSnapshot {
  constructor(private readonly provider: SystemStatsProvider) {}
  execute(): Promise<SystemStats> {
    return this.provider.snapshot();
  }
}
