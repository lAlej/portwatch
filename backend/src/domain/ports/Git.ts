export interface Git {
  clone(url: string, dest: string): Promise<void>;
  pull(cwd: string): AsyncIterable<{ line: string; stream: 'stdout' | 'stderr' }>;
  hasDockerfile(cwd: string): Promise<boolean>;
  findComposeFile(cwd: string): Promise<string | null>;
  removeDir(path: string): Promise<void>;
  writeEnvFile(cwd: string, vars: { key: string; value: string }[]): Promise<void>;
}
