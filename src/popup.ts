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
const hostnameLabel = byId<HTMLElement>("hostname");
const sitesCount = byId<HTMLElement>("sites-count");
const siteRulesList = byId<HTMLElement>("site-rules-list");
const emptySites = byId<HTMLElement>("empty-sites");
const displayMode = byId<HTMLSelectElement>("display-mode");
const liveUpdates = byId<HTMLInputElement>("live-updates");
const maximumOdds = byId<HTMLSelectElement>("maximum-odds");
const status = byId<HTMLElement>("status");
const calculatorInput = byId<HTMLInputElement>("calculator-input");
const calculatorOutput = byId<HTMLOutputElement>("calculator-output");
const settingsView = byId<HTMLElement>("settings-view");
const sitesView = byId<HTMLElement>("sites-view");
const calculatorView = byId<HTMLElement>("calculator-view");
const sitesViewButton = byId<HTMLButtonElement>("sites-view-button");
const calculatorViewButton = byId<HTMLButtonElement>("calculator-view-button");

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

displayMode.addEventListener("change", () => {
  const selectedMode = displayMode.value;
  settings = {
    ...settings,
    displayMode:
      selectedMode === "replace" || selectedMode === "append-compact"
        ? selectedMode
        : "append",
  };
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
sitesViewButton.addEventListener("click", () => showView(sitesView));
calculatorViewButton.addEventListener("click", () => {
  showView(calculatorView);
  calculatorInput.focus();
});
document.querySelectorAll<HTMLButtonElement>("[data-back]").forEach((button) => {
  button.addEventListener("click", () => showView(settingsView));
});

function render(): void {
  globalEnabled.checked = settings.enabled;
  displayMode.value = settings.displayMode;
  liveUpdates.checked = settings.liveUpdates;
  maximumOdds.value = String(settings.maximumOdds);

  const hasSiteRule = Object.prototype.hasOwnProperty.call(siteRules, hostname);
  siteEnabled.checked = hasSiteRule ? siteRules[hostname] : settings.enabled;
  siteEnabled.disabled = !hostname;
  hostnameLabel.textContent = hostname || "Unavailable on this page";
  renderSiteRules();
  updateCalculator();
}

function renderSiteRules(): void {
  const entries = Object.entries(siteRules).sort(([left], [right]) => left.localeCompare(right));
  sitesCount.textContent = `${entries.length} saved →`;
  emptySites.hidden = entries.length > 0;
  siteRulesList.replaceChildren(
    ...entries.map(([savedHostname, enabled]) => {
      const label = document.createElement("label");
      label.className = "site-list-row";

      const name = document.createElement("span");
      name.textContent = savedHostname;

      const toggle = document.createElement("input");
      toggle.type = "checkbox";
      toggle.setAttribute("role", "switch");
      toggle.checked = enabled;
      toggle.addEventListener("change", () => {
        siteRules = { ...siteRules, [savedHostname]: toggle.checked };
        saveSiteRules();
      });

      label.append(name, toggle);
      return label;
    }),
  );
}

function showView(view: HTMLElement): void {
  settingsView.hidden = view !== settingsView;
  sitesView.hidden = view !== sitesView;
  calculatorView.hidden = view !== calculatorView;
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
  calculatorOutput.value = `${(impliedProbability(odds) * 100).toFixed(1)}% implied probability`;
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
  document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>(
    "input, select, button",
  ).forEach((control) => {
    control.disabled = disabled;
  });
  if (!disabled) siteEnabled.disabled = !hostname;
}

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing popup element: ${id}`);
  return element as T;
}
