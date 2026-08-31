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
  it("keeps all common settings visible in compact rows", () => {
    const popup = renderPopup();
    expect(popup.querySelector("details")).toBeNull();
    expect(popup.querySelector("#maximum-odds")).not.toBeNull();
    expect(popup.querySelector("#display-mode")).not.toBeNull();
    expect(popup.querySelector("#live-updates")).not.toBeNull();
    expect(popup.querySelector("#precision")).toBeNull();
  });

  it("moves saved sites and the calculator into secondary views", () => {
    const popup = renderPopup();
    expect((popup.getElementById("sites-view") as HTMLElement).hidden).toBe(true);
    expect((popup.getElementById("calculator-view") as HTMLElement).hidden).toBe(true);
    expect(popup.getElementById("sites-view-button")).not.toBeNull();
    expect(popup.getElementById("site-rules-list")).not.toBeNull();
    expect(popup.getElementById("calculator-view-button")).not.toBeNull();
    expect(popup.querySelector("header p")).toBeNull();
    expect(popup.getElementById("clear-site-rule")).toBeNull();
    expect(popup.getElementById("site-rule-state")).toBeNull();
  });

  it("uses a shorter, vertically centered switch track", () => {
    const popup = renderPopup();
    const toggle = popup.getElementById("global-enabled")!;

    expect(getComputedStyle(toggle).height).toBe("20px");
    expect(getComputedStyle(toggle).width).toBe("38px");
  });

  it("shows a pointer across the full current-site toggle row", () => {
    const popup = renderPopup();
    const row = popup.getElementById("site-enabled")!.closest("label")!;

    expect(getComputedStyle(row).cursor).toBe("pointer");
  });

  it("keeps page status accessible without showing a status row", () => {
    const popup = renderPopup();
    const status = popup.getElementById("status")!;

    expect(status.classList.contains("sr-only")).toBe(true);
    expect(status.getAttribute("aria-live")).toBe("polite");
  });
});
