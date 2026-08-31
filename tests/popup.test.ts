// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, SETTINGS_KEY, SITE_RULES_KEY } from "../src/settings";

describe("popup initialization", () => {
  it("keeps controls disabled until storage is loaded, then renders safely", async () => {
    document.body.innerHTML = `
      <main>
        <input id="global-enabled" type="checkbox"><input id="site-enabled" type="checkbox">
        <button id="clear-site-rule"></button><div id="site-row"></div><span id="hostname"></span>
        <select id="display-mode">
          <option value="append"></option><option value="append-compact"></option><option value="replace"></option>
        </select>
        <input id="live-updates" type="checkbox">
        <select id="maximum-odds"><option value="10000"></option></select>
        <p id="status"></p><input id="calculator-input"><output id="calculator-output"></output>
      </main>`;

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
    localCallback({ [SITE_RULES_KEY]: {} });

    const globalToggle = document.getElementById("global-enabled") as HTMLInputElement;
    const calculator = document.getElementById("calculator-input") as HTMLInputElement;
    expect(globalToggle.disabled).toBe(false);
    expect(globalToggle.checked).toBe(true);
    expect(document.getElementById("hostname")!.textContent).toBe("sports.example");

    calculator.value = "+140";
    calculator.dispatchEvent(new Event("input"));
    expect((document.getElementById("calculator-output") as HTMLOutputElement).value).toBe(
      "41.7% implied probability",
    );
  });
});
