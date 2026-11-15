import { beforeEach, describe, expect, it, vi } from "vitest";

const { auth, runStore, readFile } = vi.hoisted(() => ({
  auth: { getCurrentUser: vi.fn() },
  runStore: { get: vi.fn() },
  readFile: vi.fn(),
}));

vi.mock("node:fs/promises", async (importOriginal) => ({
  ...await importOriginal<typeof import("node:fs/promises")>(),
  readFile,
}));
vi.mock("@/lib/auth-session", () => auth);
vi.mock("@/lib/run-store", () => ({ runStore }));

import { GET } from "../../src/app/api/runs/[id]/screenshots/[...path]/route";

const runId = "e607b668-fca3-4f4f-9b99-80a3cc74f410";
const session = {
  id: runId,
  personas: [{ id: "persona-1", name: "Test", description: "Test." }],
};

function getScreenshot(requestedPath: string[]) {
  return GET(new Request("http://localhost"), {
    params: Promise.resolve({ id: runId, path: requestedPath }),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  auth.getCurrentUser.mockResolvedValue({
    id: "user-1",
    name: "User",
    email: "user@example.com",
  });
  runStore.get.mockResolvedValue(session);
});

describe("private screenshot route validation and file errors", () => {
  it("rejects malformed, traversal, and unowned persona paths", async () => {
    const invalidPaths = [
      [],
      ["persona-1"],
      ["persona-1", "folder/file.png"],
      ["../outside", "image.png"],
      ["unknown-persona", "image.png"],
    ];

    for (const parts of invalidPaths) {
      const response = await getScreenshot(parts);
      expect(response.status).toBe(400);
    }
    expect(readFile).not.toHaveBeenCalled();
  });

  it("returns not-found for missing screenshot files", async () => {
    readFile.mockRejectedValueOnce(Object.assign(new Error("not found"), {
      code: "ENOENT",
    }));

    const response = await getScreenshot(["persona-1", "image.png"]);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "A screenshot não foi encontrada.",
    });
  });

  it("logs unexpected filesystem failures", async () => {
    const failure = Object.assign(new Error("permission denied"), { code: "EACCES" });
    readFile.mockRejectedValueOnce(failure);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await getScreenshot(["persona-1", "image.png"]);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Não foi possível carregar a screenshot.",
    });
    expect(error).toHaveBeenCalledWith(
      `[GhostQA] Não foi possível servir screenshot da auditoria ${runId}.`,
      failure,
    );
  });
});
