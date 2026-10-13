// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { createSignal } from "solid-js";
import { Modal } from "./Modal";

let root: HTMLDivElement;
let dispose: () => void;
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  root = document.createElement("div");
  document.body.appendChild(root);
});

afterEach(() => {
  dispose?.();
  root.remove();
});

describe("Modal", () => {
  it("traps Tab focus within the modal", async () => {
    const onClose = vi.fn();
    dispose = render(
      () => (
        <Modal title="Test Modal" onClose={onClose}>
          <button id="btn1">Button 1</button>
          <button id="btn2">Button 2</button>
        </Modal>
      ),
      root
    );
    await tick();

    const btn1 = document.getElementById("btn1")!;
    const btn2 = document.getElementById("btn2")!;

    btn1.focus();
    expect(document.activeElement).toBe(btn1);

    // Simulate browser Tab behavior: focus moves naturally to btn2
    btn2.focus();
    // Then Tab from btn2 should cycle back to btn1
    const tabEvent = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    window.dispatchEvent(tabEvent);
    await tick();
    expect(document.activeElement).toBe(btn1);

    // Shift+Tab from btn1 should cycle to btn2
    btn1.focus();
    const shiftTabEvent = new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(shiftTabEvent);
    await tick();
    expect(document.activeElement).toBe(btn2);
  });



  it("restores focus to previously focused element on close", async () => {
    const outsideButton = document.createElement("button");
    outsideButton.id = "outside";
    document.body.appendChild(outsideButton);
    outsideButton.focus();
    expect(document.activeElement).toBe(outsideButton);

    const [open, setOpen] = createSignal(true);
    const onClose = vi.fn(() => setOpen(false));

    dispose = render(
      () => (
        <>
          {open() && (
            <Modal title="Test Modal" onClose={onClose}>
              <button id="inside">Inside</button>
            </Modal>
          )}
        </>
      ),
      root
    );
    await tick();

    // Focus should move inside modal
    const inside = document.getElementById("inside")!;
    expect(document.activeElement).toBe(inside);

    // Close modal
    setOpen(false);
    await tick();

    // Focus should restore to outside button
    expect(document.activeElement).toBe(outsideButton);

    outsideButton.remove();
  });

  it("respects dismissible=false for Escape key", async () => {
    const onClose = vi.fn();
    dispose = render(
      () => (
        <Modal title="Test Modal" onClose={onClose} dismissible={false}>
          <button>Button</button>
        </Modal>
      ),
      root
    );
    await tick();

    const escEvent = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    window.dispatchEvent(escEvent);
    await tick();

    expect(onClose).not.toHaveBeenCalled();
  });

  it("respects dismissible=false for backdrop click", async () => {
    const onClose = vi.fn();
    dispose = render(
      () => (
        <Modal title="Test Modal" onClose={onClose} dismissible={false}>
          <button>Button</button>
        </Modal>
      ),
      root
    );
    await tick();

    const overlay = document.querySelector(".ui-modal-overlay")! as HTMLElement;
    overlay.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    await tick();

    expect(onClose).not.toHaveBeenCalled();
  });

  it("allows dismissing when dismissible=true (default)", async () => {
    const onClose = vi.fn();
    dispose = render(
      () => (
        <Modal title="Test Modal" onClose={onClose}>
          <button>Button</button>
        </Modal>
      ),
      root
    );
    await tick();

    const escEvent = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    window.dispatchEvent(escEvent);
    await tick();

    expect(onClose).toHaveBeenCalled();
  });

  it("uses unique label IDs", async () => {
    const onClose1 = vi.fn();
    const onClose2 = vi.fn();

    dispose = render(
      () => (
        <>
          <Modal title="Modal 1" onClose={onClose1}>
            <div>Content 1</div>
          </Modal>
          <Modal title="Modal 2" onClose={onClose2}>
            <div>Content 2</div>
          </Modal>
        </>
      ),
      root
    );
    await tick();

    const modals = Array.from(document.querySelectorAll('[role="dialog"]'));
    expect(modals.length).toBe(2);

    const labelId1 = modals[0].getAttribute("aria-labelledby");
    const labelId2 = modals[1].getAttribute("aria-labelledby");

    expect(labelId1).toBeTruthy();
    expect(labelId2).toBeTruthy();
    expect(labelId1).not.toBe(labelId2);
  });

  it("displays error when provided", async () => {
    const onClose = vi.fn();
    dispose = render(
      () => (
        <Modal title="Test Modal" onClose={onClose} error="Something went wrong">
          <button>Button</button>
        </Modal>
      ),
      root
    );
    await tick();

    const error = document.querySelector(".ui-modal__error");
    expect(error).toBeTruthy();
    expect(error?.textContent).toBe("Something went wrong");
  });
});
