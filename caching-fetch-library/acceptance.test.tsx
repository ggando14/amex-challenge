import React from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../application/App";
import buildHtmlDoc from "../framework/server/buildHtmlDoc";
import renderApp from "../framework/server/renderApp";
import { initializeCache, wipeCache } from "./cachingFetch";

// DevTask.md criteria for /appWithSSRData that can be checked without a DOM,
// using the real <App /> and the framework's own server code. Only `fetch` is
// stubbed. The browser-only criterion (exactly one request from useEffect
// while hydrating) is verified manually in Chrome; see the README.

const API_URL =
  "https://randomapi.com/api/6de6abfedb24f889e0b5f675edc50deb?fmt=raw&sole&seed=123";

// Includes characters that would break the framework's unescaped
// `window.__INITIAL_DATA__ = '...'` script if serialization did not handle them.
const people = [
  {
    first: "Ada",
    last: "Lovelace",
    email: "ada@example.com",
    address: "1 Analytical Way",
    created: "1815-12-10",
    balance: "$1,000.00",
  },
  {
    first: "Conan",
    last: "O'Brien",
    email: "conan@example.com",
    address: "2 </script><script>alert(1)</script> Street",
    created: "1963-04-18",
    balance: "$2,000.00",
  },
];

const stubFetch = () => {
  const fetchMock = vi.fn(
    async () =>
      ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => people,
      }) as Response,
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

const expectEveryoneRendered = (html: string) => {
  for (const p of people) {
    expect(html).toContain(p.email);
    expect(html).toContain(p.first);
  }
  expect(html).not.toContain("Loading...");
  expect(html).not.toContain("Error:");
};

beforeEach(() => {
  wipeCache();
  vi.unstubAllGlobals();
});

describe("/appWithSSRData", () => {
  it("is fully server-rendered with a single request", async () => {
    const fetchMock = stubFetch();

    const [html] = await renderApp(true);

    expectEveryoneRendered(html);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(API_URL);
  });

  it("hands its data to the browser without any API call", async () => {
    stubFetch();
    const doc = buildHtmlDoc(await renderApp(true));

    // Browser: a fresh cache, filled by running the script the server emitted.
    wipeCache();
    const browserFetch = stubFetch();
    const script = doc.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? "";
    const win: { __INITIAL_DATA__?: string } = {};
    new Function("window", script)(win);
    initializeCache(win.__INITIAL_DATA__!);

    expectEveryoneRendered(renderToString(<App />));
    expect(browserFetch).not.toHaveBeenCalled();
  });
});

describe("overlapping /appWithSSRData requests", () => {
  it("each render its own data, even if another request starts mid-fetch", async () => {
    // Same sequence as the route handler: wipe the cache, then preload and render.
    const handle = async () => {
      wipeCache();
      return renderApp(true);
    };

    // Hold each API response until the test releases it.
    const release: Array<() => void> = [];
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          release.push(() =>
            resolve({
              ok: true,
              status: 200,
              statusText: "OK",
              json: async () => people,
            } as Response),
          );
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const requestA = handle();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const requestB = handle(); // starts while A is still waiting on the API
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    release[0]();
    const [htmlA] = await requestA; // A finishes while B is still in flight
    release[1]();
    const [htmlB] = await requestB;

    expectEveryoneRendered(htmlA);
    expectEveryoneRendered(htmlB);
  });
});
