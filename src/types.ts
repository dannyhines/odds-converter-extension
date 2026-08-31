export type DisplayMode = "append" | "append-compact" | "replace";

export interface GlobalSettings {
  enabled: boolean;
  displayMode: DisplayMode;
  liveUpdates: boolean;
  maximumOdds: number;
}

export interface SiteRules {
  [hostname: string]: boolean;
}

export interface EngineStatus {
  active: boolean;
  convertedCount: number;
  hostname: string;
}

export type ExtensionMessage =
  | { type: "get-status" }
  | { type: "get-tab-status"; tabId: number }
  | { type: "get-frame-hostname" }
  | { type: "resolve-top-hostname" }
  | { type: "engine-unloaded" }
  | { type: "engine-status"; status: EngineStatus };

export interface TextAnnotation {
  sourceStart: number;
  sourceEnd: number;
  renderedStart: number;
  renderedEnd: number;
}

export interface TextRecord {
  source: string;
  rendered: string;
  matchCount: number;
  annotations: TextAnnotation[];
}
