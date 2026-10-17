// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { ArchivedSessionBanner } from "./ArchivedSessionBanner";

describe("ArchivedSessionBanner", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("does not render when isArchived is false", () => {
    const onRestoreMock = vi.fn(async () => {});
    const dispose = render(
      () => <ArchivedSessionBanner isArchived={false} onRestore={onRestoreMock} />,
      document.body
    );

    expect(document.querySelector(".archived-banner")).toBeNull();
    expect(document.body.textContent).toBe("");

    dispose();
  });

  it("renders banner with icon and text when isArchived is true", () => {
    const onRestoreMock = vi.fn(async () => {});
    const dispose = render(
      () => <ArchivedSessionBanner isArchived={true} onRestore={onRestoreMock} />,
      document.body
    );

    const banner = document.querySelector(".archived-banner");
    expect(banner).not.toBeNull();

    // Check icon
    expect(banner?.querySelector(".fa-box-archive")).not.toBeNull();

    // Check text
    expect(document.body.textContent).toContain(
      "This chat is archived. Sending a message will restore it."
    );

    // Check restore button
    const restoreButton = banner?.querySelector(".archived-banner-restore");
    expect(restoreButton).not.toBeNull();
    expect(restoreButton?.textContent).toBe("Restore");

    dispose();
  });

  it("calls onRestore when Restore button is clicked", async () => {
    const onRestoreMock = vi.fn(async () => {});
    const dispose = render(
      () => <ArchivedSessionBanner isArchived={true} onRestore={onRestoreMock} />,
      document.body
    );

    const restoreButton = document.querySelector(
      ".archived-banner-restore"
    ) as HTMLButtonElement;
    expect(restoreButton).not.toBeNull();

    restoreButton.click();

    // Wait for async handler
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onRestoreMock).toHaveBeenCalledTimes(1);

    dispose();
  });

  it("calls onError when onRestore fails", async () => {
    const onRestoreMock = vi.fn(async () => {
      throw new Error("Network error");
    });
    const onErrorMock = vi.fn();
    const dispose = render(
      () => (
        <ArchivedSessionBanner
          isArchived={true}
          onRestore={onRestoreMock}
          onError={onErrorMock}
        />
      ),
      document.body
    );

    const restoreButton = document.querySelector(
      ".archived-banner-restore"
    ) as HTMLButtonElement;
    restoreButton.click();

    // Wait for async handler
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onRestoreMock).toHaveBeenCalledTimes(1);
    expect(onErrorMock).toHaveBeenCalledWith("Network error");

    dispose();
  });

  it("falls back to alert when onError is not provided", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const onRestoreMock = vi.fn(async () => {
      throw new Error("Network error");
    });
    const dispose = render(
      () => <ArchivedSessionBanner isArchived={true} onRestore={onRestoreMock} />,
      document.body
    );

    const restoreButton = document.querySelector(
      ".archived-banner-restore"
    ) as HTMLButtonElement;
    restoreButton.click();

    // Wait for async handler
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onRestoreMock).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalledWith("Network error");

    alertSpy.mockRestore();
    dispose();
  });
});
