// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  injectSetOfMark,
  removeSetOfMark,
  SET_OF_MARK_SCRIPT,
} from "../../src/lib/set-of-mark";

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
}

afterEach(() => {
  removeSetOfMark(document);
  document.body.replaceChildren();
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
    expect(document.querySelector("#ghostqa-som-styles")).toBeNull();
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
});
