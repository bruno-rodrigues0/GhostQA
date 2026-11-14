import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, errors } from "playwright";
import type { DeviceViewport, TechLog } from "./types";
import {
  SET_OF_MARK_SCRIPT,
  type MarkedElementInfo,
} from "./set-of-mark";

export interface CaptureSetOfMarkOptions {
  url: string;
  sessionId: string;
  stepNumber: number;
  viewport: DeviceViewport;
}

export interface SetOfMarkCapture {
  screenshotPath: string;
  elements: MarkedElementInfo[];
  techLogs: TechLog[];
}

const viewportSizes: Record<DeviceViewport, { width: number; height: number }> =
  {
    desktop: { width: 1280, height: 800 },
    mobile: { width: 390, height: 844 },
  };

function validateOptions(options: CaptureSetOfMarkOptions): URL {
  let url: URL;
  try {
    url = new URL(options.url);
  } catch {
    throw new Error("A URL da missão precisa ser uma URL absoluta válida.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("A URL da missão precisa usar HTTP ou HTTPS.");
  }

  if (!/^[\w-]{1,128}$/.test(options.sessionId)) {
    throw new Error("O identificador da sessão contém caracteres inválidos.");
  }

  if (!Number.isInteger(options.stepNumber) || options.stepNumber < 1) {
    throw new Error("O número do passo precisa ser um inteiro positivo.");
  }

  return url;
}

export async function captureSetOfMarkScreenshot(
  options: CaptureSetOfMarkOptions,
): Promise<SetOfMarkCapture> {
  const targetUrl = validateOptions(options);
  const outputDirectory = path.join(
    process.cwd(),
    "public",
    "runs",
    options.sessionId,
  );
  const screenshotFileName = `step-${options.stepNumber}-annotated.png`;
  const screenshotPath = path.join(outputDirectory, screenshotFileName);
  const techLogs: TechLog[] = [];

  await mkdir(outputDirectory, { recursive: true });

  console.log(`[GhostQA] Iniciando captura Set-of-Mark: ${targetUrl.href}`);
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?.trim();
  const browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
  });

  try {
    const page = await browser.newPage({
      viewport: viewportSizes[options.viewport],
    });

    page.on("console", (message) => {
      if (message.type() !== "error") {
        return;
      }

      const log: TechLog = {
        id: randomUUID(),
        type: "console",
        message: message.text(),
        createdAt: new Date().toISOString(),
      };
      techLogs.push(log);
      console.log(`[GhostQA] Erro de console: ${log.message}`);
    });

    page.on("pageerror", (error) => {
      const log: TechLog = {
        id: randomUUID(),
        type: "pageerror",
        message: error.message,
        createdAt: new Date().toISOString(),
      };
      techLogs.push(log);
      console.log(`[GhostQA] Erro de página: ${log.message}`);
    });

    page.on("response", (response) => {
      if (response.status() < 400) {
        return;
      }

      const log: TechLog = {
        id: randomUUID(),
        type: "http",
        message: `Resposta HTTP ${response.status()}`,
        url: response.url(),
        status: response.status(),
        createdAt: new Date().toISOString(),
      };
      techLogs.push(log);
      console.log(`[GhostQA] Resposta HTTP ${log.status}: ${log.url}`);
    });

    console.log(`[GhostQA] Navegando para ${targetUrl.href}`);
    await page.goto(targetUrl.href, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    try {
      await page.waitForLoadState("networkidle", { timeout: 10_000 });
    } catch (error) {
      if (!(error instanceof errors.TimeoutError)) {
        throw error;
      }

      console.warn(
        "[GhostQA] A página não atingiu networkidle em 10s; seguindo com o estado atual.",
      );
    }

    await page.addScriptTag({ content: SET_OF_MARK_SCRIPT });
    const elements = await page.evaluate(
      () =>
        (
          window as Window & {
            __ghostSomElements?: MarkedElementInfo[];
          }
        ).__ghostSomElements ?? [],
    );

    await page.screenshot({
      path: screenshotPath,
      animations: "disabled",
    });
    console.log(
      `[GhostQA] Captura salva em ${screenshotPath} (${elements.length} elementos marcados).`,
    );

    return {
      screenshotPath: `/runs/${options.sessionId}/${screenshotFileName}`,
      elements,
      techLogs,
    };
  } finally {
    await browser.close();
    console.log(`[GhostQA] Navegador encerrado para ${options.sessionId}.`);
  }
}
