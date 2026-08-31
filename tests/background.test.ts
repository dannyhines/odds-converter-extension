import { beforeEach, describe, expect, it, vi } from "vitest";

describe("toolbar badge", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("shows activation state instead of the number of converted odds", async () => {
    const messageListeners: Array<
      (message: unknown, sender: { tab?: { id: number }; frameId?: number }, sendResponse: (value?: unknown) => void) => unknown
    > = [];
    const setBadgeText = vi.fn();
    const chromeMock = {
      runtime: {
        lastError: undefined,
        onInstalled: { addListener: vi.fn() },
        onMessage: {
          addListener: vi.fn((listener) => messageListeners.push(listener)),
        },
      },
      storage: {
        sync: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
      },
      tabs: {
        sendMessage: vi.fn(),
        onUpdated: { addListener: vi.fn() },
        onRemoved: { addListener: vi.fn() },
      },
      action: {
        setBadgeText,
        setBadgeBackgroundColor: vi.fn(),
        setTitle: vi.fn(),
      },
    };
    vi.stubGlobal("chrome", chromeMock);

    await import("../src/background");
    messageListeners[0](
      {
        type: "engine-status",
        status: { active: true, convertedCount: 250, hostname: "sports.example" },
      },
      { tab: { id: 7 }, frameId: 0 },
      vi.fn(),
    );

    expect(setBadgeText).toHaveBeenLastCalledWith({ tabId: 7, text: "ON" });
  });
});
