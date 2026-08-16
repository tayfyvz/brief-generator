import { describe, expect, it } from "vitest";
import { tierForUrl } from "@/lib/research/tiering";

describe("tierForUrl", () => {
  it("marks government and civic-platform sources T1", () => {
    expect(tierForUrl("https://www.weehawken-nj.us/budget.pdf")).toBe(1);
    expect(tierForUrl("https://ecode360.com/WE1234")).toBe(1);
    expect(tierForUrl("https://www.kim.senate.gov/appropriations")).toBe(1);
    expect(tierForUrl("https://usfa.fema.gov/registry/entry")).toBe(1);
  });

  it("marks manufacturer/dealer/industry sources T2", () => {
    expect(tierForUrl("https://www.piercemfg.com/deliveries/123")).toBe(2);
    expect(tierForUrl("https://www.firefighterone.com/deliveries/x")).toBe(2);
    expect(tierForUrl("https://www.fireapparatusmagazine.com/article")).toBe(2);
  });

  it("marks fan/social sources T4 (leads only)", () => {
    expect(tierForUrl("https://fire.fandom.com/wiki/Weehawken")).toBe(4);
    expect(tierForUrl("https://www.youtube.com/watch?v=abc")).toBe(4);
    expect(tierForUrl("https://www.facebook.com/nhrfr/posts/1")).toBe(4);
  });

  it("treats a department's own domain as T1 via officialDomains", () => {
    expect(tierForUrl("https://www.nhrfr.org/about", ["nhrfr.org"])).toBe(1);
    // Without the hint, an unknown .org would be local-press tier; but the
    // fire-department name heuristic still catches it.
    expect(tierForUrl("https://www.nhrfr.org/about")).toBe(1);
  });

  it("defaults unknown domains to T3 and junk to T4", () => {
    expect(tierForUrl("https://hudsoncountyview.com/article")).toBe(3);
    expect(tierForUrl("not a url")).toBe(4);
  });

  it("tiers stale national directories at 3 despite fire-dept hostnames", () => {
    expect(tierForUrl("https://usfiredept.com/lexington-volunteer-fire-department-13086.html")).toBe(3);
    expect(tierForUrl("https://www.usfirepolice.net/md_maryland/md_wise_avenue.html")).toBe(3);
    expect(tierForUrl("https://www.firenews.org/vt/w/washington/washingtonvt.html")).toBe(3);
    expect(tierForUrl("https://digitalfirehouse.com/info/vt/orange/washington.htm")).toBe(3);
    expect(tierForUrl("https://www.mapquest.com/us/indiana/lexington-vfd-290339041")).toBe(3);
  });
});
