import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
  storeDirectory = await mkdtemp(path.join(os.tmpdir(), "bunter-runs-"));
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

  it("persists a mission blocked by a human verification challenge", async () => {
    const store = await createSessionStore();
    const session = makeSession("e607b668-fca3-4f4f-9b99-80a3cc74f410");
    session.status = "completed";
    session.missionStatus = "blocked";

    await store.save(session);

    await expect(store.get(session.id)).resolves.toEqual(session);
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

  it("distinguishes malformed JSON from valid JSON with an invalid contract", async () => {
    const store = await createSessionStore();
    const sessionId = "e607b668-fca3-4f4f-9b99-80a3cc74f410";
    const file = path.join(storeDirectory!, `${sessionId}.json`);
    await writeFile(file, "{");

    await expect(store.get(sessionId)).rejects.toThrow(
      `O arquivo da sessão ${sessionId} não contém JSON válido.`,
    );
  });

  it("handles absent folders, filters invalid filenames and validates list limits", async () => {
    const store = await createSessionStore();
    const missing = createRunStore(path.join(storeDirectory!, "missing"));
    await expect(missing.list()).resolves.toEqual([]);

    await writeFile(path.join(storeDirectory!, "not-a-session.json"), "{}");
    const sessionId = "e607b668-fca3-4f4f-9b99-80a3cc74f410";
    await store.save(makeSession(sessionId));
    await expect(store.list(1)).resolves.toHaveLength(1);
    for (const limit of [0, 101, 2.5]) {
      await expect(store.list(limit)).rejects.toThrow(
        "O limite de sessões precisa ser um inteiro entre 1 e 100.",
      );
    }
  });

  it("validates optional persona fields, step unions, and technical log unions", async () => {
    const store = await createSessionStore();
    const sessionId = "e607b668-fca3-4f4f-9b99-80a3cc74f410";
    const persona = {
      id: "p1",
      name: "Persona",
      description: "Description",
      age: 35,
      context: "Context",
      technicalLevel: "high",
    };
    const step = {
      id: "step-1",
      personaId: "p1",
      order: 1,
      thought: "Thought",
      frustrationLevel: 4,
      action: "click",
      elementId: 1,
      typedText: null,
      uxProblem: null,
      severity: "low",
      annotatedScreenshotPath: null,
      cleanScreenshotPath: null,
      createdAt: "2026-11-14T00:00:00.000Z",
    };
    const log = {
      id: "log-1",
      type: "console",
      message: "Warning",
      url: "https://example.com",
      status: 404,
      createdAt: "2026-11-14T00:00:00.000Z",
    };
    const value = {
      ...makeSession(sessionId),
      personas: [persona],
      steps: [step],
      techLogs: [log],
    };
    const file = path.join(storeDirectory!, `${sessionId}.json`);
    await writeFile(file, JSON.stringify(value));
    await expect(store.get(sessionId)).resolves.toMatchObject(value);

    await writeFile(
      file,
      JSON.stringify({
        ...makeSession(sessionId),
        personas: [{ id: "p-minimal", name: "Pessoa", description: "Perfil" }],
        steps: [
          {
            ...step,
            elementId: null,
            typedText: "texto",
            uxProblem: "problema",
            annotatedScreenshotPath: "annotated.png",
            cleanScreenshotPath: "clean.png",
          },
        ],
        techLogs: [
          {
            id: "log-minimal",
            type: "automation",
            message: "Automation detail",
            createdAt: "2026-11-14T00:00:00.000Z",
          },
        ],
      }),
    );
    await expect(store.get(sessionId)).resolves.toMatchObject({
      personas: [{ id: "p-minimal" }],
      steps: [
        {
          elementId: null,
          annotatedScreenshotPath: "annotated.png",
          cleanScreenshotPath: "clean.png",
        },
      ],
      techLogs: [{ type: "automation" }],
    });

    for (const action of ["click", "type", "scroll", "finish", "give_up"]) {
      await writeFile(file, JSON.stringify({
        ...value,
        steps: [{ ...step, action }],
      }));
      await expect(store.get(sessionId)).resolves.toMatchObject({
        steps: [{ action }],
      });
    }
    for (const severity of ["low", "medium", "high", "none"]) {
      await writeFile(file, JSON.stringify({
        ...value,
        steps: [{ ...step, severity }],
      }));
      await expect(store.get(sessionId)).resolves.toMatchObject({
        steps: [{ severity }],
      });
    }
    for (const type of ["console", "pageerror", "http", "automation"]) {
      await writeFile(file, JSON.stringify({
        ...value,
        techLogs: [{ ...log, type }],
      }));
      await expect(store.get(sessionId)).resolves.toMatchObject({
        techLogs: [{ type }],
      });
    }

    const invalidValues = [
      null,
      [],
      { ...value, personas: [null] },
      { ...value, personas: [{ ...persona, age: "35" }] },
      { ...value, personas: [{ ...persona, context: 1 }] },
      { ...value, personas: [{ ...persona, technicalLevel: "expert" }] },
      { ...value, steps: [{ ...step, order: "1" }] },
      { ...value, steps: [{ ...step, action: "hover" }] },
      { ...value, steps: [{ ...step, elementId: "1" }] },
      { ...value, steps: [{ ...step, typedText: 1 }] },
      { ...value, steps: [{ ...step, uxProblem: 1 }] },
      { ...value, steps: [{ ...step, severity: "critical" }] },
      { ...value, steps: [{ ...step, annotatedScreenshotPath: 2 }] },
      { ...value, steps: [{ ...step, cleanScreenshotPath: 2 }] },
      { ...value, techLogs: [{ ...log, type: "network" }] },
      { ...value, techLogs: [{ ...log, url: 2 }] },
      { ...value, techLogs: [{ ...log, status: "404" }] },
      { ...value, recommendations: [3] },
      { ...value, status: "queued" },
      { ...value, missionStatus: "pending" },
      { ...value, errorMessage: 1 },
      { ...value, viewport: "tablet" },
      { ...value, plan: "enterprise" },
      { ...value, frictionScore: "20" },
      { ...value, steps: [null] },
      { ...value, techLogs: [null] },
    ];

    for (const invalid of invalidValues) {
      await writeFile(file, JSON.stringify(invalid));
      await expect(store.get(sessionId)).rejects.toThrow(
        `O arquivo da sessão ${sessionId} contém dados inválidos.`,
      );
    }
  });

  it("rejects invalid limits and cleans up temporary files after write errors", async () => {
    const store = await createSessionStore();
    for (const limit of [-1, 101, 1.5]) {
      await expect(store.list(limit)).rejects.toThrow(
        "O limite de sessões precisa ser um inteiro entre 1 e 100.",
      );
    }

    const sessionId = "e607b668-fca3-4f4f-9b99-80a3cc74f410";
    const target = path.join(storeDirectory!, `${sessionId}.json`);
    await expect(store.save(makeSession("not-a-uuid"))).rejects.toThrow(
      "O identificador da sessão é inválido.",
    );
    await writeFile(target, "directory collision");
    await rm(target);
    await mkdir(target);
    await expect(store.save(makeSession(sessionId))).rejects.toThrow();
    const names = await (await import("node:fs/promises")).readdir(storeDirectory!);
    expect(names.some((name) => name.endsWith(".tmp"))).toBe(false);
    await rm(target, { recursive: true, force: true });
  });
});
