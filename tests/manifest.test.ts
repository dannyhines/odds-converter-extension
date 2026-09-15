/// <reference types="node" />
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createManifest } = require("../config/manifest.js") as {
  createManifest: (browser: string) => Record<string, any>;
};

describe("browser manifests", () => {
  it("uses a service worker for Chrome and Edge", () => {
    for (const browser of ["chrome", "edge"]) {
      const manifest = createManifest(browser);
      expect(manifest.background).toEqual({ service_worker: "js/background.js" });
      expect(manifest.minimum_chrome_version).toBe("119");
      expect(manifest.browser_specific_settings).toBeUndefined();
    }
  });

  it("uses a signed event-page manifest for Firefox", () => {
    const manifest = createManifest("firefox");
    const gecko = manifest.browser_specific_settings.gecko;

    expect(manifest.background).toEqual({ scripts: ["js/background.js"] });
    expect(manifest.minimum_chrome_version).toBeUndefined();
    expect(gecko.id).toBe("odds-converter@dannyhines.com");
    expect(gecko.strict_min_version).toBe("128.0");
    expect(gecko.data_collection_permissions.required).toEqual(["none"]);
    expect(manifest.content_scripts[0].match_origin_as_fallback).toBe(true);
  });

  it("retains the minimal shared permission set", () => {
    for (const browser of ["chrome", "edge", "firefox"]) {
      expect(createManifest(browser).permissions).toEqual(["storage"]);
    }
  });

  it("rejects unknown build targets", () => {
    expect(() => createManifest("netscape")).toThrow(/Unsupported browser/);
  });
});
