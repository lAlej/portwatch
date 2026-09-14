export interface SystemStats {
  hostname: string;
  uptimeSeconds: number;
  cpuPercent: number;
  cpuCores: number;
  loadAverage: [number, number, number];
  memoryTotalBytes: number;
  memoryUsedBytes: number;
  memoryFreeBytes: number;
  diskTotalBytes: number;
  diskUsedBytes: number;
  networkRxBytesPerSec: number;
  networkTxBytesPerSec: number;
  networkTotalBytes: number;
  timestamp: number;
}
