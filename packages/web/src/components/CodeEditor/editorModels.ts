/**
 * Open editor buffers, kept without loading Monaco: closing a tab drops its buffer, so the
 * file opens fresh next time. CodeEditor registers each buffer here.
 */
const disposers = new Map<string, () => void>();

export const modelKey = (projectId: string, path: string) => `${projectId}/${path}`;

export function registerModel(key: string, dispose: () => void): void {
  disposers.set(key, dispose);
}

export function disposeModel(projectId: string, path: string): void {
  const key = modelKey(projectId, path);
  disposers.get(key)?.();
  disposers.delete(key);
}
