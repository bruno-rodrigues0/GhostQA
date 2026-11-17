export interface MarkedElementInfo {
  id: number;
  tagName: string;
  label: string;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  clickPoint: {
    x: number;
    y: number;
  };
}

type MarkRoot = Document | ShadowRoot;

function getShadowRootForHost(element: Element): ShadowRoot | null {
  if (element.shadowRoot) {
    return element.shadowRoot;
  }
  const closedRoots = (
    window as Window & { __ghostClosedShadowRoots?: ShadowRoot[] }
  ).__ghostClosedShadowRoots;
  return closedRoots?.find((root) => root.host === element) ?? null;
}

function collectRoots(root: MarkRoot): MarkRoot[] {
  const roots: MarkRoot[] = [root];
  for (const currentRoot of roots) {
    currentRoot.querySelectorAll("*").forEach((element) => {
      const shadowRoot = getShadowRootForHost(element);
      if (shadowRoot) {
        roots.push(shadowRoot);
      }
    });
  }
  return roots;
}

function removeMarksFromRoot(root: MarkRoot): void {
  root
    .querySelectorAll('[data-ghost-overlay="true"], #bunter-som-styles')
    .forEach((node) => node.remove());
  root.querySelectorAll('[data-ghost-marked="true"]').forEach((node) => {
    node.removeAttribute("data-ghost-id");
    node.removeAttribute("data-ghost-marked");
  });
}

export function removeSetOfMark(doc: Document): void {
  for (const root of collectRoots(doc)) {
    removeMarksFromRoot(root);
  }
}

export function injectSetOfMark(
  doc: Document,
  startingId = 0,
): MarkedElementInfo[] {
  const getShadowRootForHost = (element: Element): ShadowRoot | null => {
    if (element.shadowRoot) {
      return element.shadowRoot;
    }
    const closedRoots = (
      window as Window & { __ghostClosedShadowRoots?: ShadowRoot[] }
    ).__ghostClosedShadowRoots;
    return closedRoots?.find((root) => root.host === element) ?? null;
  };
  const getShadowRoot = (node: Node): ShadowRoot | null => {
    const root = node.getRootNode();
    return root instanceof ShadowRoot ? root : null;
  };
  const getComposedParent = (element: Element): Element | null => {
    if (element.parentElement) {
      return element.parentElement;
    }
    return getShadowRoot(element)?.host ?? null;
  };
  const collectRoots = (root: MarkRoot): MarkRoot[] => {
    const collected: MarkRoot[] = [root];
    for (const currentRoot of collected) {
      currentRoot.querySelectorAll("*").forEach((element) => {
        const shadowRoot = getShadowRootForHost(element);
        if (shadowRoot) {
          collected.push(shadowRoot);
        }
      });
    }
    return collected;
  };
  const isComposedDescendant = (parent: Element, child: Element): boolean => {
    let current: Element | null = child;
    while (current) {
      if (current === parent) {
        return true;
      }
      const root = current.getRootNode();
      current =
        current.parentElement ??
        (root instanceof ShadowRoot ? root.host : null);
    }
    return false;
  };
  const findClickPoint = (
    element: HTMLElement,
    bounds: DOMRect,
    width: number,
    height: number,
  ): { x: number; y: number } | null => {
    const left = Math.max(0, bounds.left);
    const right = Math.min(width, bounds.right);
    const top = Math.max(0, bounds.top);
    const bottom = Math.min(height, bounds.bottom);
    if (left >= right || top >= bottom) {
      return null;
    }

    const fractions = [0.5, 0.25, 0.75];
    const root = getShadowRoot(element);
    const elementFromPoint =
      root && "elementFromPoint" in root &&
      typeof root.elementFromPoint === "function"
        ? root.elementFromPoint.bind(root)
        : typeof doc.elementFromPoint === "function"
          ? doc.elementFromPoint.bind(doc)
          : null;

    for (const yFraction of fractions) {
      for (const xFraction of fractions) {
        const x = Math.min(
          right - 1,
          Math.max(left, left + (right - left) * xFraction),
        );
        const y = Math.min(
          bottom - 1,
          Math.max(top, top + (bottom - top) * yFraction),
        );
        const hit = elementFromPoint ? elementFromPoint(x, y) : element;
        if (hit && isComposedDescendant(element, hit)) {
          return { x, y };
        }
      }
    }

    return null;
  };
  const removeMarksFromRoot = (root: MarkRoot): void => {
    root
      .querySelectorAll('[data-ghost-overlay="true"], #bunter-som-styles')
      .forEach((node) => node.remove());
    root.querySelectorAll('[data-ghost-marked="true"]').forEach((node) => {
      node.removeAttribute("data-ghost-id");
      node.removeAttribute("data-ghost-marked");
    });
  };

  const roots = collectRoots(doc);
  roots.forEach(removeMarksFromRoot);

  const view = doc.defaultView;
  if (!view) {
    throw new Error("Não foi possível acessar a janela do documento.");
  }

  const width = view.innerWidth || doc.documentElement.clientWidth;
  const height = view.innerHeight || doc.documentElement.clientHeight;
  for (const root of roots) {
    const style = doc.createElement("style");
    style.id = "bunter-som-styles";
    style.textContent = `
      [data-ghost-marked="true"] {
        outline: 3px solid #ff3b30 !important;
        outline-offset: 2px !important;
      }
      [data-ghost-overlay="true"] {
        position: fixed !important;
        z-index: 2147483647 !important;
        pointer-events: none !important;
        box-sizing: border-box !important;
      }
    `;
    if (root instanceof Document) {
      root.head.append(style);
    } else {
      root.append(style);
    }
  }

  const elements: MarkedElementInfo[] = [];
  const selector =
    'a, button, input, textarea, select, [role="button"], [role="link"], [tabindex]:not([tabindex="-1"]), [onclick], [contenteditable="true"], summary';

  for (const root of roots) {
    root.querySelectorAll<HTMLElement>(selector).forEach((element) => {
      const bounds = element.getBoundingClientRect();
      let isVisible =
        !element.hasAttribute("disabled") && !element.matches(":disabled");
      let ancestor: Element | null = element;
      while (isVisible && ancestor) {
        const computedStyle = view.getComputedStyle(ancestor);
        isVisible =
          !ancestor.hasAttribute("hidden") &&
          ancestor.getAttribute("aria-hidden") !== "true" &&
          computedStyle.display !== "none" &&
          computedStyle.visibility !== "hidden" &&
          computedStyle.visibility !== "collapse" &&
          computedStyle.pointerEvents !== "none" &&
          (!computedStyle.opacity || Number(computedStyle.opacity) !== 0);
        ancestor = getComposedParent(ancestor);
      }

      isVisible =
        isVisible &&
        element.getClientRects().length > 0 &&
        bounds.width > 0 &&
        bounds.height > 0 &&
        bounds.right > 0 &&
        bounds.bottom > 0 &&
        bounds.left < width &&
        bounds.top < height;

      if (!isVisible) {
        return;
      }

      const clickPoint = findClickPoint(element, bounds, width, height);
      if (!clickPoint) {
        return;
      }

      const id = startingId + elements.length + 1;
      element.setAttribute("data-ghost-id", String(id));
      element.setAttribute("data-ghost-marked", "true");

      const label =
        element.getAttribute("aria-label") ||
        element.getAttribute("placeholder") ||
        element.getAttribute("title") ||
        element.textContent?.replace(/\s+/g, " ").trim().slice(0, 160) ||
        "";

      elements.push({
        id,
        tagName: element.tagName.toLowerCase(),
        label,
        bounds: {
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
        },
        clickPoint,
      });

      const marker = doc.createElement("div");
      marker.dataset.ghostOverlay = "true";
      marker.setAttribute("aria-hidden", "true");
      marker.textContent = `[${id}]`;
      marker.style.left = `${Math.max(0, bounds.left)}px`;
      marker.style.top = `${Math.max(0, bounds.top)}px`;
      marker.style.border = "2px solid #ff3b30";
      marker.style.background = "#ff3b30";
      marker.style.color = "#ffffff";
      marker.style.padding = "2px 5px";
      marker.style.borderRadius = "4px";
      marker.style.font = "bold 12px/1.2 sans-serif";
      marker.style.boxShadow = "0 1px 5px rgb(0 0 0 / 65%)";
      const shadowRoot = getShadowRoot(element);
      if (shadowRoot) {
        shadowRoot.append(marker);
      } else {
        doc.body.append(marker);
      }
    });
  }

  return elements;
}

export function createSetOfMarkScript(startingId = 0): string {
  return `window.__ghostSomElements = (${injectSetOfMark.toString()})(document, ${startingId});`;
}

export const SET_OF_MARK_SCRIPT = createSetOfMarkScript();
