// Runs `op` after all previously queued operations for `key` have settled
// (success or failure). Callers own the `chains` map so scopes stay explicit.
export async function serializeByKey<T>(
  chains: Map<string, Promise<void>>,
  key: string,
  op: () => Promise<T>
): Promise<T> {
  const previous = chains.get(key) ?? Promise.resolve();
  const current = previous.then(op, op);
  const settled = current.then(
    () => undefined,
    () => undefined
  );
  chains.set(key, settled);
  try {
    return await current;
  } finally {
    if (chains.get(key) === settled) chains.delete(key);
  }
}
