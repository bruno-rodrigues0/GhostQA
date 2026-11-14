import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createRunStore } from "../../src/lib/run-store";
import type { Session } from "../../src/lib/types";

const sessions: Session[] = [];
let storeDirectory: string | undefined;

afterEach(async () => {
  sessions.length = 0;
  if (storeDirectory) {
    await rm(storeDirectory, { recursive: true, force: true });
    storeDirectory = undefined;
  }
});

async function createSessionStore() {
  storeDirectory = await mkdtemp(path.join(os.tmpdir(), "ghostqa-runs-"));
  return createRunStore(storeDirectory);
}

function makeSession(id: string): Session {
  return {
    id,
    targetUrl: "https://example.com",
    objective: "Criar uma conta",
    plan: "free",
    viewport: "desktop",
    personas: [],
    status: "pending",
    steps: [],
    techLogs: [],
    frictionScore: null,
    missionStatus: null,
    recommendations: [],
    createdAt: "2026-11-14T00:00:00.000Z",
    updatedAt: "2026-11-14T00:00:00.000Z",
    errorMessage: null,
  };
}

describe("run store", () => {
  it("persists sessions atomically and returns undefined for unknown IDs", async () => {
    const store = await createSessionStore();
    const session = makeSession("e607b668-fca3-4f4f-9b99-80a3cc74f410");

    await store.save(session);

    await expect(store.get(session.id)).resolves.toEqual(session);
    await expect(
      store.get("3c9f4cec-3a65-4bb3-8000-038561d1ec10"),
    ).resolves.toBeUndefined();
    await expect(
      readFile(path.join(storeDirectory!, `${session.id}.json`), "utf8"),
    ).resolves.toContain('"targetUrl": "https://example.com"');
  });

  it("rejects identifiers that are not UUIDs before touching the filesystem", async () => {
    const store = await createSessionStore();

    await expect(store.get("../other-session")).rejects.toThrow(
      "O identificador da sessão é inválido.",
    );
  });

  it("rejects stored JSON that does not match the session contract", async () => {
    const store = await createSessionStore();
    const sessionId = "e607b668-fca3-4f4f-9b99-80a3cc74f410";
    await writeFile(
      path.join(storeDirectory!, `${sessionId}.json`),
      JSON.stringify({ id: sessionId }),
    );

    await expect(store.get(sessionId)).rejects.toThrow(
      `O arquivo da sessão ${sessionId} contém dados inválidos.`,
    );
  });
});
