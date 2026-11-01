export interface DatabaseDeletionPolicy {
  error: "reject" | "resolve";
  blocked: "reject" | "resolve";
}

/** Demo cleanup callers choose whether stale data can prevent their boot. */
export function deleteDatabase(name: string, policy: DatabaseDeletionPolicy): Promise<void> {
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  const request = indexedDB.deleteDatabase(name);
  request.onsuccess = () => resolve();
  request.onerror = () => {
    if (policy.error === "resolve") resolve();
    else reject(request.error ?? new Error("IndexedDB deletion failed"));
  };
  request.onblocked = () => {
    if (policy.blocked === "resolve") resolve();
    else reject(new Error("IndexedDB deletion was blocked by an open tab"));
  };
  return promise;
}
