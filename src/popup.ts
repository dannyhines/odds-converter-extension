import { impliedProbability } from "./converter";
import {
  isSafeHostname,
  sanitizeSettings,
  sanitizeSiteRules,
  SETTINGS_KEY,
  SITE_RULES_KEY,
} from "./settings";
import { EngineStatus, ExtensionMessage, GlobalSettings, SiteRules } from "./types";

const globalEnabled = byId<HTMLInputElement>("global-enabled");
const siteEnabled = byId<HTMLInputElement>("site-enabled");
const clearSiteRule = byId<HTMLButtonElement>("clear-site-rule");
const siteRow = byId<HTMLElement>("site-row");
const hostnameLabel = byId<HTMLElement>("hostname");
const displayMode = byId<HTMLSelectElement>("display-mode");
const precision = byId<HTMLSelectElement>("precision");
const liveUpdates = byId<HTMLInputElement>("live-updates");
const maximumOdds = byId<HTMLSelectElement>("maximum-odds");
const status = byId<HTMLElement>("status");
const calculatorInput = byId<HTMLInputElement>("calculator-input");
const calculatorOutput = byId<HTMLOutputElement>("calculator-output");
const controls = [
  ...document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>(
    "main input, main select, main button",
  ),
];

let settings: GlobalSettings;
let siteRules: SiteRules = {};
let hostname = "";
let activeTabId: number | undefined;

setControlsDisabled(true);
initialize();

function initialize(): void {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    activeTabId = tab?.id;
    chrome.storage.sync.get([SETTINGS_KEY, "isActive"], (syncValues) => {
      settings = sanitizeSettings(syncValues[SETTINGS_KEY], syncValues.isActive);
      chrome.storage.local.get([SITE_RULES_KEY], (localValues) => {
        siteRules = sanitizeSiteRules(localValues[SITE_RULES_KEY]);
        render();
        setControlsDisabled(false);
        requestStatus();
      });
    });
  });
}

globalEnabled.addEventListener("change", () => {
  settings = { ...settings, enabled: globalEnabled.checked };
  saveSettings();
});

siteEnabled.addEventListener("change", () => {
  if (!hostname) return;
  const remaining = Object.entries(siteRules).filter(([key]) => key !== hostname).slice(-249);
  siteRules = Object.fromEntries([...remaining, [hostname, siteEnabled.checked]]);
  saveSiteRules();
});

clearSiteRule.addEventListener("click", () => {
  if (!hostname) return;
  const { [hostname]: _removed, ...remaining } = siteRules;
  siteRules = remaining;
  saveSiteRules();
});

displayMode.addEventListener("change", () => {
  settings = { ...settings, displayMode: displayMode.value === "replace" ? "replace" : "append" };
  saveSettings();
});

precision.addEventListener("change", () => {
  settings = { ...settings, precision: Number(precision.value) };
  saveSettings();
});

liveUpdates.addEventListener("change", () => {
  settings = { ...settings, liveUpdates: liveUpdates.checked };
  saveSettings();
});

maximumOdds.addEventListener("change", () => {
  settings = { ...settings, maximumOdds: Number(maximumOdds.value) };
  saveSettings();
});

calculatorInput.addEventListener("input", updateCalculator);

function render(): void {
  globalEnabled.checked = settings.enabled;
  displayMode.value = settings.displayMode;
  precision.value = String(settings.precision);
  liveUpdates.checked = settings.liveUpdates;
  maximumOdds.value = String(settings.maximumOdds);

  const hasSiteRule = Object.prototype.hasOwnProperty.call(siteRules, hostname);
  siteEnabled.checked = hasSiteRule ? siteRules[hostname] : settings.enabled;
  clearSiteRule.hidden = !hasSiteRule;
  siteRow.hidden = !hostname;
  hostnameLabel.textContent = hostname || "Unavailable on this page";
  updateCalculator();
}

function saveSettings(): void {
  setBusy(true);
  chrome.storage.sync.set({ [SETTINGS_KEY]: settings }, () => {
    setBusy(false);
    if (chrome.runtime.lastError) showStatus("Could not save settings", "error");
    else {
      render();
      window.setTimeout(requestStatus, 80);
    }
  });
}

function saveSiteRules(): void {
  setBusy(true);
  chrome.storage.local.set({ [SITE_RULES_KEY]: siteRules }, () => {
    setBusy(false);
    if (chrome.runtime.lastError) showStatus("Could not save this site rule", "error");
    else {
      render();
      window.setTimeout(requestStatus, 80);
    }
  });
}

function requestStatus(): void {
  if (activeTabId === undefined) {
    showStatus("Unavailable on this page", "muted");
    return;
  }
  chrome.runtime.sendMessage(
    { type: "get-tab-status", tabId: activeTabId } satisfies ExtensionMessage,
    (aggregate?: EngineStatus) => {
      if (aggregate) {
        applyEngineStatus(aggregate);
        return;
      }
      chrome.tabs.sendMessage(
        activeTabId!,
        { type: "get-status" } satisfies ExtensionMessage,
        (response?: EngineStatus) => {
          if (chrome.runtime.lastError || !response) {
            showStatus("Reload the page to start converting odds", "muted");
          } else applyEngineStatus(response);
        },
      );
    },
  );
}

function applyEngineStatus(engineStatus: EngineStatus): void {
  const nextHostname = isSafeHostname(engineStatus.hostname)
    ? engineStatus.hostname.toLowerCase()
    : "";
  if (hostname !== nextHostname) {
    hostname = nextHostname;
    render();
  }
  showEngineStatus(engineStatus);
}

function showEngineStatus(engineStatus: EngineStatus): void {
  showStatus(
    engineStatus.active
      ? `${engineStatus.convertedCount} odd${engineStatus.convertedCount === 1 ? "" : "s"} converted`
      : "Conversion is off on this site",
    engineStatus.active ? "active" : "muted",
  );
}

function updateCalculator(): void {
  const match = calculatorInput.value.trim().match(/^([+\-\u2212])(\d{3,6})$/);
  if (!match) {
    calculatorOutput.value = calculatorInput.value ? "Enter odds like +140 or -110" : "";
    return;
  }
  const magnitude = Number(match[2]);
  if (magnitude < 100 || magnitude > 100000 || match[2].startsWith("0")) {
    calculatorOutput.value = "American odds start at ±100";
    return;
  }
  const odds = match[1] === "+" ? magnitude : -magnitude;
  calculatorOutput.value = `${(impliedProbability(odds) * 100).toFixed(settings.precision)}% implied probability`;
}

function showStatus(message: string, tone: "active" | "muted" | "error"): void {
  status.textContent = message;
  status.dataset.tone = tone;
}

function setBusy(busy: boolean): void {
  document.body.setAttribute("aria-busy", String(busy));
  setControlsDisabled(busy);
}

function setControlsDisabled(disabled: boolean): void {
  controls.forEach((control) => {
    control.disabled = disabled;
  });
}

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing popup element: ${id}`);
  return element as T;
}
