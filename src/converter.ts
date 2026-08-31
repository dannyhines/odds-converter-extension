import { GlobalSettings, TextAnnotation, TextRecord } from "./types";

const EXCLUDED_TAGS = new Set([
  "SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "TEXTAREA", "INPUT", "SELECT", "OPTION",
  "PRE", "CODE", "KBD", "SAMP", "TITLE",
]);

const AMERICAN_ODDS = /(^|[\s\u00a0([{:;,/"'=<>])([+\-\u2212])(\d{3,6})(?!\d|[.,]\d|%|[-:/]\d|[\p{L}\p{M}_°])/gu;
const GENERATED_SUFFIX = /^\s*\(\d{1,3}(?:\.\d{1,3})?%(?: implied)?\)/;

export interface ConversionResult {
  text: string;
  matchCount: number;
  annotations: TextAnnotation[];
}

export interface DomControllerStatus {
  active: boolean;
  convertedCount: number;
}

export function impliedProbability(americanOdds: number): number {
  const magnitude = Math.abs(americanOdds);
  return americanOdds < 0 ? magnitude / (magnitude + 100) : 100 / (magnitude + 100);
}

export function convertText(source: string, settings: GlobalSettings): ConversionResult {
  let matchCount = 0;
  const annotations: TextAnnotation[] = [];
  let text = "";
  let sourceCursor = 0;
  AMERICAN_ODDS.lastIndex = 0;

  for (let match = AMERICAN_ODDS.exec(source); match; match = AMERICAN_ODDS.exec(source)) {
    const [fullMatch, prefix, sign, digits] = match;
    const oddsStart = match.index + prefix.length;
    const oddsEnd = match.index + fullMatch.length;
    const magnitude = Number(digits);
    if (
      magnitude < 100 || magnitude > settings.maximumOdds || digits.startsWith("0") ||
      GENERATED_SUFFIX.test(source.slice(oddsEnd)) ||
      isDisallowedContext(source, oddsStart, oddsEnd - oddsStart)
    ) continue;

    text += source.slice(sourceCursor, oddsStart);
    const rawOdds = `${sign}${digits}`;
    const signedOdds = sign === "+" ? magnitude : -magnitude;
    const percentage = formatPercentage(
      impliedProbability(signedOdds),
      settings.displayMode === "append" ? 0 : 1,
    );
    const renderedStart = text.length;
    if (settings.displayMode === "replace") {
      text += percentage;
      annotations.push({ sourceStart: oddsStart, sourceEnd: oddsEnd, renderedStart, renderedEnd: text.length });
    } else {
      const suffix = ` (${percentage}${settings.displayMode === "append" ? " implied" : ""})`;
      text += rawOdds;
      annotations.push({
        sourceStart: oddsEnd,
        sourceEnd: oddsEnd,
        renderedStart: text.length,
        renderedEnd: text.length + suffix.length,
      });
      text += suffix;
    }
    sourceCursor = oddsEnd;
    matchCount += 1;
  }

  text += source.slice(sourceCursor);
  return { text, matchCount, annotations };
}

function formatPercentage(probability: number, precision: number): string {
  const percent = probability * 100;
  const smallestDisplay = 10 ** -precision;
  if (percent > 0 && percent < smallestDisplay) return `<${smallestDisplay.toFixed(precision)}%`;
  return `${percent.toFixed(precision)}%`;
}

function isDisallowedContext(source: string, signOffset: number, tokenLength: number): boolean {
  const before = source.slice(Math.max(0, signOffset - 20), signOffset);
  const after = source.slice(signOffset + tokenLength, signOffset + tokenLength + 10);
  return (
    /(?:[$€£¥]|\b(?:UTC|GMT)|\b(?:ext|extension)\s*[.:]?|\b(?:19|20)\d{2})\s*$/i.test(before) ||
    /^\s*(?:°[CF]|px\b|em\b|rem\b|vh\b|vw\b|%)/i.test(after) ||
    /^\s*\.\d/.test(after)
  );
}

export class OddsDomController {
  private settings: GlobalSettings;
  private readonly records = new WeakMap<Text, TextRecord>();
  private readonly trackedNodes = new Set<Text>();
  private readonly observedRoots = new Set<Node>();
  private readonly lateShadowCandidates = new Set<Element>();
  private readonly pendingNodes = new Set<Node>();
  private observer: MutationObserver | null = null;
  private shadowDiscoveryTimer: number | null = null;
  private processingScheduled = false;
  private rootsMayBeDetached = false;
  private started = false;
  private convertedCount = 0;

  constructor(
    private readonly document: Document,
    settings: GlobalSettings,
    private readonly statusListener: (status: DomControllerStatus) => void = () => undefined,
  ) {
    this.settings = { ...settings };
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.applyCurrentSettings();
  }

  updateSettings(settings: GlobalSettings): void {
    const unchanged = JSON.stringify(this.settings) === JSON.stringify(settings);
    if (unchanged && this.started) return;
    this.disconnectObserver();
    this.restoreAll();
    this.settings = { ...settings };
    if (this.started) this.applyCurrentSettings();
  }

  stop(): void {
    this.disconnectObserver();
    this.restoreAll();
    this.started = false;
    this.notifyStatus();
  }

  getStatus(): DomControllerStatus {
    return { active: this.started && this.settings.enabled, convertedCount: this.convertedCount };
  }

  private applyCurrentSettings(): void {
    if (!this.settings.enabled) {
      this.notifyStatus();
      return;
    }
    if (this.settings.liveUpdates) this.connectObserver();
    this.scanRoot(this.document);
    this.notifyStatus();
  }

  private connectObserver(): void {
    if (this.observer) return;
    const Observer = this.document.defaultView?.MutationObserver ?? globalThis.MutationObserver;
    if (!Observer) return;
    this.observer = new Observer((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") this.pendingNodes.add(mutation.target);
        else if (mutation.type === "attributes") this.pendingNodes.add(mutation.target);
        else {
          mutation.addedNodes.forEach((node) => this.pendingNodes.add(node));
          if (mutation.removedNodes.length > 0) this.rootsMayBeDetached = true;
        }
      }
      this.schedulePendingWork();
    });
    this.observeRoot(this.document);
    const view = this.document.defaultView;
    if (view) {
      this.shadowDiscoveryTimer = view.setInterval(() => {
        this.pruneDetachedRoots();
        this.discoverCandidateShadowRoots();
      }, 4000);
    }
  }

  private observeRoot(root: Document | ShadowRoot): void {
    if (!this.observer || this.observedRoots.has(root)) return;
    this.observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["contenteditable", "role", "data-odds-converter-ignore"],
    });
    this.observedRoots.add(root);
  }

  private disconnectObserver(): void {
    if (this.shadowDiscoveryTimer !== null) {
      this.document.defaultView?.clearInterval(this.shadowDiscoveryTimer);
      this.shadowDiscoveryTimer = null;
    }
    this.observer?.disconnect();
    this.observer = null;
    this.observedRoots.clear();
    this.lateShadowCandidates.clear();
    this.pendingNodes.clear();
    this.rootsMayBeDetached = false;
    this.processingScheduled = false;
  }

  private schedulePendingWork(): void {
    if (this.processingScheduled) return;
    this.processingScheduled = true;
    Promise.resolve().then(() => {
      this.processingScheduled = false;
      const nodes = this.minimalPendingNodes();
      this.pendingNodes.clear();
      nodes.forEach((node) => this.scanNode(node));
      this.pruneDetachedNodes();
      if (this.rootsMayBeDetached) this.pruneDetachedRoots();
      this.rootsMayBeDetached = false;
      this.notifyStatus();
    });
  }

  private scanNode(node: Node): void {
    if (node.nodeType !== 9 && !node.isConnected) return;
    if (node.nodeType === 3) this.processTextNode(node as Text);
    else if (node.nodeType === 1 || node.nodeType === 9 || node.nodeType === 11)
      this.scanRoot(node as Document | Element | ShadowRoot);
  }

  private scanRoot(root: Document | Element | ShadowRoot): void {
    if (root.nodeType === 1 && this.isExcludedElement(root as Element)) {
      this.restoreSubtree(root);
      return;
    }
    const ownerDocument = root.nodeType === 9 ? (root as Document) : root.ownerDocument;
    if (!ownerDocument) return;

    const walker = ownerDocument.createTreeWalker(root, 4);
    let current = walker.nextNode();
    while (current) {
      this.processTextNode(current as Text);
      current = walker.nextNode();
    }
    this.discoverShadowRoots(root, ownerDocument);
  }

  private discoverShadowRoots(root: Document | Element | ShadowRoot, ownerDocument: Document): void {
    const inspect = (element: Element) => {
      if (element.shadowRoot && !this.observedRoots.has(element.shadowRoot)) {
        this.observeRoot(element.shadowRoot);
        this.scanRoot(element.shadowRoot);
      } else if (!element.shadowRoot && element.localName.includes("-"))
        this.lateShadowCandidates.add(element);
    };
    if (root.nodeType === 1) inspect(root as Element);
    const walker = ownerDocument.createTreeWalker(root, 1);
    let current = walker.nextNode();
    while (current) {
      inspect(current as Element);
      current = walker.nextNode();
    }
  }

  private processTextNode(node: Text): void {
    const previous = this.records.get(node);
    if (!node.parentNode || !node.data.trim() || this.hasExcludedAncestor(node)) {
      this.releaseNode(node, previous, true);
      return;
    }
    if (previous && node.data === previous.rendered) {
      if (!this.trackedNodes.has(node)) {
        this.trackedNodes.add(node);
        this.convertedCount += previous.matchCount;
      }
      return;
    }

    const wasTracked = this.trackedNodes.has(node);
    const source = previous ? reconcileExternalEdit(previous, node.data) : node.data;
    const result = convertText(source, this.settings);
    if (previous && wasTracked) this.convertedCount -= previous.matchCount;
    if (result.matchCount === 0 || result.text === source) {
      this.records.delete(node);
      this.trackedNodes.delete(node);
      return;
    }

    const record: TextRecord = {
      source,
      rendered: result.text,
      matchCount: result.matchCount,
      annotations: result.annotations,
    };
    this.records.set(node, record);
    this.trackedNodes.add(node);
    this.convertedCount += result.matchCount;
    node.data = result.text;
  }

  private restoreAll(): void {
    for (const node of this.trackedNodes) {
      const record = this.records.get(node);
      if (record && node.data === record.rendered) node.data = record.source;
      this.records.delete(node);
    }
    this.trackedNodes.clear();
    this.convertedCount = 0;
  }

  private pruneDetachedNodes(): void {
    for (const node of this.trackedNodes) {
      if (!node.isConnected) {
        const record = this.records.get(node);
        if (record) this.convertedCount -= record.matchCount;
        this.trackedNodes.delete(node);
      }
    }
  }

  private pruneDetachedRoots(): void {
    if (!this.observer) return;
    const hasDetachedRoot = [...this.observedRoots].some(
      (root) => root.nodeType === 11 && !(root as ShadowRoot).host.isConnected,
    );
    if (!hasDetachedRoot) return;

    this.observer.disconnect();
    this.observedRoots.clear();
    this.observeRoot(this.document);
    this.discoverShadowRoots(this.document, this.document);
  }

  private discoverCandidateShadowRoots(): void {
    for (const element of this.lateShadowCandidates) {
      if (!element.isConnected) {
        this.lateShadowCandidates.delete(element);
      } else if (element.shadowRoot) {
        this.lateShadowCandidates.delete(element);
        this.observeRoot(element.shadowRoot);
        this.scanRoot(element.shadowRoot);
      }
    }
    this.notifyStatus();
  }

  private minimalPendingNodes(): Node[] {
    const candidates = [...this.pendingNodes].filter(
      (node) => node.nodeType === 9 || node.isConnected,
    );
    const candidateSet = new Set(candidates);
    return candidates.filter((node) => {
      let parent = node.parentNode;
      while (parent) {
        if (candidateSet.has(parent)) return false;
        parent = parent.parentNode ?? (parent as ShadowRoot).host ?? null;
      }
      return true;
    });
  }

  private restoreSubtree(root: Node): void {
    if (root.nodeType === 3) {
      const node = root as Text;
      this.releaseNode(node, this.records.get(node), true);
      return;
    }
    const ownerDocument = root.nodeType === 9 ? (root as Document) : root.ownerDocument;
    if (!ownerDocument) return;
    const walker = ownerDocument.createTreeWalker(root, 4);
    let current = walker.nextNode();
    while (current) {
      const node = current as Text;
      this.releaseNode(node, this.records.get(node), true);
      current = walker.nextNode();
    }
  }

  private releaseNode(node: Text, record: TextRecord | undefined, restore: boolean): void {
    if (!record) return;
    if (this.trackedNodes.delete(node)) this.convertedCount -= record.matchCount;
    if (restore && node.data === record.rendered) node.data = record.source;
    this.records.delete(node);
  }

  private notifyStatus(): void {
    this.convertedCount = Math.max(0, this.convertedCount);
    this.statusListener(this.getStatus());
  }

  private hasExcludedAncestor(node: Node): boolean {
    if (this.document.designMode === "on") return true;
    let current: Node | null = node.parentNode;
    let editableBoundaryFound = false;
    while (current) {
      if (current.nodeType === 1) {
        const element = current as Element;
        if (
          EXCLUDED_TAGS.has(element.tagName) ||
          element.hasAttribute("data-odds-converter-ignore") ||
          element.getAttribute("role") === "textbox"
        ) return true;
        const editable = element.getAttribute("contenteditable");
        if (!editableBoundaryFound && editable !== null) {
          editableBoundaryFound = true;
          if (editable.toLowerCase() !== "false") return true;
        }
      }
      if (current.parentNode) current = current.parentNode;
      else current = (current as ShadowRoot).host ?? null;
    }
    return false;
  }

  private isExcludedElement(element: Element): boolean {
    const editable = element.getAttribute("contenteditable");
    return (
      EXCLUDED_TAGS.has(element.tagName) || element.hasAttribute("data-odds-converter-ignore") ||
      element.getAttribute("role") === "textbox" ||
      (editable !== null && editable.toLowerCase() !== "false")
    );
  }
}

function reconcileExternalEdit(record: TextRecord, current: string): string {
  const withoutGeneratedAnnotations = stripGeneratedAnnotations(record, current);
  if (withoutGeneratedAnnotations !== current) return withoutGeneratedAnnotations;

  let prefixLength = 0;
  const maximumPrefix = Math.min(record.rendered.length, current.length);
  while (prefixLength < maximumPrefix && record.rendered[prefixLength] === current[prefixLength])
    prefixLength += 1;

  let suffixLength = 0;
  while (
    suffixLength < record.rendered.length - prefixLength &&
    suffixLength < current.length - prefixLength &&
    record.rendered[record.rendered.length - 1 - suffixLength] ===
      current[current.length - 1 - suffixLength]
  ) suffixLength += 1;

  const renderedEditEnd = record.rendered.length - suffixLength;
  const sourceEditStart = mapRenderedOffset(record, prefixLength);
  const sourceEditEnd = mapRenderedOffset(record, renderedEditEnd);
  if (sourceEditStart !== null && sourceEditEnd !== null) {
    const inserted = current.slice(prefixLength, current.length - suffixLength);
    return record.source.slice(0, sourceEditStart) + inserted + record.source.slice(sourceEditEnd);
  }

  return current;
}

function stripGeneratedAnnotations(record: TextRecord, current: string): string {
  let stripped = current;
  for (const annotation of [...record.annotations].reverse()) {
    if (annotation.sourceStart !== annotation.sourceEnd) continue;
    const generated = record.rendered.slice(annotation.renderedStart, annotation.renderedEnd);
    const candidates = findOccurrences(stripped, generated);
    const generatedRank = findOccurrences(record.rendered, generated).indexOf(annotation.renderedStart);
    const evaluated = candidates
      .map((index) => ({
        index,
        distance: Math.abs(index - annotation.renderedStart),
        contextScore: annotationContextScore(record.rendered, stripped, annotation, index),
      }));
    const ranked = generatedRank >= 0 ? evaluated[generatedRank] : undefined;
    const best =
      ranked
        ? ranked
        : evaluated.sort(
            (left, right) => right.contextScore - left.contextScore || left.distance - right.distance,
          )[0];
    if (!best || (!ranked && best.contextScore < 4 && best.distance > 4)) continue;
    stripped = stripped.slice(0, best.index) + stripped.slice(best.index + generated.length);
  }
  return stripped;
}

function findOccurrences(value: string, search: string): number[] {
  const occurrences: number[] = [];
  let offset = 0;
  while (offset <= value.length - search.length) {
    const index = value.indexOf(search, offset);
    if (index < 0) break;
    occurrences.push(index);
    offset = index + search.length;
  }
  return occurrences;
}

function annotationContextScore(
  previous: string,
  current: string,
  annotation: TextAnnotation,
  candidateStart: number,
): number {
  const windowSize = 24;
  const previousBefore = previous.slice(Math.max(0, annotation.renderedStart - windowSize), annotation.renderedStart);
  const currentBefore = current.slice(Math.max(0, candidateStart - windowSize), candidateStart);
  const generatedLength = annotation.renderedEnd - annotation.renderedStart;
  const previousAfter = previous.slice(annotation.renderedEnd, annotation.renderedEnd + windowSize);
  const currentAfter = current.slice(candidateStart + generatedLength, candidateStart + generatedLength + windowSize);
  return alignedMatchesFromEnd(previousBefore, currentBefore) + alignedMatches(previousAfter, currentAfter);
}

function alignedMatches(left: string, right: string): number {
  const length = Math.min(left.length, right.length);
  let matches = 0;
  for (let index = 0; index < length; index += 1)
    if (left[index] === right[index]) matches += 1;
  return matches;
}

function alignedMatchesFromEnd(left: string, right: string): number {
  const length = Math.min(left.length, right.length);
  let matches = 0;
  for (let index = 1; index <= length; index += 1)
    if (left[left.length - index] === right[right.length - index]) matches += 1;
  return matches;
}

function mapRenderedOffset(record: TextRecord, offset: number): number | null {
  let delta = 0;
  for (const annotation of record.annotations) {
    if (offset < annotation.renderedStart) return offset - delta;
    if (offset === annotation.renderedStart) return annotation.sourceStart;
    if (offset > annotation.renderedStart && offset < annotation.renderedEnd) return null;
    if (offset === annotation.renderedEnd) return annotation.sourceEnd;
    delta +=
      annotation.renderedEnd - annotation.renderedStart -
      (annotation.sourceEnd - annotation.sourceStart);
  }
  return offset - delta;
}
