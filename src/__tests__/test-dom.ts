import { Window } from "happy-dom";

const DOM_GLOBALS = [
  "window",
  "document",
  "history",
  "location",
  "navigator",
  "localStorage",
  "sessionStorage",
  "CustomEvent",
  "Event",
  "Node",
  "HTMLElement",
  "HTMLStyleElement",
  "HTMLAnchorElement",
  "DocumentFragment",
  "DOMParser",
  "MutationObserver",
] as const;

type DomGlobalKey = (typeof DOM_GLOBALS)[number];

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
    history: window.history,
    location: window.location,
    navigator: window.navigator,
    localStorage: window.localStorage,
    sessionStorage: window.sessionStorage,
    CustomEvent: window.CustomEvent,
    Event: window.Event,
    Node: window.Node,
    HTMLElement: window.HTMLElement,
    HTMLStyleElement: window.HTMLStyleElement,
    HTMLAnchorElement: window.HTMLAnchorElement,
    DocumentFragment: window.DocumentFragment,
    DOMParser: window.DOMParser,
    MutationObserver: window.MutationObserver,
  };

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
        } else {
          Reflect.deleteProperty(globalThis, key);
        }
      }
    },
  };
}
