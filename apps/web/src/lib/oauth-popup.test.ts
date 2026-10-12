// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { navigateOAuthPopup, onOAuthReturn, openOAuthPopup, reserveOAuthPopup } from "./oauth-popup";

afterEach(() => vi.restoreAllMocks());

const post = (data: unknown) => window.dispatchEvent(new MessageEvent("message", { data }));

describe("OAuth popup", () => {
  it("opens the named popup with fixed geometry", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    openOAuthPopup("/api/x");
    reserveOAuthPopup();
    expect(open).toHaveBeenNthCalledWith(1, "/api/x", "yoplai-oauth", "width=520,height=640");
    expect(open).toHaveBeenNthCalledWith(2, "", "yoplai-oauth", "width=520,height=640");
  });

  it("navigates a live reserved popup, else the current window", () => {
    const replace = vi.fn();
    navigateOAuthPopup({ closed: false, location: { replace } } as unknown as Window, "/go");
    expect(replace).toHaveBeenCalledWith("/go");
    const assign = vi.fn();
    vi.stubGlobal("location", { assign });
    navigateOAuthPopup({ closed: true, location: { replace } } as unknown as Window, "/a");
    navigateOAuthPopup(null, "/b");
    expect(assign.mock.calls).toEqual([["/a"], ["/b"]]);
    vi.unstubAllGlobals();
  });
});

describe("onOAuthReturn", () => {
  it("fires on focus and on oauth messages of either type, until disposed", () => {
    const cb = vi.fn();
    const dispose = onOAuthReturn(cb);
    window.dispatchEvent(new Event("focus"));
    post({ type: "yoplai-oauth" });
    post({ type: "aihub-oauth" });
    expect(cb).toHaveBeenCalledTimes(3);
    post({ type: "other" });
    post("yoplai-oauth");
    post(null);
    expect(cb).toHaveBeenCalledTimes(3);
    dispose();
    window.dispatchEvent(new Event("focus"));
    post({ type: "yoplai-oauth" });
    expect(cb).toHaveBeenCalledTimes(3);
  });

  it("filters messages by extension but still reacts to focus", () => {
    const cb = vi.fn();
    const dispose = onOAuthReturn(cb, { extension: "mcp" });
    post({ type: "yoplai-oauth" });
    post({ type: "yoplai-oauth", extension: "google" });
    expect(cb).not.toHaveBeenCalled();
    post({ type: "aihub-oauth", extension: "mcp" });
    window.dispatchEvent(new Event("focus"));
    expect(cb).toHaveBeenCalledTimes(2);
    dispose();
  });
});
