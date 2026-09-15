export function sanitizeProjectName(name: string): string {
  const s = name.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return s || 'project';
}
