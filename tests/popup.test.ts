// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, SETTINGS_KEY, SITE_RULES_KEY } from "../src/settings";

describe("popup initialization", () => {
  it("keeps controls disabled until storage is loaded, then renders safely", async () => {
    document.body.innerHTML = `
      <main>
        <input id="global-enabled" type="checkbox"><input id="site-enabled" type="checkbox">
        <span id="hostname"></span><span id="sites-count"></span>
        <div id="site-rules-list"></div><p id="empty-sites"></p>
        <select id="display-mode">
          <option value="append"></option><option value="append-compact"></option><option value="replace"></option>
        </select>
        <input id="live-updates" type="checkbox">
        <select id="maximum-odds"><option value="10000"></option></select>
        <p id="status"></p><input id="calculator-input"><output id="calculator-output"></output>
        <div id="settings-view"></div><div id="sites-view" hidden><button data-back></button></div>
        <div id="calculator-view" hidden><button data-back></button></div>
        <button id="sites-view-button"></button>
      </main><button id="calculator-view-button"></button>`;

    let tabsCallback!: (tabs: Array<{ id: number }>) => void;
    let syncCallback!: (values: Record<string, unknown>) => void;
    let localCallback!: (values: Record<string, unknown>) => void;
    const chromeMock = {
      tabs: {
        query: vi.fn((_query, callback) => { tabsCallback = callback; }),
        sendMessage: vi.fn((_tabId, _message, callback) => callback(undefined)),
      },
      storage: {
        sync: {
          get: vi.fn((_keys, callback) => { syncCallback = callback; }),
          set: vi.fn((_values, callback) => callback()),
        },
        local: {
          get: vi.fn((_keys, callback) => { localCallback = callback; }),
          set: vi.fn((_values, callback) => callback()),
        },
      },
      runtime: {
        lastError: undefined,
        sendMessage: vi.fn((_message, callback) =>
          callback({ active: true, convertedCount: 2, hostname: "sports.example" }),
        ),
      },
    };
    vi.stubGlobal("chrome", chromeMock);

    await import("../src/popup");
    expect((document.getElementById("global-enabled") as HTMLInputElement).disabled).toBe(true);

    tabsCallback([{ id: 7 }]);
    syncCallback({ [SETTINGS_KEY]: { ...DEFAULT_SETTINGS, enabled: true } });
    localCallback({ [SITE_RULES_KEY]: { "other.example": false, "sports.example": true } });

    const globalToggle = document.getElementById("global-enabled") as HTMLInputElement;
    const calculator = document.getElementById("calculator-input") as HTMLInputElement;
    expect(globalToggle.disabled).toBe(false);
    expect(globalToggle.checked).toBe(true);
    expect(document.getElementById("hostname")!.textContent).toBe("sports.example");
    expect(document.getElementById("sites-count")!.textContent).toBe("2 saved →");
    const savedSiteToggles = document.querySelectorAll<HTMLInputElement>("#site-rules-list input");
    expect(savedSiteToggles).toHaveLength(2);
    expect(savedSiteToggles[0].closest("label")?.textContent).toBe("other.example");
    expect(savedSiteToggles[0].checked).toBe(false);
    expect(savedSiteToggles[1].closest("label")?.textContent).toBe("sports.example");
    expect(savedSiteToggles[1].checked).toBe(true);

    savedSiteToggles[0].checked = true;
    savedSiteToggles[0].dispatchEvent(new Event("change"));
    expect(chromeMock.storage.local.set).toHaveBeenCalledWith(
      { [SITE_RULES_KEY]: { "other.example": true, "sports.example": true } },
      expect.any(Function),
    );

    document.getElementById("sites-view-button")!.click();
    expect(document.getElementById("settings-view")!.hidden).toBe(true);
    expect(document.getElementById("sites-view")!.hidden).toBe(false);
    (document.querySelector("#sites-view [data-back]") as HTMLButtonElement).click();
    expect(document.getElementById("settings-view")!.hidden).toBe(false);

    document.getElementById("calculator-view-button")!.click();
    expect(document.getElementById("calculator-view")!.hidden).toBe(false);

    calculator.value = "+140";
    calculator.dispatchEvent(new Event("input"));
    expect((document.getElementById("calculator-output") as HTMLOutputElement).value).toBe(
      "41.7% implied probability",
    );
  });
});
