import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAuth, toNextJsHandler, getHandlers } = vi.hoisted(() => ({
  getAuth: vi.fn(),
  toNextJsHandler: vi.fn(),
  getHandlers: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getAuth }));
vi.mock("better-auth/next-js", () => ({ toNextJsHandler }));

import { GET, POST, runtime } from "../../src/app/api/auth/[...all]/route";

beforeEach(() => {
  vi.resetAllMocks();
  getAuth.mockReturnValue({ auth: true });
  getHandlers.mockReturnValue({
    GET: vi.fn(async () => new Response("get")),
    POST: vi.fn(async () => new Response("post")),
  });
  toNextJsHandler.mockImplementation(() => getHandlers());
});

describe("authentication API handler", () => {
  it("uses the Node runtime and forwards GET requests", async () => {
    const request = new Request("http://localhost/api/auth/session");
    const response = await GET(request);

    expect(runtime).toBe("nodejs");
    expect(getAuth).toHaveBeenCalledOnce();
    expect(toNextJsHandler).toHaveBeenCalledWith({ auth: true });
    expect(await response.text()).toBe("get");
  });

  it("forwards POST requests to the authentication handler", async () => {
    const response = await POST(new Request("http://localhost/api/auth/sign-in", {
      method: "POST",
    }));

    expect(await response.text()).toBe("post");
    expect(toNextJsHandler).toHaveBeenCalledOnce();
  });
});
