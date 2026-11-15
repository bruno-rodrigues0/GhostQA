import { act, type ReactElement } from "react";
import { createRoot } from "react-dom/client";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

export async function render(element: ReactElement) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(element);
  });

  return {
    container,
    async click(target: Element | null) {
      if (!target) {
        throw new Error("Cannot click a missing element.");
      }
      await act(async () => {
        target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
    },
    async mouseDown(target: Element | null) {
      if (!target) {
        throw new Error("Cannot press on a missing element.");
      }
      await act(async () => {
        target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      });
    },
    async input(target: Element | null, value: string) {
      if (
        !(target instanceof HTMLInputElement) &&
        !(target instanceof HTMLTextAreaElement) &&
        !(target instanceof HTMLSelectElement)
      ) {
        throw new Error("Cannot update a missing form control.");
      }
      const setter = Object.getOwnPropertyDescriptor(
        target.constructor.prototype,
        "value",
      )?.set;
      if (!setter) {
        throw new Error("The form control value setter is unavailable.");
      }
      await act(async () => {
        setter.call(target, value);
        target.dispatchEvent(new Event("input", { bubbles: true }));
        target.dispatchEvent(new Event("change", { bubbles: true }));
      });
    },
    async submit(target: Element | null) {
      if (!(target instanceof HTMLFormElement)) {
        throw new Error("Cannot submit a missing form.");
      }
      await act(async () => {
        target.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        );
        await Promise.resolve();
        await Promise.resolve();
      });
    },
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
}
