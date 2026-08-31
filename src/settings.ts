import { GlobalSettings, SiteRules } from "./types";

export const SETTINGS_KEY = "globalSettings";
export const SITE_RULES_KEY = "siteRules";

export const DEFAULT_SETTINGS: GlobalSettings = Object.freeze({
  enabled: false,
  displayMode: "append",
  liveUpdates: true,
  maximumOdds: 10000,
});

const ALLOWED_MAXIMUMS = [1000, 10000, 100000];

export function sanitizeSettings(value: unknown, legacyEnabled?: unknown): GlobalSettings {
  const input = isRecord(value) ? value : {};
  return {
    enabled:
      typeof input.enabled === "boolean"
        ? input.enabled
        : typeof legacyEnabled === "boolean"
          ? legacyEnabled
          : DEFAULT_SETTINGS.enabled,
    displayMode:
      input.displayMode === "replace" || input.displayMode === "append-compact"
        ? input.displayMode
        : "append",
    liveUpdates:
      typeof input.liveUpdates === "boolean"
        ? input.liveUpdates
        : DEFAULT_SETTINGS.liveUpdates,
    maximumOdds:
      typeof input.maximumOdds === "number" && ALLOWED_MAXIMUMS.includes(input.maximumOdds)
        ? input.maximumOdds
        : DEFAULT_SETTINGS.maximumOdds,
  };
}

export function sanitizeSiteRules(value: unknown): SiteRules {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([hostname, enabled]) =>
          typeof enabled === "boolean" && isSafeHostname(hostname),
      )
      .slice(0, 250),
  ) as SiteRules;
}

export function effectiveSettings(
  settings: GlobalSettings,
  rules: SiteRules,
  hostname: string,
): GlobalSettings {
  const siteSetting = rules[hostname];
  return typeof siteSetting === "boolean" ? { ...settings, enabled: siteSetting } : settings;
}

export function isSafeHostname(hostname: string): boolean {
  return (
    hostname.length > 0 &&
    hostname.length <= 253 &&
    !hostname.startsWith(".") &&
    !hostname.endsWith(".") &&
    /^[a-z0-9.-]+$/i.test(hostname)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
