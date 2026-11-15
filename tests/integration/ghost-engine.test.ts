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

function makeCaptchaTestSession(id: string, targetUrl: string): Session {
  const timestamp = new Date().toISOString();
  return {
    id,
    targetUrl,
    objective: "Continuar para o cadastro",
    plan: "free",
    viewport: "desktop",
    personas: [
      {
        id: "persona-fast",
        name: "O Apressado",
        description: "Quer continuar rapidamente.",
      },
    ],
    status: "pending",
    steps: [],
    techLogs: [],
    frictionScore: null,
    missionStatus: null,
    recommendations: [],
    errorMessage: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

runBrowserIntegration("Playwright Set-of-Mark capture", () => {
  let server: Server;
  let targetUrl: string;
  let confirmedCookieClicks = 0;

  beforeAll(async () => {
    server = createServer((request, response) => {
      if (request.url === "/clicked") {
        confirmedCookieClicks += 1;
        response.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
        });
        response.end("<!doctype html><title>Consentimento aceito</title>");
        return;
      }

      if (request.url === "/inner") {
        response.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
        });
        response.end(
          '<!doctype html><button style="width:180px;height:40px">Ação no frame</button>',
        );
        return;
      }

      if (request.url === "/frames") {
        response.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
        });
        response.end(`
          <!doctype html>
          <div id="component"></div>
          <iframe src="/inner"></iframe>
          <script>
            document.querySelector("#component")
              .attachShadow({ mode: "open" })
              .innerHTML = '<button style="width:180px;height:40px">Ação no componente</button>';
          </script>
        `);
        return;
      }

      if (request.url === "/composed") {
        response.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
        });
        response.end(`
          <!doctype html>
          <button style="position:fixed;left:20px;top:20px">Alvo encoberto</button>
          <div style="position:fixed;inset:0;z-index:10;background:#ffffff">
            <div id="consent"></div>
          </div>
          <script>
            const root = document.querySelector("#consent")
              .attachShadow({ mode: "closed" });
            root.innerHTML = '<button style="position:fixed;left:100px;top:100px;width:220px;height:48px">Aceitar todos os cookies</button>';
            root.querySelector("button").addEventListener("click", () => {
              window.location.href = "/clicked";
            });
          </script>
        `);
        return;
      }

      if (request.url === "/captcha") {
        response.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
        });
        response.end(`
          <!doctype html>
          <iframe
            src="/captcha-frame"
            title="hCaptcha de teste"
            style="width:320px;height:100px;border:0"
          ></iframe>
        `);
        return;
      }

      if (request.url === "/captcha-frame") {
        response.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
        });
        response.end(`
          <!doctype html>
          <div class="h-captcha" data-sitekey="test-site-key"
            style="width:300px;height:80px">Verificação hCaptcha de teste</div>
        `);
        return;
      }

      if (request.url === "/captcha-provider") {
        response.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
        });
        response.end(
          '<!doctype html><iframe src="/recaptcha/frame" title="Challenge" style="width:320px;height:120px"></iframe>',
        );
        return;
      }

      if (request.url === "/captcha-turnstile") {
        response.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
        });
        response.end(
          '<!doctype html><iframe src="/challenges.cloudflare.com/turnstile" title="Challenge" style="width:320px;height:120px"></iframe>',
        );
        return;
      }

      if (request.url === "/captcha-text") {
        response.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
        });
        response.end(
          "<!doctype html><body><main>Checking your browser. Verify you are human.</main></body>",
        );
        return;
      }

      if (request.url === "/captcha-shein-text") {
        response.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
        });
        response.end(
          "<!doctype html><body><main>Por favor, clique para completar as seguintes ações para verificar que você é humano</main><button>Eu sou humano</button></body>",
        );
        return;
      }

      if (request.url === "/captcha-cloudflare") {
        response.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
        });
        response.end(
          '<!doctype html><form id="challenge-form" style="width:320px;height:120px">Security check</form>',
        );
        return;
      }

      if (request.url === "/captcha-hidden") {
        response.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
        });
        response.end(`
          <!doctype html>
          <div class="h-captcha" data-sitekey="test-site-key"
            style="display:none;width:300px;height:80px"></div>
          <button>Continue</button>
        `);
        return;
      }

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
    "marca componentes em shadow DOM e frames com IDs globais",
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
          url: `${targetUrl}frames`,
          sessionId,
          stepNumber: 1,
          viewport: "desktop",
        });

        expect(capture.elements).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: 1,
              label: "Ação no componente",
            }),
            expect.objectContaining({
              id: 2,
              label: "Ação no frame",
            }),
          ]),
        );
      } finally {
        await rm(sessionDirectory, { recursive: true, force: true });
      }
    },
    60_000,
  );

  it(
    "clica no controle de consentimento em shadow DOM sem clicar no alvo encoberto",
    async () => {
      confirmedCookieClicks = 0;
      const sessionId = randomUUID();
      const sessionDirectory = path.join(
        process.cwd(),
        "data",
        "private-runs",
        sessionId,
      );
      const session: Session = {
        id: sessionId,
        targetUrl: `${targetUrl}composed`,
        objective: "Aceitar os cookies",
        plan: "free",
        viewport: "desktop",
        personas: [
          {
            id: "persona-fast",
            name: "O Apressado",
            description: "Quer continuar rapidamente.",
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
                pensamento_persona: "Vou aceitar os cookies.",
                nivel_frustracao: 2,
                acao: "click",
                elemento_id: 1,
                texto_digitado: null,
                problema_ux_encontrado: null,
                severidade_problema: "nenhuma",
              };
            }
            return {
              pensamento_persona: "Os cookies foram aceitos.",
              nivel_frustracao: 2,
              acao: "finish",
              elemento_id: null,
              texto_digitado: null,
              problema_ux_encontrado: null,
              severidade_problema: "nenhuma",
            };
          },
        });

        expect(confirmedCookieClicks).toBe(1);
        expect(result.status).toBe("completed");
        expect(result.steps[0]?.uxProblem).toBeNull();
        expect(result.techLogs).not.toEqual(
          expect.arrayContaining([
            expect.objectContaining({ type: "automation" }),
          ]),
        );
      } finally {
        await rm(sessionDirectory, { recursive: true, force: true });
      }
    },
    60_000,
  );

  it(
    "interrompe a auditoria diante de CAPTCHA sem tentar interagir ou chamar o modelo",
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
        targetUrl: `${targetUrl}captcha`,
        objective: "Continuar para o cadastro",
        plan: "free",
        viewport: "desktop",
        personas: [
          {
            id: "persona-fast",
            name: "O Apressado",
            description: "Quer continuar rapidamente.",
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
      let decisionCalls = 0;

      try {
        const result = await runGhostSession(session, {
          decide: async () => {
            decisionCalls += 1;
            throw new Error("Não deveria solicitar decisão diante de CAPTCHA.");
          },
        });

        expect(decisionCalls).toBe(0);
        expect(result.status).toBe("completed");
        expect(result.missionStatus).toBe("blocked");
        expect(result.steps).toHaveLength(0);
        expect(result.frictionScore).toBeNull();
        expect(result.techLogs).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              type: "automation",
              message: expect.stringContaining(
                "A auditoria foi pausada sem interagir",
              ),
            }),
          ]),
        );
      } finally {
        await rm(sessionDirectory, { recursive: true, force: true });
      }
    },
    30_000,
  );

  it.each([
    { path: "captcha-provider", challenge: "Google reCAPTCHA" },
    { path: "captcha-turnstile", challenge: "Cloudflare Turnstile" },
    { path: "captcha-text", challenge: "verificação humana" },
    { path: "captcha-shein-text", challenge: "verificação humana" },
    { path: "captcha-cloudflare", challenge: "Cloudflare challenge" },
  ])(
    "bloqueia sem pedir decisão quando detecta $challenge",
    async ({ path: captchaPath, challenge }) => {
      const sessionId = randomUUID();
      const sessionDirectory = path.join(
        process.cwd(),
        "data",
        "private-runs",
        sessionId,
      );

      try {
        const result = await runGhostSession(
          makeCaptchaTestSession(sessionId, `${targetUrl}${captchaPath}`),
          {
            decide: async () => {
              throw new Error(
                "O modelo não deve ser chamado diante de verificação humana.",
              );
            },
          },
        );

        expect(result.missionStatus).toBe("blocked");
        expect(result.steps).toHaveLength(0);
        expect(result.techLogs).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              type: "automation",
              message: expect.stringContaining(challenge),
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
    "ignora um widget CAPTCHA invisível e prossegue com decisão normal",
    async () => {
      const sessionId = randomUUID();
      const sessionDirectory = path.join(
        process.cwd(),
        "data",
        "private-runs",
        sessionId,
      );

      try {
        const result = await runGhostSession(
          makeCaptchaTestSession(sessionId, `${targetUrl}captcha-hidden`),
          {
            decide: async () => ({
              pensamento_persona: "A página está pronta para continuar.",
              nivel_frustracao: 1,
              acao: "finish",
              elemento_id: null,
              texto_digitado: null,
              problema_ux_encontrado: null,
              severidade_problema: "nenhuma",
            }),
          },
        );

        expect(result.missionStatus).toBe("completed");
        expect(result.steps.map(({ action }) => action)).toEqual(["finish"]);
        expect(result.techLogs).not.toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              type: "automation",
              message: expect.stringContaining("verificação"),
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
    "não atribui defeito ao site quando o alvo desaparece antes do clique",
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
                problema_ux_encontrado: "O botão de continuar não funciona.",
                severidade_problema: "alta",
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
        expect(result.steps[0]?.uxProblem).toBeNull();
        expect(result.steps[0]?.severity).toBe("none");
        expect(result.recommendations).toEqual([]);
        expect(result.techLogs).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              type: "automation",
              message: expect.stringContaining("não foi confirmada"),
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
    "recupera uma decisão com elemento inexistente sem falhar a auditoria",
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
        targetUrl: `${targetUrl}journey`,
        objective: "Iniciar o cadastro",
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
                pensamento_persona: "Vou clicar no campo.",
                nivel_frustracao: 2,
                acao: "click",
                elemento_id: 99,
                texto_digitado: null,
                problema_ux_encontrado: null,
                severidade_problema: "nenhuma",
              };
            }
            return {
              pensamento_persona: "Vou tentar clicar no outro elemento.",
              nivel_frustracao: 3,
              acao: "click",
              elemento_id: 98,
              texto_digitado: null,
              problema_ux_encontrado: null,
              severidade_problema: "nenhuma",
            };
          },
        });

        expect(decisionIndex).toBe(2);
        expect(result.status).toBe("completed");
        expect(result.missionStatus).toBe("abandoned");
        expect(result.steps.map(({ action }) => action)).toEqual(["give_up"]);
        expect(result.techLogs).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              type: "automation",
              message: expect.stringContaining(
                "marcada como desistente",
              ),
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
