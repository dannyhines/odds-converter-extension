import { OddsDomController } from "./converter";
import {
  effectiveSettings,
  sanitizeSettings,
  sanitizeSiteRules,
  SETTINGS_KEY,
  SITE_RULES_KEY,
} from "./settings";
import { EngineStatus, ExtensionMessage } from "./types";

let controller: OddsDomController | null = null;
let configurationGeneration = 0;
const frameHostname = location.hostname.toLowerCase();
let siteHostname = frameHostname;
const isTopFrame = window.top === window;

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (
    (areaName === "sync" && (changes[SETTINGS_KEY] || changes.isActive)) ||
    (areaName === "local" && changes[SITE_RULES_KEY])
  ) reloadConfiguration();
});

chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    _sender,
    sendResponse: (response: EngineStatus | { hostname: string }) => void,
  ) => {
    if (message?.type === "get-frame-hostname" && isTopFrame) {
      sendResponse({ hostname: frameHostname });
      return false;
    }
    if (message?.type !== "get-status" || !isTopFrame) return false;
    sendResponse(currentStatus());
    return false;
  },
);

window.addEventListener("pageshow", reloadConfiguration);
window.addEventListener("pagehide", () => {
  controller?.stop();
  chrome.runtime.sendMessage(
    { type: "engine-unloaded" } satisfies ExtensionMessage,
    () => void chrome.runtime.lastError,
  );
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") reloadConfiguration();
});

reloadConfiguration();

function reloadConfiguration(): void {
  const generation = ++configurationGeneration;
  resolveSiteHostname((resolvedHostname) => {
    if (generation !== configurationGeneration) return;
    siteHostname = resolvedHostname;
    chrome.storage.sync.get([SETTINGS_KEY, "isActive"], (syncValues) => {
      if (generation !== configurationGeneration) return;
      const settings = sanitizeSettings(syncValues[SETTINGS_KEY], syncValues.isActive);
      chrome.storage.local.get([SITE_RULES_KEY], (localValues) => {
        if (generation !== configurationGeneration) return;
        const rules = sanitizeSiteRules(localValues[SITE_RULES_KEY]);
        const effective = effectiveSettings(settings, rules, siteHostname);
        if (!controller) {
          const instance = new OddsDomController(document, effective, reportStatus);
          controller = instance;
          instance.start();
        } else {
          controller.updateSettings(effective);
          controller.start();
        }
        reportStatus();
      });
    });
  });
}

function currentStatus(): EngineStatus {
  const status = controller?.getStatus() ?? { active: false, convertedCount: 0 };
  return { ...status, hostname: siteHostname };
}

function reportStatus(): void {
  chrome.runtime.sendMessage(
    { type: "engine-status", status: currentStatus() } satisfies ExtensionMessage,
    () => void chrome.runtime.lastError,
  );
}

function resolveSiteHostname(callback: (hostname: string) => void): void {
  if (isTopFrame) {
    callback(frameHostname);
    return;
  }
  chrome.runtime.sendMessage({ type: "resolve-top-hostname" } satisfies ExtensionMessage, (response) => {
    void chrome.runtime.lastError;
    const resolved = response?.hostname;
    callback(typeof resolved === "string" && resolved ? resolved : frameHostname);
  });
}
