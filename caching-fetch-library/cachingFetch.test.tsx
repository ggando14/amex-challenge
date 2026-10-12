import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  initializeCache,
  preloadCachingFetch,
  serializeCache,
  useCachingFetch,
  wipeCache,
} from "./cachingFetch";

const URL_A = "https://example.test/a";

const jsonResponse = (body: unknown) =>
  ({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => body,
  }) as Response;

const mockFetch = (impl: (url: string) => Promise<Response>) => {
  const fetchMock = vi.fn(impl);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

// Renders the hook the way the server does and returns what it produced.
const renderHook = (url: string) => {
  let result: ReturnType<typeof useCachingFetch> | undefined;
  const Probe = () => {
    result = useCachingFetch(url);
    return null;
  };
  renderToStaticMarkup(<Probe />);
  return result!;
};

beforeEach(() => {
  wipeCache();
  vi.unstubAllGlobals();
});

describe("preloadCachingFetch", () => {
  it("fetches once for concurrent callers of the same url", async () => {
    const fetchMock = mockFetch(async () => jsonResponse([1, 2, 3]));
    await Promise.all([
      preloadCachingFetch(URL_A),
      preloadCachingFetch(URL_A),
      preloadCachingFetch(URL_A),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("makes data available to the hook immediately", async () => {
    mockFetch(async () => jsonResponse([{ name: "Ada" }]));
    await preloadCachingFetch(URL_A);
    expect(renderHook(URL_A)).toEqual({
      data: [{ name: "Ada" }],
      isLoading: false,
      error: null,
    });
  });

  it("does not throw on a failed request and leaves it out of the cache", async () => {
    mockFetch(async () => Promise.reject(new Error("network down")));
    await expect(preloadCachingFetch(URL_A)).resolves.toBeUndefined();
    expect(JSON.parse(decodeURIComponent(serializeCache()))).toEqual({});
  });

  it("treats a non-2xx response as an error", async () => {
    mockFetch(
      async () =>
        ({
          ok: false,
          status: 500,
          statusText: "Boom",
          json: async () => ({}),
        }) as Response,
    );
    await preloadCachingFetch(URL_A);
    expect(JSON.parse(decodeURIComponent(serializeCache()))).toEqual({});
  });
});

describe("useCachingFetch", () => {
  it("reports loading and does not fetch during server rendering", () => {
    const fetchMock = mockFetch(async () => jsonResponse([]));
    expect(renderHook(URL_A)).toEqual({
      data: null,
      isLoading: true,
      error: null,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("serializeCache / initializeCache", () => {
  it("is safe to embed in a single-quoted script literal", async () => {
    const nasty = [
      "it's",
      "back\\slash",
      "</script><script>alert(1)</script>",
      "ünï \u2028 ☃",
    ];
    mockFetch(async () => jsonResponse(nasty));
    await preloadCachingFetch(URL_A);
    const serialized = serializeCache();

    expect(serialized).not.toMatch(/['"\\<>\s]/);

    wipeCache();
    initializeCache(serialized);
    expect(renderHook(URL_A).data).toEqual(nasty);
  });
});

describe("wipeCache", () => {
  it("empties the cache", async () => {
    mockFetch(async () => jsonResponse([1]));
    await preloadCachingFetch(URL_A);
    wipeCache();
    expect(renderHook(URL_A).isLoading).toBe(true);
    expect(JSON.parse(decodeURIComponent(serializeCache()))).toEqual({});
  });
});
