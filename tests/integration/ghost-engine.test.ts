import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { rm, stat } from "node:fs/promises";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { captureSetOfMarkScreenshot } from "../../src/lib/ghost-engine";

loadEnvConfig(process.cwd());

describe("Set-of-Mark capture input validation", () => {
  it("rejeita esquemas de URL que não sejam HTTP ou HTTPS", async () => {
    await expect(
      captureSetOfMarkScreenshot({
        url: "file:///etc/passwd",
        sessionId: randomUUID(),
        stepNumber: 1,
        viewport: "desktop",
      }),
    ).rejects.toThrow("A URL da missão precisa usar HTTP ou HTTPS.");
  });

  it("rejeita identificadores que possam escapar da pasta da sessão", async () => {
    await expect(
      captureSetOfMarkScreenshot({
        url: "https://example.com",
        sessionId: "../other-session",
        stepNumber: 1,
        viewport: "desktop",
      }),
    ).rejects.toThrow(
      "O identificador da sessão contém caracteres inválidos.",
    );
  });
});

const runBrowserIntegration =
  process.env.RUN_PLAYWRIGHT_INTEGRATION === "1" ? describe : describe.skip;

runBrowserIntegration("Playwright Set-of-Mark capture", () => {
  let server: Server;
  let targetUrl: string;

  beforeAll(async () => {
    server = createServer((request, response) => {
      if (request.url === "/missing.js") {
        response.writeHead(404);
        response.end();
        return;
      }

      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(`
        <!doctype html>
        <html lang="pt-BR">
          <head><title>Teste Set-of-Mark</title></head>
          <body>
            <a href="/destino">Abrir destino</a>
            <button aria-label="Continuar">Avançar</button>
            <script src="/missing.js"></script>
          </body>
        </html>
      `);
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });

    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Não foi possível iniciar o servidor local do teste.");
    }

    targetUrl = `http://127.0.0.1:${address.port}/`;
  }, 10_000);

  afterAll(async () => {
    if (server?.listening) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  });

  it(
    "navega, anota elementos, salva screenshot e captura erros HTTP",
    async () => {
      const sessionId = randomUUID();
      const sessionDirectory = path.join(
        process.cwd(),
        "public",
        "runs",
        sessionId,
      );

      try {
        const capture = await captureSetOfMarkScreenshot({
          url: targetUrl,
          sessionId,
          stepNumber: 1,
          viewport: "desktop",
        });

        expect(capture.screenshotPath).toBe(
          `/runs/${sessionId}/step-1-annotated.png`,
        );
        const screenshot = await stat(
          path.join(
            process.cwd(),
            "public",
            "runs",
            sessionId,
            "step-1-annotated.png",
          ),
        );
        expect(screenshot.size).toBeGreaterThan(0);
        expect(capture.elements).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ id: 1, tagName: "a" }),
            expect.objectContaining({
              id: 2,
              tagName: "button",
              label: "Continuar",
            }),
          ]),
        );
        expect(capture.techLogs).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ type: "http", status: 404 }),
          ]),
        );
      } finally {
        await rm(sessionDirectory, { recursive: true, force: true });
      }
    },
    60_000,
  );
});
