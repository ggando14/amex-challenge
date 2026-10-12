// You may edit this file, add new files to support this file,
// and/or add new dependencies to the project as you see fit.
// However, you must not change the surface API presented from this file,
// and you should not need to change any other files in the project to complete the challenge

import type { AsyncLocalStorage } from "node:async_hooks";
import { useEffect, useState } from "react";

type Entry = {
  data: unknown;
  error: Error | null;
  // Set while a request is in flight; shared by every caller of the same url.
  promise: Promise<void> | null;
};

type Cache = Map<string, Entry>;

// In the browser there is one cache. On the server, requests overlap and each
// must see only its own data, so every request gets its own cache, tracked
// through async context. wipeCache() (called by the framework at the start of a
// request) opens that request's fresh cache.
// node:async_hooks cannot be imported statically: the same file is bundled for
// the browser. getBuiltinModule only exists in Node, so the browser skips this.
const globalCache: Cache = new Map();
const requestCaches: AsyncLocalStorage<Cache> | undefined = (() => {
  const nodeProcess = (
    globalThis as {
      process?: { getBuiltinModule?: (id: string) => unknown };
    }
  ).process;
  const asyncHooks = nodeProcess?.getBuiltinModule?.("node:async_hooks") as
    typeof import("node:async_hooks") | undefined;
  return asyncHooks && new asyncHooks.AsyncLocalStorage<Cache>();
})();

const currentCache = (): Cache => requestCaches?.getStore() ?? globalCache;

const listeners = new Set<() => void>();

const notify = () => listeners.forEach((listener) => listener());

const fetchInto = (url: string): Promise<void> => {
  const cache = currentCache();
  const existing = cache.get(url);
  if (existing?.promise) return existing.promise;

  const entry: Entry = { data: null, error: null, promise: null };
  entry.promise = fetch(url)
    .then((res) => {
      if (!res.ok)
        throw new Error(`Request failed: ${res.status} ${res.statusText}`);
      return res.json();
    })
    .then((data) => {
      entry.data = data;
    })
    .catch((err) => {
      entry.error = err instanceof Error ? err : new Error(String(err));
    })
    .finally(() => {
      entry.promise = null;
      notify();
    });
  cache.set(url, entry);
  return entry.promise;
};

type UseCachingFetch = (url: string) => {
  isLoading: boolean;
  data: unknown;
  error: Error | null;
};

/**
 * 1. Implement a caching fetch hook. The hook should return an object with the following properties:
 * - isLoading: a boolean that is true when the fetch is in progress and false otherwise
 * - data: the data returned from the fetch, or null if the fetch has not completed
 * - error: an error object if the fetch fails, or null if the fetch is successful
 *
 * This hook is called three times on the client:
 *  - 1 in App.tsx
 *  - 2 in Person.tsx
 *  - 3 in Name.tsx
 *
 * Acceptance Criteria:
 * 1. The application at /appWithoutSSRData should properly render, with JavaScript enabled, you should see a list of people.
 * 2. You should only see 1 network request in the browser's network tab when visiting the /appWithoutSSRData route.
 * 3. You have not changed any code outside of this file to achieve this.
 * 4. This file passes a type-check.
 *
 */
export const useCachingFetch: UseCachingFetch = (url) => {
  // Re-render when any request settles; the cache itself is the source of truth.
  const [, setTick] = useState(0);

  useEffect(() => {
    const listener = () => setTick((t) => t + 1);
    listeners.add(listener);
    // Effects only run in the browser, so this never fetches during SSR.
    // fetchInto dedupes, so many components using one url make one request.
    if (!currentCache().has(url)) void fetchInto(url);
    return () => {
      listeners.delete(listener);
    };
  }, [url]);

  const entry = currentCache().get(url);
  if (!entry) return { data: null, isLoading: true, error: null };
  return {
    data: entry.data,
    isLoading: entry.promise !== null,
    error: entry.error,
  };
};

/**
 * 2. Implement a preloading caching fetch function. The function should fetch the data.
 *
 * This function will be called once on the server before any rendering occurs.
 *
 * Any subsequent call to useCachingFetch should result in the returned data being available immediately.
 * Meaning that the page should be completely serverside rendered on /appWithSSRData
 *
 * Acceptance Criteria:
 * 1. The application at /appWithSSRData should properly render, with JavaScript disabled, you should see a list of people.
 * 2. You have not changed any code outside of this file to achieve this.
 * 3. This file passes a type-check.
 *
 */
export const preloadCachingFetch = async (url: string): Promise<void> => {
  // A failed preload is not fatal: the entry is skipped on serialization, so
  // the page renders its loading state and the browser retries the request.
  await fetchInto(url);
};

/**
 * 3.1 Implement a serializeCache function that serializes the cache to a string.
 * 3.2 Implement an initializeCache function that initializes the cache from a serialized cache string.
 *
 * Together, these two functions will help the framework transfer your cache to the browser.
 *
 * The framework will call `serializeCache` on the server to serialize the cache to a string and inject it into the dom.
 * The framework will then call `initializeCache` on the browser with the serialized cache string to initialize the cache.
 *
 * Acceptance Criteria:
 * 1. The application at /appWithSSRData should properly render, with JavaScript enabled, you should see a list of people.
 * 2. You should not see any network calls to the people API when visiting the /appWithSSRData route.
 * 3. You have not changed any code outside of this file to achieve this.
 * 4. This file passes a type-check.
 *
 */
// The framework embeds this string inside a single-quoted <script> literal
// without escaping, so it must contain no quotes, backslashes or "<".
// encodeURIComponent leaves "'" alone, hence the extra replace.
export const serializeCache = (): string => {
  const settled: Record<string, unknown> = {};
  currentCache().forEach((entry, url) => {
    if (!entry.promise && !entry.error) settled[url] = entry.data;
  });
  return encodeURIComponent(JSON.stringify(settled)).replace(/'/g, "%27");
};

export const initializeCache = (serializedCache: string): void => {
  const settled = JSON.parse(decodeURIComponent(serializedCache)) as Record<
    string,
    unknown
  >;
  Object.entries(settled).forEach(([url, data]) => {
    currentCache().set(url, { data, error: null, promise: null });
  });
};

export const wipeCache = (): void => {
  globalCache.clear();
  requestCaches?.enterWith(new Map());
};
