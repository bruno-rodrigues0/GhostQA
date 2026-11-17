// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  injectSetOfMark,
  removeSetOfMark,
  SET_OF_MARK_SCRIPT,
} from "../../src/lib/set-of-mark";

const originalViewportDescriptors = {
  innerWidth: Object.getOwnPropertyDescriptor(window, "innerWidth"),
  innerHeight: Object.getOwnPropertyDescriptor(window, "innerHeight"),
  clientWidth: Object.getOwnPropertyDescriptor(
    document.documentElement,
    "clientWidth",
  ),
  clientHeight: Object.getOwnPropertyDescriptor(
    document.documentElement,
    "clientHeight",
  ),
};

function restoreProperty(
  target: object,
  property: PropertyKey,
  descriptor: PropertyDescriptor | undefined,
): void {
  if (descriptor) {
    Object.defineProperty(target, property, descriptor);
  } else {
    Reflect.deleteProperty(target, property);
  }
}

function setBounds(
  element: HTMLElement,
  bounds: { x: number; y: number; width: number; height: number },
): void {
  element.getBoundingClientRect = () =>
    ({
      ...bounds,
      top: bounds.y,
      left: bounds.x,
      right: bounds.x + bounds.width,
      bottom: bounds.y + bounds.height,
      toJSON: () => ({}),
    }) as DOMRect;
  element.getClientRects = () =>
    (element.getBoundingClientRect().width > 0
      ? [element.getBoundingClientRect()]
      : []) as unknown as DOMRectList;
}

afterEach(() => {
  removeSetOfMark(document);
  document.body.replaceChildren();
  Reflect.deleteProperty(document, "elementFromPoint");
  restoreProperty(window, "innerWidth", originalViewportDescriptors.innerWidth);
  restoreProperty(window, "innerHeight", originalViewportDescriptors.innerHeight);
  restoreProperty(
    document.documentElement,
    "clientWidth",
    originalViewportDescriptors.clientWidth,
  );
  restoreProperty(
    document.documentElement,
    "clientHeight",
    originalViewportDescriptors.clientHeight,
  );
  Reflect.deleteProperty(window, "__ghostClosedShadowRoots");
});

describe("Set-of-Mark", () => {
  it("marca elementos interativos visíveis e os numera em sequência", () => {
    document.body.innerHTML = `
      <a href="/conta">Criar conta</a>
      <button aria-label="Continuar"></button>
      <input placeholder="E-mail">
      <div role="button">Abrir</div>
      <button disabled>Indisponível</button>
      <button id="hidden">Oculto</button>
      <div id="hidden-parent" style="display: none">
        <a id="hidden-child" href="/hidden">Link oculto no menu</a>
      </div>
      <div id="aria-hidden-parent" aria-hidden="true">
        <button id="aria-hidden-child">Ação oculta</button>
      </div>
      <button id="outside">Fora da viewport</button>
    `;

    const visibleElements = [
      ...document.querySelectorAll<HTMLElement>(
        'a, button:not([disabled]), input, [role="button"]',
      ),
    ];
    visibleElements.forEach((element, index) => {
      setBounds(element, {
        x: index * 30,
        y: 20,
        width: 80,
        height: 30,
      });
    });
    setBounds(document.querySelector("#hidden")!, {
      x: 10,
      y: 10,
      width: 100,
      height: 30,
    });
    document.querySelector<HTMLElement>("#hidden")!.style.display = "none";
    setBounds(document.querySelector("#outside")!, {
      x: 0,
      y: 900,
      width: 100,
      height: 30,
    });
    setBounds(document.querySelector("#hidden-child")!, {
      x: 10,
      y: 10,
      width: 100,
      height: 30,
    });
    setBounds(document.querySelector("#aria-hidden-child")!, {
      x: 10,
      y: 10,
      width: 100,
      height: 30,
    });

    const marked = injectSetOfMark(document);

    expect(marked.map(({ id, tagName, label }) => ({ id, tagName, label })))
      .toEqual([
        { id: 1, tagName: "a", label: "Criar conta" },
        { id: 2, tagName: "button", label: "Continuar" },
        { id: 3, tagName: "input", label: "E-mail" },
        { id: 4, tagName: "div", label: "Abrir" },
      ]);
    expect(
      document.querySelectorAll('[data-ghost-overlay="true"]'),
    ).toHaveLength(4);
    expect(document.querySelector("#hidden")?.hasAttribute("data-ghost-id"))
      .toBe(false);
    expect(document.querySelector("#outside")?.hasAttribute("data-ghost-id"))
      .toBe(false);
    expect(document.querySelector("#hidden-child")?.hasAttribute("data-ghost-id"))
      .toBe(false);
    expect(
      document.querySelector("#aria-hidden-child")?.hasAttribute("data-ghost-id"),
    ).toBe(false);
  });

  it("remove estilos, marcadores e IDs sem deixar overlay no DOM", () => {
    document.body.innerHTML = '<button>Executar</button>';
    const button = document.querySelector<HTMLElement>("button")!;
    setBounds(button, { x: 10, y: 10, width: 100, height: 30 });

    injectSetOfMark(document);
    removeSetOfMark(document);

    expect(button.hasAttribute("data-ghost-id")).toBe(false);
    expect(button.hasAttribute("data-ghost-marked")).toBe(false);
    expect(document.querySelector('[data-ghost-overlay="true"]')).toBeNull();
    expect(document.querySelector("#bunter-som-styles")).toBeNull();
  });

  it("não marca controles encobertos e escolhe ponto alternativo clicável", () => {
    document.body.innerHTML = `
      <button id="partially-covered">Continuar</button>
      <button id="covered">Bloqueado</button>
    `;
    const partiallyCovered = document.querySelector<HTMLElement>(
      "#partially-covered",
    )!;
    const covered = document.querySelector<HTMLElement>("#covered")!;
    setBounds(partiallyCovered, { x: 0, y: 0, width: 100, height: 100 });
    setBounds(covered, { x: 200, y: 0, width: 100, height: 100 });
    const overlay = document.createElement("div");
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: (x: number) => (x < 40 ? partiallyCovered : overlay),
    });

    const marked = injectSetOfMark(document);

    expect(marked).toHaveLength(1);
    expect(marked[0]).toMatchObject({
      tagName: "button",
      label: "Continuar",
      clickPoint: { x: 25, y: 50 },
    });
    expect(covered.hasAttribute("data-ghost-id")).toBe(false);
  });

  it("serializa um script de injeção sem depender do escopo do servidor", () => {
    document.body.innerHTML = "<button>Continuar</button>";
    setBounds(document.querySelector<HTMLElement>("button")!, {
      x: 10,
      y: 10,
      width: 100,
      height: 30,
    });

    const runInPage = new Function(
      "document",
      "window",
      SET_OF_MARK_SCRIPT,
    ) as (doc: Document, pageWindow: Window) => void;
    runInPage(document, window);

    const pageWindow = window as Window & {
      __ghostSomElements?: ReturnType<typeof injectSetOfMark>;
    };
    expect(pageWindow.__ghostSomElements?.[0]).toMatchObject({
      id: 1,
      tagName: "button",
      label: "Continuar",
    });
  });

  it("marca controles em shadow roots e remove seus estilos e overlays", () => {
    const host = document.createElement("div");
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = '<button title="Continuar">Enviar</button>';
    document.body.append(host);
    const button = root.querySelector<HTMLElement>("button")!;
    setBounds(button, { x: 10, y: 10, width: 100, height: 30 });

    const marked = injectSetOfMark(document, 10);

    expect(marked).toMatchObject([
      { id: 11, tagName: "button", label: "Continuar" },
    ]);
    expect(root.querySelector("#bunter-som-styles")).not.toBeNull();
    expect(root.querySelector('[data-ghost-overlay="true"]')).not.toBeNull();

    removeSetOfMark(document);

    expect(root.querySelector("#bunter-som-styles")).toBeNull();
    expect(root.querySelector('[data-ghost-overlay="true"]')).toBeNull();
    expect(button.hasAttribute("data-ghost-id")).toBe(false);
  });

  it("atravessa um shadow root fechado conhecido e usa texto como fallback do rótulo", () => {
    const host = document.createElement("div");
    const root = host.attachShadow({ mode: "closed" });
    root.innerHTML = "<button> Ação   necessária </button>";
    document.body.append(host);
    const button = root.querySelector<HTMLElement>("button")!;
    setBounds(button, { x: 10, y: 10, width: 100, height: 30 });
    const pageWindow = window as Window & {
      __ghostClosedShadowRoots?: ShadowRoot[];
    };
    pageWindow.__ghostClosedShadowRoots = [root];

    expect(injectSetOfMark(document)).toMatchObject([
      { id: 1, tagName: "button", label: "Ação necessária" },
    ]);
    removeSetOfMark(document);

    expect(root.querySelector('[data-ghost-overlay="true"]')).toBeNull();
    Reflect.deleteProperty(pageWindow, "__ghostClosedShadowRoots");
  });

  it("uses a visible child as the click point and clamps partly offscreen bounds", () => {
    document.body.innerHTML = '<button><span>Continuar</span></button>';
    const button = document.querySelector<HTMLElement>("button")!;
    const child = document.querySelector<HTMLElement>("span")!;
    setBounds(button, { x: -10, y: -10, width: 40, height: 40 });
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: () => child,
    });

    const marked = injectSetOfMark(document);

    expect(marked[0]).toMatchObject({
      label: "Continuar",
      clickPoint: { x: 15, y: 15 },
    });
  });

  it("uses viewport fallbacks and can hit-test within shadow roots", () => {
    const host = document.createElement("div");
    host.setAttribute("role", "button");
    host.setAttribute("aria-label", "Container");
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = "<span><button>Inner action</button></span>";
    document.body.append(host);
    const innerButton = root.querySelector<HTMLElement>("button")!;
    setBounds(host, { x: 10, y: 10, width: 100, height: 30 });
    setBounds(innerButton, { x: 15, y: 15, width: 80, height: 20 });
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 0,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 0,
    });
    Object.defineProperty(document.documentElement, "clientWidth", {
      configurable: true,
      value: 500,
    });
    Object.defineProperty(document.documentElement, "clientHeight", {
      configurable: true,
      value: 400,
    });
    Object.defineProperty(root, "elementFromPoint", {
      configurable: true,
      value: () => innerButton,
    });
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: () => innerButton,
    });

    expect(injectSetOfMark(document)).toMatchObject([
      { tagName: "div", label: "Container" },
      { tagName: "button", label: "Inner action" },
    ]);
  });

  it("does not mark elements fully outside of the viewport", () => {
    document.body.innerHTML = '<button id="outside">Offscreen</button>';
    setBounds(document.querySelector<HTMLElement>("button")!, {
      x: 900,
      y: 900,
      width: 50,
      height: 30,
    });

    expect(injectSetOfMark(document)).toEqual([]);
    expect(document.querySelector("button")?.hasAttribute("data-ghost-id"))
      .toBe(false);
  });

  it("rejects click points when the visible area does not intersect the viewport", () => {
    document.body.innerHTML = "<button>Edge</button>";
    setBounds(document.querySelector<HTMLElement>("button")!, {
      x: -10,
      y: -10,
      width: 20,
      height: 20,
    });
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 0,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 0,
    });
    Object.defineProperty(document.documentElement, "clientWidth", {
      configurable: true,
      value: 0,
    });
    Object.defineProperty(document.documentElement, "clientHeight", {
      configurable: true,
      value: 0,
    });

    expect(injectSetOfMark(document)).toEqual([]);
  });

  it("cleans previous marks before reinjecting", () => {
    document.body.innerHTML = "<button>Continue</button>";
    const button = document.querySelector<HTMLElement>("button")!;
    setBounds(button, { x: 10, y: 10, width: 100, height: 30 });

    injectSetOfMark(document);
    injectSetOfMark(document);

    expect(document.querySelectorAll('[data-ghost-overlay="true"]'))
      .toHaveLength(1);
    expect(button.getAttribute("data-ghost-id")).toBe("1");
  });

  it("uses an empty label when an interactive element has no text", () => {
    document.body.innerHTML = "<button></button>";
    setBounds(document.querySelector<HTMLElement>("button")!, {
      x: 10,
      y: 10,
      width: 100,
      height: 30,
    });

    expect(injectSetOfMark(document)[0].label).toBe("");
  });

  it("fails explicitly when the document has no associated window", () => {
    const detachedDocument = document.implementation.createHTMLDocument("detached");

    expect(() => injectSetOfMark(detachedDocument)).toThrow(
      "Não foi possível acessar a janela do documento.",
    );
  });
});
