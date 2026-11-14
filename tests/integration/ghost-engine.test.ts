import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { rm, stat } from "node:fs/promises";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  captureSetOfMarkScreenshot,
  runGhostSession,
} from "../../src/lib/ghost-engine";
import type { PersonaDecision } from "../../src/lib/ghost-decision";
import type { Session } from "../../src/lib/types";

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

      if (request.url === "/journey") {
        response.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
        });
        response.end(`
          <!doctype html>
          <html lang="pt-BR">
            <body>
              <input aria-label="E-mail" type="email">
              <button id="submit" onclick="document.querySelector('#result').textContent = 'Cadastro iniciado';">Continuar</button>
              <p id="result">Preencha seus dados.</p>
            </body>
          </html>
        `);
        return;
      }

      if (request.url === "/unstable") {
        response.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
        });
        response.end(`
          <!doctype html>
          <html lang="pt-BR">
            <body>
              <button id="temporary">Continuar</button>
              <script>
                new MutationObserver(() => {
                  if (document.querySelector('[data-ghost-action-marker="true"]')) {
                    document.querySelector("#temporary").style.display = "none";
                  }
                }).observe(document.body, { childList: true });
              </script>
            </body>
          </html>
        `);
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
        "data",
        "private-runs",
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
          path.join("data", "private-runs", sessionId, "step-1-annotated.png"),
        );
        const screenshot = await stat(
          path.join(
            process.cwd(),
            "data",
            "private-runs",
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

  it(
    "registra timeout de interação como erro recuperável e continua a sessão",
    async () => {
      const sessionId = randomUUID();
      const sessionDirectory = path.join(
        process.cwd(),
        "data",
        "private-runs",
        sessionId,
      );
      const session: Session = {
        id: sessionId,
        targetUrl: `${targetUrl}unstable`,
        objective: "Avançar na jornada",
        plan: "free",
        viewport: "desktop",
        personas: [
          {
            id: "persona-fast",
            name: "O Apressado",
            description: "Quer concluir a tarefa rapidamente.",
          },
        ],
        status: "pending",
        steps: [],
        techLogs: [],
        frictionScore: null,
        missionStatus: null,
        recommendations: [],
        errorMessage: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      let decisionIndex = 0;

      try {
        const result = await runGhostSession(session, {
          decide: async () => {
            decisionIndex += 1;
            if (decisionIndex === 1) {
              return {
                pensamento_persona: "Vou continuar.",
                nivel_frustracao: 2,
                acao: "click",
                elemento_id: 1,
                texto_digitado: null,
                problema_ux_encontrado: null,
                severidade_problema: "nenhuma",
              };
            }
            return {
              pensamento_persona: "A página mudou e não há mais ação disponível.",
              nivel_frustracao: 3,
              acao: "finish",
              elemento_id: null,
              texto_digitado: null,
              problema_ux_encontrado: null,
              severidade_problema: "nenhuma",
            };
          },
        });

        expect(result.status).toBe("completed");
        expect(result.missionStatus).toBe("completed");
        expect(result.steps.map(({ action }) => action)).toEqual([
          "click",
          "finish",
        ]);
        expect(result.techLogs).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              type: "automation",
              message: expect.stringContaining("expirou"),
            }),
          ]),
        );
      } finally {
        await rm(sessionDirectory, { recursive: true, force: true });
      }
    },
    30_000,
  );

  it(
    "executa type, click e finish e persiste uma síntese da jornada",
    async () => {
      const sessionId = randomUUID();
      const sessionDirectory = path.join(
        process.cwd(),
        "data",
        "private-runs",
        sessionId,
      );
      const persona = {
        id: "persona-fast",
        name: "O Apressado",
        description: "Quer concluir o cadastro com rapidez.",
      };
      const session: Session = {
        id: sessionId,
        targetUrl: `${targetUrl}journey`,
        objective: "Iniciar o cadastro",
        plan: "free",
        viewport: "desktop",
        personas: [persona],
        status: "pending",
        steps: [],
        techLogs: [],
        frictionScore: null,
        missionStatus: null,
        recommendations: [],
        errorMessage: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const decisions: PersonaDecision[] = [
        {
          pensamento_persona: "Vou preencher meu e-mail e avançar.",
          nivel_frustracao: 2,
          acao: "type",
          elemento_id: 1,
          texto_digitado: "qa@example.com",
          problema_ux_encontrado: null,
          severidade_problema: "nenhuma",
        },
        {
          pensamento_persona: "O botão parece ser o próximo passo.",
          nivel_frustracao: 5,
          acao: "click",
          elemento_id: 2,
          texto_digitado: null,
          problema_ux_encontrado:
            "O botão não antecipa o que acontece depois do envio.",
          severidade_problema: "alta",
        },
        {
          pensamento_persona: "O cadastro foi iniciado.",
          nivel_frustracao: 3,
          acao: "finish",
          elemento_id: null,
          texto_digitado: null,
          problema_ux_encontrado: null,
          severidade_problema: "nenhuma",
        },
      ];
      let decisionIndex = 0;
      const updates: Session[] = [];

      try {
        const result = await runGhostSession(session, {
          decide: async () => {
            const decision = decisions[decisionIndex];
            if (!decision) {
              throw new Error("O motor excedeu a quantidade de decisões do teste.");
            }
            decisionIndex += 1;
            return decision;
          },
          onUpdate: async (updatedSession) => {
            updates.push(structuredClone(updatedSession));
          },
        });

        expect(result.status).toBe("completed");
        expect(result.missionStatus).toBe("completed");
        expect(result.steps.map(({ action }) => action)).toEqual([
          "type",
          "click",
          "finish",
        ]);
        expect(result.steps[0]?.typedText).toBe("qa@example.com");
        expect(result.frictionScore).toBe(33);
        expect(result.recommendations[0]).toContain("Prioridade alta");
        expect(updates.at(-1)?.status).toBe("completed");
        expect(
          await stat(
            path.join(
              sessionDirectory,
              persona.id,
              `${persona.id}-step-3-clean.png`,
            ),
          ),
        ).toMatchObject({ size: expect.any(Number) });
      } finally {
        await rm(sessionDirectory, { recursive: true, force: true });
      }
    },
    60_000,
  );
});
