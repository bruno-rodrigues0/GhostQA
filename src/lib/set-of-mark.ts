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
}

export function removeSetOfMark(doc: Document): void {
  doc
    .querySelectorAll('[data-ghost-overlay="true"], #ghostqa-som-styles')
    .forEach((node) => node.remove());

  doc.querySelectorAll('[data-ghost-marked="true"]').forEach((node) => {
    node.removeAttribute("data-ghost-id");
    node.removeAttribute("data-ghost-marked");
  });
}

export function injectSetOfMark(doc: Document): MarkedElementInfo[] {
  doc
    .querySelectorAll('[data-ghost-overlay="true"], #ghostqa-som-styles')
    .forEach((node) => node.remove());
  doc.querySelectorAll('[data-ghost-marked="true"]').forEach((node) => {
    node.removeAttribute("data-ghost-id");
    node.removeAttribute("data-ghost-marked");
  });

  const view = doc.defaultView;
  if (!view) {
    throw new Error("Não foi possível acessar a janela do documento.");
  }

  const width = view.innerWidth || doc.documentElement.clientWidth;
  const height = view.innerHeight || doc.documentElement.clientHeight;
  const style = doc.createElement("style");
  style.id = "ghostqa-som-styles";
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
  doc.head.append(style);

  const elements: MarkedElementInfo[] = [];

  doc
    .querySelectorAll<HTMLElement>(
      'a, button, input, textarea, select, [role="button"]',
    )
    .forEach((element) => {
      const bounds = element.getBoundingClientRect();
      let isVisible =
        !element.hasAttribute("disabled") && !element.matches(":disabled");
      let ancestor: HTMLElement | null = element;
      while (isVisible && ancestor) {
        const computedStyle = view.getComputedStyle(ancestor);
        isVisible =
          !ancestor.hidden &&
          ancestor.getAttribute("aria-hidden") !== "true" &&
          computedStyle.display !== "none" &&
          computedStyle.visibility !== "hidden" &&
          computedStyle.visibility !== "collapse" &&
          computedStyle.pointerEvents !== "none" &&
          (!computedStyle.opacity || Number(computedStyle.opacity) !== 0);
        ancestor = ancestor.parentElement;
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

      const id = elements.length + 1;
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
      doc.body.append(marker);
    });

  return elements;
}

export const SET_OF_MARK_SCRIPT = `window.__ghostSomElements = (${injectSetOfMark.toString()})(document);`;
