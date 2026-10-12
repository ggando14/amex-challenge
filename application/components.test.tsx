import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCachingFetch } from "../caching-fetch-library/cachingFetch";
import Name from "./Name";
import Person from "./Person";

// Stub the data hook so tests never touch the network or Task 2's implementation.
vi.mock("../caching-fetch-library/cachingFetch", () => ({
  useCachingFetch: vi.fn(),
}));

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
];

const mockHook = (state: {
  data: unknown;
  isLoading: boolean;
  error: Error | null;
}) => vi.mocked(useCachingFetch).mockReturnValue(state);

describe("Name", () => {
  beforeEach(() => {
    mockHook({ data: people, isLoading: false, error: null });
  });

  it("renders the full name at the given index", () => {
    expect(renderToStaticMarkup(<Name index={1} />)).toBe(
      "<div><h2>Alan Turing</h2></div>",
    );
  });

  it("renders a loading state", () => {
    mockHook({ data: null, isLoading: true, error: null });
    expect(renderToStaticMarkup(<Name index={0} />)).toBe(
      "<div>Loading...</div>",
    );
  });

  it("renders the error message", () => {
    mockHook({ data: null, isLoading: false, error: new Error("boom") });
    expect(renderToStaticMarkup(<Name index={0} />)).toBe(
      "<div>Error: boom</div>",
    );
  });
});

describe("Person", () => {
  beforeEach(() => {
    mockHook({ data: people, isLoading: false, error: null });
  });

  it("renders name and details for the given index", () => {
    const html = renderToStaticMarkup(<Person index={0} />);
    expect(html).toContain("Ada Lovelace");
    expect(html).toContain("ada@example.com");
    expect(html).toContain("1 Analytical Way");
    expect(html).toContain("$1,000.00");
    expect(html).toContain("1815-12-10");
    expect(html).not.toContain("Turing");
  });

  it("renders a loading state", () => {
    mockHook({ data: null, isLoading: true, error: null });
    expect(renderToStaticMarkup(<Person index={0} />)).toBe(
      "<div>Loading...</div>",
    );
  });
});
