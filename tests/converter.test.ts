// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { convertText, impliedProbability, OddsDomController } from "../src/converter";
import { DEFAULT_SETTINGS } from "../src/settings";
import { GlobalSettings } from "../src/types";

const activeSettings: GlobalSettings = { ...DEFAULT_SETTINGS, enabled: true };
const controllers: OddsDomController[] = [];

afterEach(() => {
  vi.useRealTimers();
  controllers.splice(0).forEach((controller) => controller.stop());
  document.documentElement.innerHTML = "<head></head><body></body>";
});

describe("American odds conversion", () => {
  it("calculates exact known probabilities", () => {
    expect(impliedProbability(100)).toBe(0.5);
    expect(impliedProbability(-100)).toBe(0.5);
    expect(impliedProbability(140)).toBeCloseTo(0.4166667);
    expect(impliedProbability(-350)).toBeCloseTo(0.7777778);
  });

  it("keeps probabilities finite, bounded, and monotonic across supported odds", () => {
    let previousPositive = 1;
    let previousNegative = 0;
    for (let magnitude = 100; magnitude <= 100000; magnitude += 100) {
      const positive = impliedProbability(magnitude);
      const negative = impliedProbability(-magnitude);
      expect(positive).toBeGreaterThan(0);
      expect(positive).toBeLessThanOrEqual(previousPositive);
      expect(negative).toBeGreaterThanOrEqual(previousNegative);
      expect(negative).toBeLessThan(1);
      previousPositive = positive;
      previousNegative = negative;
    }
  });

  it("converts multiple valid odds while preserving surrounding text", () => {
    expect(convertText("NYK +140 / LAL −350", activeSettings)).toMatchObject({
      text: "NYK +140 (42% implied) / LAL −350 (78% implied)",
      matchCount: 2,
    });
  });

  it("supports compact append mode with fixed one-decimal precision", () => {
    const settings = { ...activeSettings, displayMode: "append-compact" as const };
    expect(convertText("Moneyline +140", settings).text).toBe("Moneyline +140 (41.7%)");
  });

  it("supports replacement mode with fixed one-decimal precision", () => {
    const settings = { ...activeSettings, displayMode: "replace" as const };
    expect(convertText("Spread -110", settings).text).toBe("Spread 52.4%");
  });

  it.each([
    "plain 110",
    "+099",
    "Call +1 415-555-1200",
    "2026-08-17",
    "UTC+1000",
    "Temperature +120°F",
    "Change +120%",
    "$+140",
    "translateX(-120px)",
    "decimal +110.5",
    "range 100-120",
  ])("rejects non-odds context: %s", (source) => {
    expect(convertText(source, activeSettings)).toMatchObject({ text: source, matchCount: 0 });
  });

  it("does not stack an annotation that is already present", () => {
    for (const source of ["+140 (42% implied)", "+140 (41.7%)"]) {
      expect(convertText(source, activeSettings)).toMatchObject({ text: source, matchCount: 0 });
    }
  });

  it("honors the configurable maximum", () => {
    const strict = { ...activeSettings, maximumOdds: 1000 };
    expect(convertText("Longshot +1500", strict).text).toBe("Longshot +1500");
  });

  it("accepts sentence punctuation and compact opposing odds", () => {
    expect(convertText("Odds +140. Next +150, total +160: +110/-110", activeSettings).text).toBe(
      "Odds +140 (42% implied). Next +150 (40% implied), total +160 (38% implied): " +
        "+110 (48% implied)/-110 (52% implied)",
    );
  });

  it.each([
    "+140abc", "+140mph", "+140A", "+123°W", "+140µg", "+140_kg", "+140β",
    "phone ext +120 x55", "Call 555-0100 ext. +120", "ext: +120", "extension: +120",
  ])(
    "rejects attached words and units: %s",
    (source) => expect(convertText(source, activeSettings).text).toBe(source),
  );
});

describe("live DOM controller", () => {
  it("preserves text-node identity and restores the exact source", () => {
    document.body.innerHTML = "<p id='line'>&lt;img src=x&gt; Knicks +140</p>";
    const textNode = document.getElementById("line")!.firstChild as Text;
    const controller = startController();

    expect(document.getElementById("line")!.firstChild).toBe(textNode);
    expect(textNode.data).toBe("<img src=x> Knicks +140 (42% implied)");
    expect(document.querySelector("img")).toBeNull();

    controller.stop();
    expect(textNode.data).toBe("<img src=x> Knicks +140");
  });

  it("converts added subtrees and changing text nodes", async () => {
    document.body.innerHTML = "<div id='feed'>Opening +110</div>";
    const controller = startController();
    const feed = document.getElementById("feed")!;
    const opening = feed.firstChild as Text;

    opening.data = "Moved to +125";
    const row = document.createElement("p");
    row.textContent = "New market -150";
    feed.append(row);
    await settleMutations();

    expect(opening.data).toBe("Moved to +125 (44% implied)");
    expect(row.textContent).toBe("New market -150 (60% implied)");
    expect(controller.getStatus().convertedCount).toBe(2);
  });

  it("settles after its own mutations without suffix loops", async () => {
    document.body.textContent = "Team +140";
    startController();
    await settleMutations();
    await settleMutations();
    expect(document.body.textContent).toBe("Team +140 (42% implied)");
  });

  it("reconciles partial edits to decorated live text", async () => {
    document.body.textContent = "Home +140";
    const controller = startController();
    const node = document.body.firstChild as Text;

    node.replaceData(5, 4, "+150");
    await settleMutations();
    expect(node.data).toBe("Home +150 (40% implied)");

    node.appendData(" / Away -110");
    await settleMutations();
    expect(node.data).toBe("Home +150 (40% implied) / Away -110 (52% implied)");
    expect(controller.getStatus().convertedCount).toBe(2);

    controller.stop();
    expect(node.data).toBe("Home +150 / Away -110");
  });

  it("reconciles multiple coalesced edits without preserving stale probabilities", async () => {
    document.body.textContent = "Home +140 / Away -110";
    const controller = startController();
    const node = document.body.firstChild as Text;
    node.data = node.data.replace("+140", "+150").replace("-110", "-120");
    await settleMutations();
    expect(node.data).toBe("Home +150 (40% implied) / Away -120 (55% implied)");
    expect(controller.getStatus().convertedCount).toBe(2);
  });

  it("reconciles shifted edits with duplicate generated probabilities", async () => {
    document.body.textContent = "A +900 / B +900";
    const controller = startController();
    const node = document.body.firstChild as Text;
    node.data = `LIVE ${node.data.split("+900").join("+1000")}`;
    await settleMutations();
    expect(node.data).toBe(
      "LIVE A +1000 (9% implied) / B +1000 (9% implied)",
    );
    expect(controller.getStatus().convertedCount).toBe(2);
  });

  it("preserves human text that matches a generated annotation", async () => {
    document.body.textContent = "Forecast (41.7% implied), market +140";
    const controller = startController();
    const node = document.body.firstChild as Text;
    node.data = node.data.replace("+140", "+150");
    await settleMutations();
    expect(node.data).toBe("Forecast (41.7% implied), market +150 (40% implied)");
    expect(controller.getStatus().convertedCount).toBe(1);
    controller.stop();
    expect(node.data).toBe("Forecast (41.7% implied), market +150");
  });

  it("preserves source odds through live updates in probability-only mode", async () => {
    document.body.textContent = "Home +140";
    const controller = startController({ ...activeSettings, displayMode: "replace" });
    const node = document.body.firstChild as Text;
    expect(node.data).toBe("Home 41.7%");
    node.data = "Home +150";
    await settleMutations();
    expect(node.data).toBe("Home 40.0%");
    controller.stop();
    expect(node.data).toBe("Home +150");
  });

  it("handles a burst of live rows and updates without losing count", async () => {
    const feed = document.createElement("div");
    document.body.append(feed);
    const controller = startController();
    const fragment = document.createDocumentFragment();
    const rows = Array.from({ length: 500 }, (_, index) => {
      const row = document.createElement("span");
      row.textContent = `Market ${index} +110`;
      fragment.append(row);
      return row;
    });
    feed.append(fragment);
    await settleMutations();
    expect(controller.getStatus().convertedCount).toBe(500);

    rows.forEach((row) => {
      (row.firstChild as Text).data = row.textContent!.replace("+110 (48% implied)", "+120");
    });
    await settleMutations();
    expect(controller.getStatus().convertedCount).toBe(500);
    expect(rows[499].textContent).toContain("+120 (45% implied)");
  });

  it("reports inactive after the controller is stopped", () => {
    document.body.textContent = "Home +140";
    const controller = startController();
    controller.stop();
    expect(controller.getStatus()).toEqual({ active: false, convertedCount: 0 });
  });

  it("restarts cleanly after a page lifecycle stop", async () => {
    document.body.textContent = "Home +140";
    const controller = startController();
    controller.stop();
    controller.updateSettings(activeSettings);
    controller.start();
    expect(document.body.textContent).toBe("Home +140 (42% implied)");
    (document.body.firstChild as Text).data = "Home +150";
    await settleMutations();
    expect(document.body.textContent).toBe("Home +150 (40% implied)");
    expect(controller.getStatus()).toEqual({ active: true, convertedCount: 1 });
  });

  it("keeps counts correct across virtualized detach and reinsert cycles", async () => {
    const row = document.createElement("p");
    row.textContent = "Market +110";
    document.body.append(row);
    const controller = startController();
    expect(controller.getStatus().convertedCount).toBe(1);

    row.remove();
    await settleMutations();
    expect(controller.getStatus().convertedCount).toBe(0);
    (row.firstChild as Text).data = "Market +120";
    document.body.append(row);
    await settleMutations();
    expect(row.textContent).toBe("Market +120 (45% implied)");
    expect(controller.getStatus().convertedCount).toBe(1);
  });

  it("does not overwrite a page mutation that races with disable", () => {
    document.body.textContent = "Team +140";
    const controller = startController();
    const node = document.body.firstChild as Text;
    node.data = "Final score";
    controller.stop();
    expect(node.data).toBe("Final score");
  });

  it("rerenders from source when display settings change", () => {
    document.body.textContent = "Team +140";
    const controller = startController();
    controller.updateSettings({ ...activeSettings, displayMode: "replace" });
    expect(document.body.textContent).toBe("Team 41.7%");
  });

  it("skips code, editable, textbox, and ignored regions", () => {
    document.body.innerHTML = [
      "<code>code +140</code>",
      "<div contenteditable='true'>edit +140</div>",
      "<div role='textbox'>role +140</div>",
      "<div data-odds-converter-ignore>ignore +140</div>",
      "<p>market +140</p>",
    ].join("");
    startController();
    expect(document.body.textContent).toBe(
      "code +140edit +140role +140ignore +140market +140 (42% implied)",
    );
  });

  it("responds to dynamic editable and ignore attributes", async () => {
    document.body.innerHTML = "<p id='market'>Market +140</p><p id='ignored' data-odds-converter-ignore>Other -110</p>";
    const controller = startController();
    const market = document.getElementById("market")!;
    const ignored = document.getElementById("ignored")!;
    expect(controller.getStatus().convertedCount).toBe(1);

    market.setAttribute("contenteditable", "true");
    ignored.removeAttribute("data-odds-converter-ignore");
    await settleMutations();
    expect(market.textContent).toBe("Market +140");
    expect(ignored.textContent).toBe("Other -110 (52% implied)");
    expect(controller.getStatus().convertedCount).toBe(1);
  });

  it("honors a nested contenteditable=false boundary", () => {
    document.body.innerHTML = "<div contenteditable='true'><p contenteditable='false'>Market +140</p></div>";
    startController();
    expect(document.querySelector("p")!.textContent).toBe("Market +140 (42% implied)");
  });

  it("converts existing and newly added open shadow roots", async () => {
    const firstHost = document.createElement("div");
    firstHost.attachShadow({ mode: "open" }).textContent = "Shadow +120";
    document.body.append(firstHost);
    startController();
    expect(firstHost.shadowRoot!.textContent).toBe("Shadow +120 (45% implied)");

    const secondHost = document.createElement("div");
    secondHost.attachShadow({ mode: "open" }).textContent = "Live -120";
    document.body.append(secondHost);
    await settleMutations();
    expect(secondHost.shadowRoot!.textContent).toBe("Live -120 (55% implied)");
  });

  it("discovers an open shadow root attached to an existing host", async () => {
    vi.useFakeTimers();
    const host = document.createElement("odds-card");
    document.body.append(host);
    startController();
    host.attachShadow({ mode: "open" }).textContent = "Late +125";
    await vi.advanceTimersByTimeAsync(4000);
    expect(host.shadowRoot!.textContent).toBe("Late +125 (44% implied)");
  });

  it("stops observing a shadow tree after its host is removed", async () => {
    const host = document.createElement("div");
    const shadow = host.attachShadow({ mode: "open" });
    shadow.textContent = "Shadow +120";
    document.body.append(host);
    const controller = startController();
    host.remove();
    await settleMutations();
    shadow.textContent = "Detached +140";
    await settleMutations();
    expect(shadow.textContent).toBe("Detached +140");
    expect(controller.getStatus().convertedCount).toBe(0);
  });

  it("leaves future mutations alone when live updates are disabled", async () => {
    document.body.textContent = "Opening +110";
    startController({ ...activeSettings, liveUpdates: false });
    (document.body.firstChild as Text).data = "Moved +120";
    await settleMutations();
    expect(document.body.textContent).toBe("Moved +120");
  });
});

function startController(settings: GlobalSettings = activeSettings): OddsDomController {
  const controller = new OddsDomController(document, settings);
  controllers.push(controller);
  controller.start();
  return controller;
}

async function settleMutations(): Promise<void> {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
}
