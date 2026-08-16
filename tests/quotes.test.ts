import { describe, expect, it } from "vitest";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";

const { makeQuoteMatcher } = await import("@/lib/research/facts");

const quoteAppearsIn = (quote: string, page: string) =>
  makeQuoteMatcher(page)(quote);

describe("quoteAppearsIn", () => {
  it("matches exact spans, whitespace-insensitively", () => {
    const page = "The department  operates\na 2015 Pierce Saber pumper.";
    expect(quoteAppearsIn("operates a 2015 Pierce Saber", page)).toBe(true);
  });

  it("rejects quotes that are not on the page", () => {
    expect(quoteAppearsIn("a 1998 E-ONE ladder", "a 2015 Pierce Saber")).toBe(false);
    expect(quoteAppearsIn("", "anything")).toBe(false);
  });

  it("matches quotes copied out of markdown tables without the pipes", () => {
    const page = "| 4280 | 1980 | Ford F-700/American | 750 GPM |";
    expect(quoteAppearsIn("4280 1980 Ford F-700/American 750 GPM", page)).toBe(true);
  });

  it("matches quotes copied out of markdown links without the brackets", () => {
    const page = "Contact [Chief John Smith](mailto:js@fd.org) for bids.";
    expect(quoteAppearsIn("Chief John Smith", page)).toBe(true);
  });

  it("still requires token order to match the page", () => {
    const page = "| 4280 | 1980 | Ford F-700 |";
    expect(quoteAppearsIn("1980 4280 Ford F-700", page)).toBe(false);
  });

  it("treats currency punctuation loosely but keeps digits strict", () => {
    const page = "awarded a grant of $1,018 from the fund";
    expect(quoteAppearsIn("grant of $1,018", page)).toBe(true);
    expect(quoteAppearsIn("grant of $1,019", page)).toBe(false);
  });
});
