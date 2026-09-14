import type { SystemStatsProvider, StatsListener, Unsubscribe } from '../../ports/StatsProvider.js';

export class SubscribeSystemStats {
  constructor(private readonly provider: SystemStatsProvider) {}
  execute(listener: StatsListener<import('../../entities/SystemStats.js').SystemStats>): Unsubscribe {
    return this.provider.subscribe(listener);
  }
}
