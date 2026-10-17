// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render } from "solid-js/web";
import { showToast, ToastHost } from "./toast";

describe("toast", () => {
  let container: HTMLDivElement;
  let dispose: (() => void) | undefined;

  afterEach(() => {
    dispose?.();
    container?.remove();
    document.body.innerHTML = "";
  });

  it("renders ToastHost and shows toast when showToast is called", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    dispose = render(() => <ToastHost />, container);

    expect(container.querySelector('[data-testid="toast-info"]')).toBeNull();

    showToast("Test message", "info");
    await new Promise((resolve) => setTimeout(resolve, 0));

    const toast = container.querySelector('[data-testid="toast-info"]');
    expect(toast).toBeTruthy();
    expect(toast?.textContent).toContain("Test message");
  });

  it("shows success variant toast", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    dispose = render(() => <ToastHost />, container);

    showToast("Success message", "success");
    await new Promise((resolve) => setTimeout(resolve, 0));

    const toast = container.querySelector('[data-testid="toast-success"]');
    expect(toast).toBeTruthy();
    expect(toast?.textContent).toContain("Success message");
  });

  it("closes toast on close button click", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    dispose = render(() => <ToastHost />, container);

    showToast("Close me", "info");
    await new Promise((resolve) => setTimeout(resolve, 0));

    let toast = container.querySelector('[data-testid="toast-info"]');
    expect(toast).toBeTruthy();

    const closeButton = container.querySelector('[data-testid="toast-close"]') as HTMLButtonElement;
    expect(closeButton).toBeTruthy();
    closeButton.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    toast = container.querySelector('[data-testid="toast-info"]');
    expect(toast).toBeNull();
  });

  it("auto-dismisses toast after 3 seconds", async () => {
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);
    dispose = render(() => <ToastHost />, container);

    showToast("Auto dismiss", "info");
    await vi.advanceTimersByTimeAsync(0);

    let toast = container.querySelector('[data-testid="toast-info"]');
    expect(toast).toBeTruthy();

    await vi.advanceTimersByTimeAsync(3000);

    toast = container.querySelector('[data-testid="toast-info"]');
    expect(toast).toBeNull();

    vi.useRealTimers();
  });

  it("replaces previous toast with new one", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    dispose = render(() => <ToastHost />, container);

    showToast("First toast", "info");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(container.textContent).toContain("First toast");

    showToast("Second toast", "success");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(container.textContent).not.toContain("First toast");
    expect(container.textContent).toContain("Second toast");
    expect(container.querySelector('[data-testid="toast-success"]')).toBeTruthy();
  });
});
