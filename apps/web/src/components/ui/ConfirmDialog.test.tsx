// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { createSignal } from "solid-js";
import { ConfirmDialog } from "./ConfirmDialog";

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

describe("ConfirmDialog", () => {
  it("traps Tab focus within the dialog", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    dispose = render(
      () => (
        <ConfirmDialog
          title="Confirm"
          description="Are you sure?"
          confirmLabel="Yes"
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      ),
      root
    );
    await tick();

    const buttons = Array.from(document.querySelectorAll("button"));
    expect(buttons.length).toBe(2);
    const cancelBtn = buttons[0];
    const confirmBtn = buttons[1];

    cancelBtn.focus();
    expect(document.activeElement).toBe(cancelBtn);

    // Simulate browser Tab behavior: focus moves naturally to confirm
    confirmBtn.focus();
    // Then Tab from confirm should cycle back to cancel
    const tabEvent = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    window.dispatchEvent(tabEvent);
    await tick();
    expect(document.activeElement).toBe(cancelBtn);

    // Shift+Tab from cancel should cycle to confirm
    cancelBtn.focus();
    const shiftTabEvent = new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(shiftTabEvent);
    await tick();
    expect(document.activeElement).toBe(confirmBtn);
  });



  it("restores focus to previously focused element on close", async () => {
    const outsideButton = document.createElement("button");
    outsideButton.id = "outside";
    document.body.appendChild(outsideButton);
    outsideButton.focus();
    expect(document.activeElement).toBe(outsideButton);

    const [open, setOpen] = createSignal(true);
    const onConfirm = vi.fn();
    const onCancel = vi.fn(() => setOpen(false));

    dispose = render(
      () => (
        <>
          {open() && (
            <ConfirmDialog
              title="Confirm"
              description="Are you sure?"
              confirmLabel="Yes"
              onConfirm={onConfirm}
              onCancel={onCancel}
            />
          )}
        </>
      ),
      root
    );
    await tick();

    // Focus should move inside dialog
    const buttons = Array.from(document.querySelectorAll("button"));
    expect(document.activeElement).toBe(buttons[0]);

    // Close dialog
    setOpen(false);
    await tick();

    // Focus should restore to outside button
    expect(document.activeElement).toBe(outsideButton);

    outsideButton.remove();
  });

  it("respects dismissible=false for Escape key", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    dispose = render(
      () => (
        <ConfirmDialog
          title="Confirm"
          description="Are you sure?"
          confirmLabel="Yes"
          onConfirm={onConfirm}
          onCancel={onCancel}
          dismissible={false}
        />
      ),
      root
    );
    await tick();

    const escEvent = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    window.dispatchEvent(escEvent);
    await tick();

    expect(onCancel).not.toHaveBeenCalled();
  });

  it("respects dismissible=false for backdrop click", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    dispose = render(
      () => (
        <ConfirmDialog
          title="Confirm"
          description="Are you sure?"
          confirmLabel="Yes"
          onConfirm={onConfirm}
          onCancel={onCancel}
          dismissible={false}
        />
      ),
      root
    );
    await tick();

    const backdrop = document.querySelector(".ui-confirm-backdrop")! as HTMLElement;
    backdrop.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    await tick();

    expect(onCancel).not.toHaveBeenCalled();
  });

  it("uses unique label IDs", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    dispose = render(
      () => (
        <>
          <ConfirmDialog
            title="Confirm 1"
            description="First"
            confirmLabel="Yes"
            onConfirm={onConfirm}
            onCancel={onCancel}
          />
          <ConfirmDialog
            title="Confirm 2"
            description="Second"
            confirmLabel="Yes"
            onConfirm={onConfirm}
            onCancel={onCancel}
          />
        </>
      ),
      root
    );
    await tick();

    const dialogs = Array.from(document.querySelectorAll('[role="alertdialog"]'));
    expect(dialogs.length).toBe(2);

    const titleId1 = dialogs[0].getAttribute("aria-labelledby");
    const titleId2 = dialogs[1].getAttribute("aria-labelledby");

    expect(titleId1).toBeTruthy();
    expect(titleId2).toBeTruthy();
    expect(titleId1).not.toBe(titleId2);

    const descId1 = dialogs[0].getAttribute("aria-describedby");
    const descId2 = dialogs[1].getAttribute("aria-describedby");

    expect(descId1).toBeTruthy();
    expect(descId2).toBeTruthy();
    expect(descId1).not.toBe(descId2);
  });
});
