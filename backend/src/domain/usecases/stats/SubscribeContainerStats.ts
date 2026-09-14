import type { ContainerStatsProvider, StatsListener, Unsubscribe } from '../../ports/StatsProvider.js';

export class SubscribeContainerStats {
  constructor(private readonly provider: ContainerStatsProvider) {}
  execute(id: string, listener: StatsListener<import('../../entities/ContainerStats.js').ContainerStats>): Unsubscribe {
    return this.provider.subscribe(id, listener);
  }
}
