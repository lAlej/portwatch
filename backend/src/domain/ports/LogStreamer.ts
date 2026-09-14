export interface LogLine {
  id: string;
  stream: 'stdout' | 'stderr';
  data: string;
  timestamp: number;
}

export interface LogStreamer {
  stream(
    id: string,
    opts: { tail?: number; since?: number },
    onLine: (line: LogLine) => void,
  ): () => void;
}
