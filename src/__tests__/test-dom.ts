import { Window } from "happy-dom";

const DOM_GLOBALS = [
  "window",
  "document",
  "Document",
  "history",
  "location",
  "navigator",
  "localStorage",
  "sessionStorage",
  "CustomEvent",
  "Event",
  "EventTarget",
  "Node",
  "Element",
  "Text",
  "HTMLElement",
  "HTMLStyleElement",
  "HTMLAnchorElement",
  "HTMLInputElement",
  "SVGElement",
  "DocumentFragment",
  "DOMParser",
  "MutationObserver",
  "ResizeObserver",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "getComputedStyle",
  "SyntaxError",
] as const;

type DomGlobalKey = (typeof DOM_GLOBALS)[number];
const DELETE_ON_RESTORE = new Set<DomGlobalKey>([
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "getComputedStyle",
  "ResizeObserver",
]);

export interface InstalledDom {
  window: Window;
  restore: () => void;
}

export function installHappyDom(url = "https://proseus.test/"): InstalledDom {
  const window = new Window({ url });
  const previous = new Map<DomGlobalKey, PropertyDescriptor | undefined>();

  const assignments: Record<DomGlobalKey, unknown> = {
    window,
    document: window.document,
    Document: window.Document,
    history: window.history,
    location: window.location,
    navigator: window.navigator,
    localStorage: window.localStorage,
    sessionStorage: window.sessionStorage,
    CustomEvent: window.CustomEvent,
    Event: window.Event,
    EventTarget: window.EventTarget,
    Node: window.Node,
    Element: window.Element,
    Text: window.Text,
    HTMLElement: window.HTMLElement,
    HTMLStyleElement: window.HTMLStyleElement,
    HTMLAnchorElement: window.HTMLAnchorElement,
    HTMLInputElement: window.HTMLInputElement,
    SVGElement: window.SVGElement,
    DocumentFragment: window.DocumentFragment,
    DOMParser: window.DOMParser,
    MutationObserver: window.MutationObserver,
    ResizeObserver: window.ResizeObserver,
    requestAnimationFrame: window.requestAnimationFrame.bind(window),
    cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
    getComputedStyle: window.getComputedStyle.bind(window),
    SyntaxError,
  };

  Object.defineProperty(window, "SyntaxError", {
    configurable: true,
    writable: true,
    value: SyntaxError,
  });

  for (const key of DOM_GLOBALS) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value: assignments[key],
    });
  }

  return {
    window,
    restore() {
      for (const key of DOM_GLOBALS) {
        const descriptor = previous.get(key);
        if (descriptor) {
          Object.defineProperty(globalThis, key, descriptor);
        } else if (DELETE_ON_RESTORE.has(key)) {
          Reflect.deleteProperty(globalThis, key);
        }
      }
    },
  };
}
