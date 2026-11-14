import { cp, mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const apply = process.argv.includes("--apply");
const prisma = new PrismaClient();
const cwd = process.cwd();
const legacyRunsDirectory = path.join(cwd, "data", "runs");
const publicScreenshotsDirectory = path.join(cwd, "public", "runs");
const privateScreenshotsDirectory = path.join(cwd, "data", "private-runs");

function assertSession(value, filename) {
  if (
    typeof value !== "object" ||
    value === null ||
    typeof value.id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.id) ||
    !Array.isArray(value.personas) ||
    !Array.isArray(value.steps)
  ) {
    throw new Error(`Dados inválidos em ${filename}. Migração cancelada.`);
  }
}

function privateScreenshotPath(sessionId, oldPath) {
  if (typeof oldPath !== "string") {
    return oldPath;
  }
  const match = oldPath.match(/^\/runs\/([0-9a-f-]{36})\/([\w-]{1,128})\/([\w.-]{1,180}\.png)$/i);
  if (!match || match[1] !== sessionId) {
    throw new Error(`Caminho de screenshot inválido na sessão ${sessionId}.`);
  }
  return `/api/runs/${sessionId}/screenshots/${match[2]}/${match[3]}`;
}

try {
  const adminEmail = process.env.ADMIN_EMAILS?.split(",")
    .map((email) => email.trim().toLocaleLowerCase("en-US"))
    .find(Boolean);
  if (!adminEmail) {
    throw new Error("Defina o e-mail do primeiro administrador em ADMIN_EMAILS.");
  }
  const admin = await prisma.user.findFirst({
    where: { email: { equals: adminEmail, mode: "insensitive" } },
    select: { id: true, email: true },
  });
  if (!admin) {
    throw new Error(`A conta administradora ${adminEmail} ainda não existe. Cadastre-a antes da migração.`);
  }

  let filenames = [];
  try {
    filenames = (await readdir(legacyRunsDirectory)).filter((name) =>
      /^[0-9a-f-]{36}\.json$/i.test(name),
    );
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }

  const sessions = [];
  for (const filename of filenames) {
    const sourceFile = path.join(legacyRunsDirectory, filename);
    const session = JSON.parse(await readFile(sourceFile, "utf8"));
    assertSession(session, filename);
    if (`${session.id}.json` !== filename) {
      throw new Error(`O ID da sessão não corresponde ao arquivo ${filename}.`);
    }
    session.ownerId = admin.id;
    for (const step of session.steps) {
      step.annotatedScreenshotPath = privateScreenshotPath(session.id, step.annotatedScreenshotPath);
      step.cleanScreenshotPath = privateScreenshotPath(session.id, step.cleanScreenshotPath);
    }
    sessions.push(session);
  }

  const screenshotCopies = [];
  for (const session of sessions) {
    const sourceDirectory = path.join(publicScreenshotsDirectory, session.id);
    try {
      await stat(sourceDirectory);
      screenshotCopies.push({
        source: sourceDirectory,
        target: path.join(privateScreenshotsDirectory, session.id),
      });
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw error;
      }
      const hasScreenshotReference = session.steps.some(
        (step) => step.annotatedScreenshotPath || step.cleanScreenshotPath,
      );
      if (hasScreenshotReference) {
        throw new Error(`Faltam screenshots no disco para a sessão ${session.id}.`);
      }
    }
  }

  const existingRuns = sessions.length
    ? await prisma.auditRun.findMany({
        where: { id: { in: sessions.map(({ id }) => id) } },
        select: { id: true, userId: true },
      })
    : [];
  const foreignRun = existingRuns.find(({ userId }) => userId !== admin.id);
  if (foreignRun) {
    throw new Error(`A sessão ${foreignRun.id} já pertence a outra conta; nenhuma migração foi aplicada.`);
  }

  console.log(`Administrador: ${admin.email}`);
  console.log(`Auditorias encontradas: ${sessions.length}`);
  console.log(`Pastas de screenshots para migrar: ${screenshotCopies.length}`);
  if (!apply) {
    console.log("Simulação concluída. Use --apply para aplicar a migração.");
  } else {
    await mkdir(privateScreenshotsDirectory, { recursive: true });
    for (const copy of screenshotCopies) {
      await cp(copy.source, copy.target, { recursive: true, force: true });
    }
    await prisma.$transaction(
      sessions.map((session) =>
        prisma.auditRun.upsert({
          where: { id: session.id },
          create: {
            id: session.id,
            userId: admin.id,
            plan: session.plan === "pro" ? "pro" : "free",
            createdAt: new Date(session.createdAt),
            updatedAt: new Date(session.updatedAt),
            data: session,
          },
          update: {},
        }),
      ),
    );
    for (const session of sessions) {
      await rm(path.join(publicScreenshotsDirectory, session.id), {
        recursive: true,
        force: true,
      });
      await rm(path.join(legacyRunsDirectory, `${session.id}.json`), { force: true });
    }
    console.log("Migração concluída; as screenshots legadas públicas foram removidas.");
  }
} catch (error) {
  console.error("[GhostQA] Migração legada cancelada.", error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
