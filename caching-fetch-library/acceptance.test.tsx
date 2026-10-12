import React from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../application/App";
import { initializeCache, serializeCache, wipeCache } from "./cachingFetch";

// Server-side acceptance criteria from DevTask.md, run against the real <App />
// (App -> Person -> Name) with only `fetch` stubbed. The browser-only criteria
// (exactly 1 request while hydrating, from useEffect) need a DOM and are
// verified manually in Chrome; see the README.

const API_URL =
  "https://randomapi.com/api/6de6abfedb24f889e0b5f675edc50deb?fmt=raw&sole&seed=123";

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
    first: "Alan",
    last: "Turing",
    email: "alan@example.com",
    address: "2 Enigma Road",
    created: "1912-06-23",
    balance: "$2,000.00",
  },
  {
    first: "Grace",
    last: "Hopper",
    email: "grace@example.com",
    address: "3 Compiler Court",
    created: "1906-12-09",
    balance: "$3,000.00",
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
    // renderToString puts a comment marker between the two text nodes of the name.
    expect(html).toContain(p.first);
    expect(html).toContain(p.last);
  }
  expect(html).not.toContain("Loading...");
  expect(html).not.toContain("Error:");
};

beforeEach(() => {
  wipeCache();
  vi.unstubAllGlobals();
});

describe("/appWithSSRData (server)", () => {
  it("is fully server-rendered after the preload, with one request", async () => {
    const fetchMock = stubFetch();

    await App.preLoadServerData?.();
    const html = renderToString(<App />);

    expectEveryoneRendered(html);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(API_URL);
  });
});

describe("/appWithoutSSRData (server)", () => {
  it("renders the loading state and does not fetch on the server", () => {
    const fetchMock = stubFetch();

    const html = renderToString(<App />);

    expect(html).toContain("Loading...");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("/appWithSSRData (browser)", () => {
  it("renders from the serialized cache without calling the API", async () => {
    // Server: preload and serialize.
    stubFetch();
    await App.preLoadServerData?.();
    const serialized = serializeCache();

    // Browser: fresh module state, hydrated from the injected string.
    wipeCache();
    const browserFetch = stubFetch();
    initializeCache(serialized);
    const html = renderToString(<App />);

    expectEveryoneRendered(html);
    expect(browserFetch).not.toHaveBeenCalled();
  });
});
