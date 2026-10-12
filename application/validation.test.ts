import { describe, expect, it } from "vitest";
import { validateData } from "./validation";

const person = {
  first: "Ada",
  last: "Lovelace",
  email: "ada@example.com",
  address: "1 Analytical Way",
  created: "1815-12-10",
  balance: "$1,000.00",
};

describe("validateData", () => {
  it("returns valid data unchanged", () => {
    expect(validateData([person])).toEqual([person]);
  });

  it("accepts an empty list", () => {
    expect(validateData([])).toEqual([]);
  });

  it("throws when a field is missing", () => {
    const incomplete: Partial<typeof person> = { ...person };
    delete incomplete.email;
    expect(() => validateData([incomplete])).toThrow();
  });

  it("throws when a field has the wrong type", () => {
    expect(() => validateData([{ ...person, balance: 100 }])).toThrow();
  });

  it("throws when the payload is not an array", () => {
    expect(() => validateData(person)).toThrow();
    expect(() => validateData(null)).toThrow();
  });
});
