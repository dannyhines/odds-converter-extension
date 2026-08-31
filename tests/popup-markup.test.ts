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
  it("starts with appearance settings collapsed in an accessible disclosure", () => {
    const popup = renderPopup();
    const disclosure = popup.getElementById("appearance-settings") as HTMLDetailsElement;

    expect(disclosure.open).toBe(false);
    expect(disclosure.querySelector("summary")?.textContent).toContain("Appearance");
    expect(disclosure.querySelector("#display-mode")).not.toBeNull();
    expect(disclosure.querySelector("#precision")).not.toBeNull();
  });

  it("uses a shorter, vertically centered switch track", () => {
    const popup = renderPopup();
    const toggle = popup.getElementById("global-enabled")!;

    expect(getComputedStyle(toggle).height).toBe("20px");
    expect(getComputedStyle(toggle).width).toBe("38px");
  });
});
