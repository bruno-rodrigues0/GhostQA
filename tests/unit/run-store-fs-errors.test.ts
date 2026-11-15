import { beforeEach, describe, expect, it, vi } from "vitest";

const { readFile, readdir } = vi.hoisted(() => ({
  readFile: vi.fn(),
  readdir: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn(),
  readFile,
  readdir,
  rename: vi.fn(),
  rm: vi.fn(),
  writeFile: vi.fn(),
}));

import { createRunStore } from "../../src/lib/run-store";

const sessionId = "e607b668-fca3-4f4f-9b99-80a3cc74f410";

beforeEach(() => {
  vi.resetAllMocks();
  readdir.mockResolvedValue([]);
});

describe("file-backed run store filesystem errors", () => {
  it("propagates read failures other than a missing file", async () => {
    const failure = Object.assign(new Error("permission denied"), {
      code: "EACCES",
    });
    readFile.mockRejectedValue(failure);

    await expect(createRunStore("/runs").get(sessionId)).rejects.toBe(failure);
  });

  it("propagates directory listing failures other than a missing directory", async () => {
    const failure = Object.assign(new Error("permission denied"), {
      code: "EACCES",
    });
    readdir.mockRejectedValue(failure);

    await expect(createRunStore("/runs").list()).rejects.toBe(failure);
  });

  it("reports a session file that disappears while listing", async () => {
    readdir.mockResolvedValue([`${sessionId}.json`]);
    readFile.mockRejectedValue(
      Object.assign(new Error("file disappeared"), { code: "ENOENT" }),
    );

    await expect(createRunStore("/runs").list()).rejects.toThrow(
      `O arquivo da sessão ${sessionId} desapareceu durante a leitura.`,
    );
  });
});
