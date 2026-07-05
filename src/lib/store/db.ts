/** Minimal typed IndexedDB wrapper. Two stores:
 *  - "projects": ProjectMeta records keyed by id
 *  - "media":    Blob records keyed by `${projectId}:${kind}`
 */

const DB_NAME = "tapedeck";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

export class StorageError extends Error {}

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new StorageError("Local storage is not available in this browser."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("projects")) {
        db.createObjectStore("projects", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("media")) {
        db.createObjectStore("media");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new StorageError("Could not open local project storage."));
  });
  return dbPromise;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new StorageError(request.error?.message ?? "Storage operation failed."));
  });
}

export async function dbGet<T>(store: string, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDb();
  return requestToPromise(db.transaction(store, "readonly").objectStore(store).get(key));
}

export async function dbGetAll<T>(store: string): Promise<T[]> {
  const db = await openDb();
  return requestToPromise(db.transaction(store, "readonly").objectStore(store).getAll());
}

export async function dbPut(store: string, value: unknown, key?: IDBValidKey): Promise<void> {
  const db = await openDb();
  await requestToPromise(db.transaction(store, "readwrite").objectStore(store).put(value, key));
}

export async function dbDelete(store: string, key: IDBValidKey): Promise<void> {
  const db = await openDb();
  await requestToPromise(db.transaction(store, "readwrite").objectStore(store).delete(key));
}

export async function dbKeys(store: string): Promise<IDBValidKey[]> {
  const db = await openDb();
  return requestToPromise(db.transaction(store, "readonly").objectStore(store).getAllKeys());
}
