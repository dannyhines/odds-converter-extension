import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  effectiveSettings,
  sanitizeSettings,
  sanitizeSiteRules,
} from "../src/settings";

describe("settings validation", () => {
  it("starts opt-in globally with live updates enabled", () => {
    expect(DEFAULT_SETTINGS.enabled).toBe(false);
    expect(DEFAULT_SETTINGS.liveUpdates).toBe(true);
  });

  it("uses safe defaults for corrupt storage", () => {
    expect(sanitizeSettings({ enabled: "yes", precision: 99, maximumOdds: 42 })).toEqual({
      ...DEFAULT_SETTINGS,
    });
  });

  it("migrates the legacy enabled flag", () => {
    expect(sanitizeSettings(undefined, true).enabled).toBe(true);
  });

  it("accepts known options and ignores retired precision settings", () => {
    expect(
      sanitizeSettings({
        enabled: true,
        displayMode: "replace",
        precision: 3,
        liveUpdates: false,
        maximumOdds: 100000,
      }),
    ).toEqual({
      enabled: true,
      displayMode: "replace",
      liveUpdates: false,
      maximumOdds: 100000,
    });
  });

  it("accepts the compact append format", () => {
    expect(sanitizeSettings({ displayMode: "append-compact" }).displayMode).toBe("append-compact");
  });

  it("keeps valid local host rules and rejects malformed keys", () => {
    expect(
      sanitizeSiteRules({ "sports.example": true, "bad host": false, ".example": true }),
    ).toEqual({ "sports.example": true });
  });

  it("applies a local site rule without changing global settings", () => {
    const global = { ...DEFAULT_SETTINGS, enabled: false };
    expect(effectiveSettings(global, { "sports.example": true }, "sports.example").enabled).toBe(
      true,
    );
    expect(global.enabled).toBe(false);
  });
});
