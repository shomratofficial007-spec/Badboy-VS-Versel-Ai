import { describe, expect, it } from "vitest";
import {
  parseAllowedHosts,
  parsePort,
  resolveApiProxyTarget,
} from "./vite.config.helpers";

describe("Vite config helpers", () => {
  it("uses localhost-only defaults instead of a wildcard host rule", () => {
    expect(parseAllowedHosts(undefined)).toEqual(["localhost", "127.0.0.1"]);
  });

  it("adds explicit configured hosts without enabling wildcard access", () => {
    expect(parseAllowedHosts("preview.example.com, .example.org")).toEqual([
      "localhost",
      "127.0.0.1",
      "preview.example.com",
      ".example.org",
    ]);
  });

  it.each(["*", "true", "example.com,,other.com"])(
    "rejects unsafe or malformed host allowlists (%s)",
    (value) => {
      expect(() => parseAllowedHosts(value)).toThrow();
    },
  );

  it("uses the configured API port when no proxy target is supplied", () => {
    expect(resolveApiProxyTarget(undefined, "3456")).toBe(
      "http://127.0.0.1:3456",
    );
  });

  it("accepts an explicit HTTP or HTTPS API proxy target", () => {
    expect(
      resolveApiProxyTarget("https://api.example.com/", undefined),
    ).toBe("https://api.example.com");
  });

  it("rejects non-HTTP proxy targets and embedded credentials", () => {
    expect(() =>
      resolveApiProxyTarget("ftp://api.example.com", undefined),
    ).toThrow();
    expect(() =>
      resolveApiProxyTarget("https://user:pass@api.example.com", undefined),
    ).toThrow();
  });

  it("validates ports and falls back only when no value is configured", () => {
    expect(parsePort(undefined, 4173)).toBe(4173);
    expect(parsePort("5173", 4173)).toBe(5173);
    expect(() => parsePort("0", 4173)).toThrow();
    expect(() => parsePort("70000", 4173)).toThrow();
    expect(() => parsePort("abc", 4173)).toThrow();
  });
});
