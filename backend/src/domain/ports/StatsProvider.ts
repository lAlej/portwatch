import type { ContainerStats } from '../entities/ContainerStats.js';
import type { SystemStats } from '../entities/SystemStats.js';

export type StatsListener<T> = (sample: T) => void;
export type Unsubscribe = () => void;

export interface ContainerStatsProvider {
  subscribe(id: string, listener: StatsListener<ContainerStats>): Unsubscribe;
}

export interface SystemStatsProvider {
  snapshot(): Promise<SystemStats>;
  subscribe(listener: StatsListener<SystemStats>): Unsubscribe;
}
