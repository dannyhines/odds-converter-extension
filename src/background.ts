import { sanitizeSettings, SETTINGS_KEY } from "./settings";
import { ExtensionMessage } from "./types";

interface FrameStatus {
  active: boolean;
  count: number;
  hostname: string;
}

const frameStatuses = new Map<number, Map<number, FrameStatus>>();

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get([SETTINGS_KEY, "isActive"], (values) => {
    const settings = sanitizeSettings(values[SETTINGS_KEY], values.isActive);
    chrome.storage.sync.set({ [SETTINGS_KEY]: settings }, () => {
      if (!chrome.runtime.lastError) chrome.storage.sync.remove("isActive");
    });
  });
});

chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  if (message?.type === "engine-status" && sender.tab?.id !== undefined) {
    const tabStatuses = frameStatuses.get(sender.tab.id) ?? new Map();
    tabStatuses.set(sender.frameId ?? 0, {
      active: message.status.active,
      count: message.status.convertedCount,
      hostname: message.status.hostname,
    });
    frameStatuses.set(sender.tab.id, tabStatuses);
    const active = [...tabStatuses.values()].some((status) => status.active);
    const count = [...tabStatuses.values()].reduce((total, status) => total + status.count, 0);
    updateBadge(sender.tab.id, active, count);
    return false;
  }
  if (message?.type === "engine-unloaded" && sender.tab?.id !== undefined) {
    const tabStatuses = frameStatuses.get(sender.tab.id);
    tabStatuses?.delete(sender.frameId ?? 0);
    if (tabStatuses?.size === 0) frameStatuses.delete(sender.tab.id);
    const remaining = tabStatuses ? [...tabStatuses.values()] : [];
    updateBadge(
      sender.tab.id,
      remaining.some((status) => status.active),
      remaining.reduce((total, status) => total + status.count, 0),
    );
    return false;
  }
  if (message?.type === "get-tab-status") {
    const tabStatuses = frameStatuses.get(message.tabId);
    const statuses = [...(tabStatuses?.values() ?? [])];
    if (statuses.length === 0) sendResponse(undefined);
    else
      sendResponse({
        active: statuses.some((status) => status.active),
        convertedCount: statuses.reduce((total, status) => total + status.count, 0),
        hostname: tabStatuses?.get(0)?.hostname ?? statuses.find((status) => status.hostname)?.hostname ?? "",
      });
    return false;
  }
  return false;
});

chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  if (message?.type !== "resolve-top-hostname" || sender.tab?.id === undefined) return false;
  chrome.tabs.sendMessage(
    sender.tab.id,
    { type: "get-frame-hostname" } satisfies ExtensionMessage,
    { frameId: 0 },
    (response) => {
      void chrome.runtime.lastError;
      sendResponse({ hostname: response?.hostname ?? "" });
    },
  );
  return true;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") updateBadge(tabId, false, 0);
  if (changeInfo.status === "loading") frameStatuses.delete(tabId);
});

chrome.tabs.onRemoved.addListener((tabId) => frameStatuses.delete(tabId));

function updateBadge(tabId: number, active: boolean, count: number): void {
  const text = active ? "ON" : "OFF";
  chrome.action.setBadgeText({ tabId, text });
  chrome.action.setBadgeBackgroundColor({ tabId, color: active ? "#157347" : "#6b7280" });
  chrome.action.setTitle({
    tabId,
    title: active
      ? `Odds Converter is on${count > 0 ? ` (${count} odds converted)` : ""}`
      : "Odds Converter is off",
  });
}
