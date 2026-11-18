import { describe, expect, it } from "vitest";
import { callerKey, createLimiter } from "./rateLimit";

describe("createLimiter", () => {
  it("allows the limit within a window, then refuses", () => {
    const t = 0;
    const allow = createLimiter(3, 1000, () => t);
    expect([allow("a"), allow("a"), allow("a"), allow("a")]).toEqual([true, true, true, false]);
  });
  it("counts each caller separately", () => {
    const allow = createLimiter(1, 1000, () => 0);
    expect([allow("a"), allow("b"), allow("a")]).toEqual([true, true, false]);
  });
  it("starts a fresh window once the old one has passed", () => {
    let t = 0;
    const allow = createLimiter(1, 1000, () => t);
    expect(allow("a")).toBe(true);
    expect(allow("a")).toBe(false);
    t = 1000;
    expect(allow("a")).toBe(true);
  });
});

describe("callerKey", () => {
  it("takes the first forwarded address, then the real-ip header, then one shared bucket", () => {
    expect(callerKey(new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4");
    expect(callerKey(new Headers({ "x-real-ip": "5.6.7.8" }))).toBe("5.6.7.8");
    expect(callerKey(new Headers())).toBe("unknown");
  });
});
