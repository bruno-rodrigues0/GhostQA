"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Download,
  LoaderCircle,
  Monitor,
  Printer,
  RotateCcw,
  Smartphone,
  TerminalSquare,
  XCircle,
} from "lucide-react";
import { PLAN_LIMITS } from "@/lib/plan-constants";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createMarkdownReport,
  getPrioritizedSteps,
  getSessionStatusLabel,
  getSeverityLabel,
} from "@/lib/report";
import type { Persona, Session, Step } from "@/lib/types";

interface RunReportProps {
  sessionId: string;
}

type ReportTab = "action-plan" | "technical";

function severityStyle(severity: Step["severity"]): string {
  switch (severity) {
    case "high":
      return "border-rose-300/20 bg-rose-300/[0.07] text-rose-200";
    case "medium":
      return "border-amber-300/20 bg-amber-300/[0.07] text-amber-200";
    case "low":
      return "border-sky-300/20 bg-sky-300/[0.07] text-sky-200";
    case "none":
      return "border-white/10 bg-white/[0.03] text-slate-400";
  }
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function statusStyle(session: Session): string {
  if (session.status === "failed") {
    return "border-rose-300/20 bg-rose-300/[0.06] text-rose-200";
  }
  if (session.status === "completed" && session.missionStatus === "completed") {
    return "border-emerald-300/20 bg-emerald-300/[0.06] text-emerald-200";
  }
  if (session.status === "running" || session.status === "pending") {
    return "border-sky-300/20 bg-sky-300/[0.06] text-sky-200";
  }
  return "border-amber-300/20 bg-amber-300/[0.06] text-amber-200";
}

function scoreTone(score: number | null): string {
  if (score === null) {
    return "text-slate-500";
  }
  if (score >= 70) {
    return "text-rose-300";
  }
  if (score >= 40) {
    return "text-amber-300";
  }
  return "text-emerald-300";
}

function personaName(personas: Persona[], personaId: string): string {
  return personas.find(({ id }) => id === personaId)?.name ?? personaId;
}

export function RunReport({ sessionId }: RunReportProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [selectedPersonaId, setSelectedPersonaId] = useState("");
  const [selectedStepId, setSelectedStepId] = useState("");
  const [activeTab, setActiveTab] = useState<ReportTab>("action-plan");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  const loadSession = useCallback(async () => {
    try {
      const response = await fetch(`/api/runs/${sessionId}`, {
        cache: "no-store",
      });
      const result = (await response.json()) as Session | { error?: string };
      if (!response.ok || !("id" in result)) {
        throw new Error(
          "error" in result
            ? result.error
            : "Não foi possível carregar esta auditoria.",
        );
      }
      setSession(result);
      setSelectedPersonaId((current) =>
        result.personas.some(({ id }) => id === current)
          ? current
          : (result.personas[0]?.id ?? ""),
      );
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar esta auditoria.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  useEffect(() => {
    if (!session || (session.status !== "running" && session.status !== "pending")) {
      return;
    }
    const intervalId = window.setInterval(() => {
      void loadSession();
    }, 1500);
    return () => window.clearInterval(intervalId);
  }, [loadSession, session]);

  const personaSteps = useMemo(
    () =>
      session?.steps
        .filter((step) => step.personaId === selectedPersonaId)
        .sort((left, right) => left.order - right.order) ?? [],
    [selectedPersonaId, session],
  );
  const selectedStep =
    personaSteps.find(({ id }) => id === selectedStepId) ?? personaSteps.at(-1);
  const currentScreenshot =
    selectedStep?.cleanScreenshotPath ?? selectedStep?.annotatedScreenshotPath;
  const actionPlan = useMemo(
    () => (session ? getPrioritizedSteps(session.steps) : []),
    [session],
  );
  const currentStepLimit = session
    ? PLAN_LIMITS[session.plan].steps
    : PLAN_LIMITS.free.steps;

  function exportMarkdown() {
    if (!session || session.plan !== "pro") {
      return;
    }
    const blob = new Blob([createMarkdownReport(session)], {
      type: "text/markdown;charset=utf-8",
    });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = `ghostqa-relatorio-${session.id}.md`;
    link.click();
    URL.revokeObjectURL(downloadUrl);
  }

  async function retrySession() {
    setIsRetrying(true);
    setRetryError(null);
    try {
      const response = await fetch(`/api/runs/${sessionId}/retry`, {
        method: "POST",
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error ?? "Não foi possível repetir a auditoria.");
      }
      setSelectedStepId("");
      await loadSession();
    } catch (error) {
      setRetryError(
        error instanceof Error
          ? error.message
          : "Não foi possível repetir a auditoria.",
      );
    } finally {
      setIsRetrying(false);
    }
  }

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#090d16] text-slate-400">
        <div className="flex items-center gap-3 text-sm">
          <LoaderCircle size={17} className="animate-spin text-sky-300" />
          Carregando jornada da auditoria...
        </div>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center bg-[#090d16] px-5 text-center text-slate-100">
        <CircleAlert size={28} className="text-rose-300" />
        <h1 className="mt-4 text-xl font-semibold">Auditoria indisponível</h1>
        <p role="alert" className="mt-2 text-sm text-slate-400">
          {errorMessage ?? "A sessão solicitada não foi encontrada."}
        </p>
        <Link
          href="/"
          className="mt-6 rounded-lg border border-white/10 px-4 py-2 text-xs text-slate-300 hover:bg-white/[0.05]"
        >
          Voltar ao Mission Control
        </Link>
      </main>
    );
  }

  const isActive = session.status === "running" || session.status === "pending";
  const latestThought = personaSteps.at(-1)?.thought;

  return (
    <main className="min-h-screen bg-[#090d16] text-slate-100">
      <header className="sticky top-0 z-10 border-b border-white/[0.07] bg-[#090d16]/90 backdrop-blur-xl print:hidden">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-5 sm:px-8">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              aria-label="Voltar ao Mission Control"
              className="flex size-8 items-center justify-center rounded-lg border border-white/[0.08] text-slate-400 transition hover:bg-white/[0.05] hover:text-slate-100"
            >
              <ArrowLeft size={15} />
            </Link>
            <span className="hidden text-xs text-slate-600 sm:inline">
              Mission Control <span className="mx-1.5">/</span>
            </span>
            <span className="max-w-[45vw] truncate text-xs font-medium text-slate-300">
              Relatório de auditoria
            </span>
          </div>
          <div className="flex items-center gap-2">
            {(session.status === "failed" || session.status === "completed") && (
              <button
                type="button"
                onClick={() => void retrySession()}
                disabled={isRetrying}
                className="inline-flex items-center gap-2 rounded-lg border border-sky-300/20 bg-sky-300/[0.07] px-3 py-2 text-[11px] font-medium text-sky-100 transition hover:bg-sky-300/[0.12] disabled:cursor-wait disabled:opacity-60"
              >
                {isRetrying ? (
                  <LoaderCircle size={13} className="animate-spin" />
                ) : (
                  <RotateCcw size={13} />
                )}
                <span>{isRetrying ? "Preparando..." : "Executar novamente"}</span>
              </button>
            )}
            {session.plan === "pro" ? (
              <>
                <button
                  type="button"
                  onClick={exportMarkdown}
                  className="inline-flex items-center gap-2 rounded-lg border border-white/[0.1] px-3 py-2 text-[11px] font-medium text-slate-300 transition hover:border-white/20 hover:bg-white/[0.04]"
                >
                  <Download size={13} />
                  <span className="hidden sm:inline">Exportar .md</span>
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-2 rounded-lg border border-white/[0.1] px-3 py-2 text-[11px] font-medium text-slate-300 transition hover:border-white/20 hover:bg-white/[0.04]"
                >
                  <Printer size={13} />
                  <span className="hidden sm:inline">Salvar PDF</span>
                </button>
              </>
            ) : (
              <span className="hidden rounded-full border border-amber-300/15 bg-amber-300/[0.04] px-2.5 py-1 text-[9px] font-semibold tracking-wider text-amber-200/80 sm:inline-flex">
                FREE
              </span>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1440px] px-5 py-7 sm:px-8 sm:py-9 print:max-w-none print:p-0">
        <section className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium ${statusStyle(session)}`}
              >
                {isActive ? (
                  <LoaderCircle size={11} className="animate-spin" />
                ) : session.status === "failed" ? (
                  <XCircle size={11} />
                ) : (
                  <CheckCircle2 size={11} />
                )}
                {getSessionStatusLabel(session)}
              </span>
              <span className="rounded-full border border-white/[0.08] px-2.5 py-1 text-[10px] text-slate-500">
                {session.viewport === "desktop" ? "Desktop 1280 × 800" : "Mobile 390 × 844"}
              </span>
            </div>
            <h1 className="mt-4 truncate text-2xl font-semibold tracking-tight sm:text-3xl">
              {session.objective}
            </h1>
            <a
              href={session.targetUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex max-w-full items-center gap-1.5 truncate text-xs text-slate-500 transition hover:text-sky-200"
            >
              <span className="truncate">{session.targetUrl}</span>
              <ArrowUpRight size={12} className="shrink-0" />
            </a>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-[#0e1521] px-4 py-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-violet-300/[0.08] text-violet-200">
              {session.viewport === "desktop" ? (
                <Monitor size={17} />
              ) : (
                <Smartphone size={17} />
              )}
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.12em] text-slate-600">
                Score de fricção
              </p>
              <p className={`font-mono text-2xl font-semibold leading-7 ${scoreTone(session.frictionScore)}`}>
                {session.frictionScore ?? "—"}
                <span className="ml-1 text-[10px] font-normal text-slate-600">/100</span>
              </p>
            </div>
          </div>
        </section>

        {session.status === "failed" && (
          <div
            role="alert"
            className="mt-5 flex items-start gap-2 rounded-xl border border-rose-300/15 bg-rose-300/[0.05] px-4 py-3 text-xs leading-5 text-rose-200"
          >
            <CircleAlert size={14} className="mt-0.5 shrink-0" />
            {session.errorMessage ?? "Ocorreu uma falha durante a auditoria."}
          </div>
        )}
        {session.missionStatus === "blocked" && (
          <div
            role="status"
            className="mt-5 flex items-start gap-2 rounded-xl border border-amber-300/15 bg-amber-300/[0.05] px-4 py-3 text-xs leading-5 text-amber-100"
          >
            <CircleAlert size={14} className="mt-0.5 shrink-0" />
            A auditoria parou diante de uma verificação humana. Resolva-a manualmente no site e repita a auditoria; o GhostQA não tenta interagir com CAPTCHAs.
          </div>
        )}
        {retryError && (
          <div
            role="alert"
            className="mt-3 flex items-start gap-2 rounded-xl border border-rose-300/15 bg-rose-300/[0.05] px-4 py-3 text-xs leading-5 text-rose-200"
          >
            <CircleAlert size={14} className="mt-0.5 shrink-0" />
            {retryError}
          </div>
        )}

        <div className="mt-7 grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.8fr)]">
          <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0e1521]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-3.5 sm:px-5">
              <div className="flex items-center gap-2">
                <span
                  className={`size-2 rounded-full ${isActive ? "animate-pulse bg-sky-300" : "bg-slate-600"}`}
                />
                <h2 className="text-xs font-semibold text-slate-200">
                  {isActive ? "Agente navegando..." : "Registro visual da jornada"}
                </h2>
              </div>
              <span className="font-mono text-[10px] text-slate-600">
                Passo {personaSteps.length}/{currentStepLimit}
              </span>
            </div>

            {session.personas.length > 1 && (
              <div className="flex gap-1 overflow-x-auto border-b border-white/[0.06] px-4 py-2 sm:px-5">
                {session.personas.map((persona) => (
                  <button
                    key={persona.id}
                    type="button"
                    onClick={() => {
                      setSelectedPersonaId(persona.id);
                      setSelectedStepId("");
                    }}
                    className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-[10px] transition ${
                      selectedPersonaId === persona.id
                        ? "bg-sky-300/[0.1] text-sky-100"
                        : "text-slate-500 hover:bg-white/[0.04] hover:text-slate-300"
                    }`}
                  >
                    {persona.name}
                  </button>
                ))}
              </div>
            )}

            <div className="flex min-h-[300px] items-center justify-center bg-[#080c13] p-3 sm:min-h-[440px] sm:p-5">
              {currentScreenshot ? (
                <div className="relative aspect-[16/10] w-full overflow-hidden rounded-lg border border-white/[0.07] bg-[#101722]">
                  <Image
                    src={currentScreenshot}
                    alt={`Screenshot do passo ${selectedStep?.order ?? 0} da auditoria`}
                    fill
                    unoptimized
                    className="object-contain"
                    sizes="(max-width: 1280px) 100vw, 65vw"
                  />
                </div>
              ) : isActive ? (
                <div className="flex flex-col items-center text-center">
                  <span className="flex size-12 items-center justify-center rounded-2xl border border-sky-300/15 bg-sky-300/[0.06] text-sky-200">
                    <LoaderCircle size={21} className="animate-spin" />
                  </span>
                  <p className="mt-4 text-xs font-medium text-slate-300">
                    Preparando navegador isolado
                  </p>
                  <p className="mt-1 text-[11px] text-slate-600">
                    O primeiro screenshot aparecerá aqui.
                  </p>
                </div>
              ) : (
                <div className="text-center text-xs text-slate-600">
                  Nenhum screenshot foi capturado nesta jornada.
                </div>
              )}
            </div>

            <div className="border-t border-white/[0.07] px-4 py-4 sm:px-5">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-600">
                  Timeline da jornada
                </p>
                <span className="text-[10px] text-slate-600">
                  {personaSteps.length} passo(s)
                </span>
              </div>
              {personaSteps.length > 0 ? (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {personaSteps.map((step) => (
                    <button
                      key={step.id}
                      type="button"
                      onClick={() => setSelectedStepId(step.id)}
                      aria-pressed={selectedStep?.id === step.id}
                      className={`min-w-[136px] rounded-lg border px-3 py-2 text-left transition ${
                        selectedStep?.id === step.id
                          ? "border-sky-300/30 bg-sky-300/[0.07]"
                          : "border-white/[0.07] bg-white/[0.015] hover:border-white/[0.14]"
                      }`}
                    >
                      <span className="flex items-center justify-between">
                        <span className="font-mono text-[10px] text-slate-400">
                          Passo {step.order}
                        </span>
                        <span
                          className={`size-1.5 rounded-full ${
                            step.severity === "high"
                              ? "bg-rose-300"
                              : step.severity === "medium"
                                ? "bg-amber-300"
                                : "bg-slate-600"
                          }`}
                        />
                      </span>
                      <span className="mt-1.5 block truncate text-[10px] text-slate-500">
                        {step.action}
                        {step.elementId ? ` · [${step.elementId}]` : ""}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="rounded-lg border border-dashed border-white/[0.08] px-3 py-4 text-center text-[11px] text-slate-600">
                  {isActive ? "Aguardando o primeiro passo..." : "Nenhum passo registrado."}
                </p>
              )}
            </div>
          </section>

          <aside className="space-y-5">
            <section className="rounded-2xl border border-white/[0.08] bg-[#0e1521]">
              <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3.5">
                <h2 className="text-xs font-semibold text-slate-200">
                  {isActive ? "Leitura da persona" : "Pensamento registrado"}
                </h2>
                {selectedStep && (
                  <span className="text-[10px] text-slate-600">
                    {personaName(session.personas, selectedStep.personaId)}
                  </span>
                )}
              </div>
              <div className="p-4">
                {selectedStep ? (
                  <>
                    <div className="flex items-center gap-2 text-[10px] text-slate-600">
                      <Clock3 size={12} />
                      {formatTime(selectedStep.createdAt)}
                      <span>·</span>
                      Passo {selectedStep.order}
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-300">
                      “{selectedStep.thought}”
                    </p>
                    {selectedStep.uxProblem && (
                      <div
                        className={`mt-4 rounded-lg border p-3 ${severityStyle(selectedStep.severity)}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[9px] font-semibold uppercase tracking-[0.12em]">
                            Atrito detectado
                          </span>
                          <span className="text-[9px]">
                            {getSeverityLabel(selectedStep.severity)}
                          </span>
                        </div>
                        <p className="mt-1.5 text-xs leading-5">
                          {selectedStep.uxProblem}
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-xs leading-5 text-slate-600">
                    {latestThought ??
                      (isActive
                        ? "A persona está analisando a tela e ainda não registrou um passo."
                        : "Não há monólogo registrado para esta persona.")}
                  </p>
                )}
              </div>
              {selectedStep && (
                <div className="border-t border-white/[0.06] px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-500">
                      Nível de frustração
                    </span>
                    <span className="font-mono text-[11px] text-slate-300">
                      {selectedStep.frustrationLevel}/10
                    </span>
                  </div>
                  <div className="mt-2 flex gap-1">
                    {Array.from({ length: 10 }, (_, index) => (
                      <span
                        key={index}
                        className={`h-1 flex-1 rounded-full ${
                          index < selectedStep.frustrationLevel
                            ? selectedStep.frustrationLevel >= 7
                              ? "bg-rose-300/80"
                              : selectedStep.frustrationLevel >= 4
                                ? "bg-amber-300/80"
                                : "bg-emerald-300/80"
                            : "bg-white/[0.07]"
                        }`}
                      />
                    ))}
                  </div>
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-white/[0.08] bg-[#0e1521]">
              <div className="flex border-b border-white/[0.07] p-1.5">
                <button
                  type="button"
                  onClick={() => setActiveTab("action-plan")}
                  aria-pressed={activeTab === "action-plan"}
                  className={`flex-1 rounded-lg px-2 py-2 text-[10px] font-medium transition ${
                    activeTab === "action-plan"
                      ? "bg-white/[0.07] text-slate-200"
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  Plano de ação UX
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("technical")}
                  aria-pressed={activeTab === "technical"}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[10px] font-medium transition ${
                    activeTab === "technical"
                      ? "bg-white/[0.07] text-slate-200"
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  <TerminalSquare size={12} />
                  Raio-X técnico
                  {session.plan === "free" && (
                    <span className="text-[8px] font-bold text-amber-200/80">
                      PRO
                    </span>
                  )}
                </button>
              </div>

              {activeTab === "action-plan" ? (
                <div className="max-h-[320px] space-y-2 overflow-y-auto p-3">
                  {session.plan === "free" && (
                    <div className="flex items-start gap-2 rounded-lg border border-amber-300/10 bg-amber-300/[0.035] p-3 text-[10px] leading-4 text-slate-500">
                      <CircleAlert size={13} className="mt-0.5 shrink-0 text-amber-200/70" />
                      Prévia do relatório. O plano Pro inclui exportação e análise técnica completa.
                    </div>
                  )}
                  {actionPlan.length === 0 ? (
                    <p className="px-2 py-5 text-center text-[11px] text-slate-600">
                      Nenhum problema de UX foi registrado.
                    </p>
                  ) : (
                    actionPlan.map((step) => (
                      <article
                        key={step.id}
                        className="rounded-lg border border-white/[0.07] bg-white/[0.015] p-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-medium text-slate-400">
                            Passo {step.order} · {personaName(session.personas, step.personaId)}
                          </span>
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[9px] ${severityStyle(step.severity)}`}
                          >
                            {getSeverityLabel(step.severity)}
                          </span>
                        </div>
                        <p className="mt-2 text-xs leading-5 text-slate-300">
                          {step.uxProblem}
                        </p>
                      </article>
                    ))
                  )}
                </div>
              ) : (
                <div className="max-h-[320px] overflow-y-auto p-3">
                  {session.plan === "free" ? (
                    <div className="rounded-lg border border-amber-300/10 bg-amber-300/[0.035] p-4 text-center">
                      <TerminalSquare
                        size={20}
                        className="mx-auto text-amber-200/70"
                      />
                      <p className="mt-2 text-xs font-medium text-slate-300">
                        Raio-X técnico completo
                      </p>
                      <p className="mt-1 text-[10px] leading-4 text-slate-600">
                        Erros de console e requisições HTTP falhas ficam disponíveis no plano Pro.
                      </p>
                    </div>
                  ) : session.techLogs.length === 0 ? (
                    <p className="px-2 py-5 text-center text-[11px] text-slate-600">
                      Nenhum erro técnico foi capturado.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {session.techLogs.map((log) => (
                        <article
                          key={log.id}
                          className="rounded-lg border border-white/[0.07] bg-[#0a1019] p-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[10px] text-rose-200">
                              {log.status
                                ? `HTTP ${log.status}`
                                : log.type === "automation"
                                  ? "Automação"
                                  : log.type}
                            </span>
                            <span className="text-[9px] text-slate-600">
                              {formatTime(log.createdAt)}
                            </span>
                          </div>
                          <p className="mt-1.5 break-words text-[10px] leading-4 text-slate-400">
                            {log.message}
                          </p>
                          {log.url && (
                            <p className="mt-1 break-all font-mono text-[9px] text-slate-600">
                              {log.url}
                            </p>
                          )}
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>
          </aside>
        </div>

        {session.recommendations.length > 0 && (
          <section className="mt-5 rounded-2xl border border-white/[0.08] bg-[#0e1521] p-4 sm:p-5">
            <h2 className="text-xs font-semibold text-slate-200">
              Recomendações práticas
            </h2>
            <ol className="mt-3 grid gap-2 md:grid-cols-2">
              {session.recommendations.map((recommendation, index) => (
                <li
                  key={`${index}-${recommendation}`}
                  className="flex gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.015] p-3 text-[11px] leading-5 text-slate-400"
                >
                  <span className="font-mono text-sky-200/70">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {recommendation}
                </li>
              ))}
            </ol>
          </section>
        )}

        <footer className="mt-7 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-4 text-[10px] text-slate-700">
          <span>GhostQA · Relatório de qualidade comportamental</span>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 transition hover:text-slate-400"
          >
            Nova missão <ArrowUpRight size={11} />
          </Link>
        </footer>
      </div>
    </main>
  );
}
