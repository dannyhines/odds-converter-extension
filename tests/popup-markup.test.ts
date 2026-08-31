// @vitest-environment jsdom
/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const popupHtml = readFileSync("public/popup.html", "utf8");
const popupCss = readFileSync("public/popup.css", "utf8");

function renderPopup(): Document {
  const parsed = new DOMParser().parseFromString(popupHtml, "text/html");
  document.head.innerHTML = parsed.head.innerHTML;
  document.body.innerHTML = parsed.body.innerHTML;
  const style = document.createElement("style");
  style.textContent = popupCss;
  document.head.append(style);
  return document;
}

describe("popup layout", () => {
  it("keeps the recognition limit collapsed while format and live updates stay visible", () => {
    const popup = renderPopup();
    const disclosure = popup.getElementById("advanced-settings") as HTMLDetailsElement;

    expect(disclosure.open).toBe(false);
    expect(disclosure.querySelector("summary")?.textContent).toContain("Advanced");
    expect(disclosure.querySelector("#maximum-odds")).not.toBeNull();
    expect(popup.querySelector("#display-mode")).not.toBeNull();
    expect(popup.querySelector("#live-updates")).not.toBeNull();
    expect(popup.querySelector("#precision")).toBeNull();
  });

  it("uses a shorter, vertically centered switch track", () => {
    const popup = renderPopup();
    const toggle = popup.getElementById("global-enabled")!;

    expect(getComputedStyle(toggle).height).toBe("20px");
    expect(getComputedStyle(toggle).width).toBe("38px");
  });
});
