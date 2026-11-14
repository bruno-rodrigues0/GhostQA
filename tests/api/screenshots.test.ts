import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getRunMock } = vi.hoisted(() => ({ getRunMock: vi.fn() }));

vi.mock("../../src/lib/auth-session", () => ({
  getCurrentUser: vi.fn(),
}));
vi.mock("../../src/lib/run-store", () => ({
  runStore: { get: getRunMock },
}));

import { GET } from "../../src/app/api/runs/[id]/screenshots/[...path]/route";
import { getCurrentUser } from "../../src/lib/auth-session";
import type { Session } from "../../src/lib/types";

const owner = {
  id: "owner-1",
  name: "Test User",
  email: "test@example.com",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

let fixtureDirectory: string | undefined;

beforeEach(() => {
  vi.mocked(getCurrentUser).mockResolvedValue(owner);
  getRunMock.mockReset();
});

afterEach(async () => {
  vi.restoreAllMocks();
  if (fixtureDirectory) {
    await rm(fixtureDirectory, { recursive: true, force: true });
    fixtureDirectory = undefined;
  }
});

function requestScreenshot(id: string, requestedPath: string[]): Promise<Response> {
  return GET(new Request(`http://localhost/api/runs/${id}/screenshots`), {
    params: Promise.resolve({ id, path: requestedPath }),
  });
}

function makeSession(id: string): Session {
  const timestamp = new Date().toISOString();
  return {
    id,
    ownerId: owner.id,
    targetUrl: "https://example.com",
    objective: "Validar a jornada",
    plan: "free",
    viewport: "desktop",
    personas: [{ id: "apressado", name: "Apressado", description: "Rápido." }],
    status: "completed",
    steps: [],
    techLogs: [],
    frictionScore: 0,
    missionStatus: "completed",
    recommendations: [],
    errorMessage: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

describe("private screenshot route", () => {
  it("requires a signed-in user before looking up an audit", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const response = await requestScreenshot(randomUUID(), ["apressado", "step-1-clean.png"]);

    expect(response.status).toBe(401);
    expect(getRunMock).not.toHaveBeenCalled();
  });

  it("does not reveal screenshots for an audit not owned by the current user", async () => {
    const id = randomUUID();
    getRunMock.mockResolvedValue(undefined);

    const response = await requestScreenshot(id, ["apressado", "step-1-clean.png"]);

    expect(response.status).toBe(404);
    expect(getRunMock).toHaveBeenCalledWith(id, owner.id);
  });

  it("serves a valid screenshot only after checking owner and persona", async () => {
    const id = randomUUID();
    const filename = "apressado-step-1-clean.png";
    const bytes = Buffer.from("private-image-data");
    fixtureDirectory = path.join(process.cwd(), "data", "private-runs", id);
    await mkdir(path.join(fixtureDirectory, "apressado"), { recursive: true });
    await writeFile(path.join(fixtureDirectory, "apressado", filename), bytes);
    getRunMock.mockResolvedValue(makeSession(id));

    const response = await requestScreenshot(id, ["apressado", filename]);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
  });
});
