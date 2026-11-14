"use client";

import {
  ArrowLeft,
  ArrowUpRight,
  Clock3,
  LoaderCircle,
  Plus,
  Search,
  ServerCrash,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getSessionStatusLabel } from "@/lib/report";
import type { Session } from "@/lib/types";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function scoreColor(score: number | null): string {
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

function statusStyle(session: Session): string {
  if (session.status === "failed") {
    return "border-rose-300/20 bg-rose-300/[0.06] text-rose-200";
  }
  if (session.status === "running" || session.status === "pending") {
    return "border-sky-300/20 bg-sky-300/[0.06] text-sky-200";
  }
  if (session.missionStatus === "completed") {
    return "border-emerald-300/20 bg-emerald-300/[0.06] text-emerald-200";
  }
  return "border-amber-300/20 bg-amber-300/[0.06] text-amber-200";
}

export function AuditHistory() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    try {
      const response = await fetch("/api/runs", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Não foi possível carregar as auditorias.");
      }
      const result = (await response.json()) as Session[];
      setSessions(result);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar as auditorias.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const hasActiveSession = sessions.some(
    ({ status }) => status === "running" || status === "pending",
  );

  useEffect(() => {
    if (!hasActiveSession) {
      return;
    }
    const intervalId = window.setInterval(() => {
      void loadSessions();
    }, 5000);
    return () => window.clearInterval(intervalId);
  }, [hasActiveSession, loadSessions]);

  const filteredSessions = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
    if (!normalizedSearch) {
      return sessions;
    }
    return sessions.filter(
      ({ targetUrl, objective }) =>
        targetUrl.toLocaleLowerCase("pt-BR").includes(normalizedSearch) ||
        objective.toLocaleLowerCase("pt-BR").includes(normalizedSearch),
    );
  }, [search, sessions]);

  return (
    <main className="min-h-screen bg-[#090d16] text-slate-100">
      <header className="sticky top-0 z-10 border-b border-white/[0.07] bg-[#090d16]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              aria-label="Voltar para nova missão"
              className="flex size-8 items-center justify-center rounded-lg border border-white/[0.08] text-slate-400 transition hover:bg-white/[0.05] hover:text-slate-100"
            >
              <ArrowLeft size={15} />
            </Link>
            <span className="text-xs font-semibold tracking-wide text-slate-200">
              GhostQA
            </span>
            <span className="text-xs text-slate-700">/</span>
            <span className="text-xs text-slate-300">Auditorias</span>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg bg-sky-300 px-3.5 py-2 text-[11px] font-semibold text-[#07111c] transition hover:bg-sky-200"
          >
            <Plus size={14} />
            Nova missão
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-9 sm:px-8 sm:py-12">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-sky-300/15 bg-sky-300/[0.06] px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-sky-200">
              <Clock3 size={12} />
              Histórico de execuções
            </div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-[38px]">
              Auditorias
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Consulte o andamento e os resultados das missões anteriores.
            </p>
          </div>
          <span className="text-xs text-slate-500">
            {sessions.length} auditoria(s)
          </span>
        </div>

        <label className="relative mt-8 block max-w-lg">
          <Search
            size={15}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-600"
          />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por URL ou objetivo"
            aria-label="Buscar auditorias por URL ou objetivo"
            className="w-full rounded-lg border border-white/[0.09] bg-[#0b111c] py-3 pl-10 pr-3.5 text-xs text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-sky-400/50 focus:ring-2 focus:ring-sky-400/10"
          />
        </label>

        <section className="mt-5 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0e1521]/80">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 px-5 py-16 text-xs text-slate-500">
              <LoaderCircle size={15} className="animate-spin text-sky-300" />
              Carregando auditorias...
            </div>
          ) : errorMessage ? (
            <div className="flex flex-col items-center px-5 py-16 text-center">
              <ServerCrash size={24} className="text-rose-300" />
              <p role="alert" className="mt-3 text-sm text-slate-300">
                {errorMessage}
              </p>
              <button
                type="button"
                onClick={() => {
                  setIsLoading(true);
                  void loadSessions();
                }}
                className="mt-4 rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300 transition hover:bg-white/[0.05]"
              >
                Tentar novamente
              </button>
            </div>
          ) : filteredSessions.length === 0 ? (
            <div className="flex flex-col items-center px-5 py-16 text-center">
              <span className="flex size-11 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.025] text-slate-500">
                <Clock3 size={19} />
              </span>
              <p className="mt-4 text-sm font-medium text-slate-300">
                {sessions.length === 0
                  ? "Nenhuma auditoria por aqui ainda."
                  : "Nenhuma auditoria corresponde à busca."}
              </p>
              <p className="mt-1 max-w-sm text-xs leading-5 text-slate-600">
                {sessions.length === 0
                  ? "Crie uma missão para acompanhar a jornada e consultar o relatório nesta página."
                  : "Tente buscar por outra URL ou objetivo."}
              </p>
              {sessions.length === 0 && (
                <Link
                  href="/"
                  className="mt-5 inline-flex items-center gap-2 rounded-lg bg-sky-300 px-3.5 py-2.5 text-xs font-semibold text-[#07111c] transition hover:bg-sky-200"
                >
                  <Plus size={14} />
                  Criar primeira missão
                </Link>
              )}
            </div>
          ) : (
            <div className="divide-y divide-white/[0.06]">
              {filteredSessions.map((session) => (
                <Link
                  key={session.id}
                  href={`/runs/${session.id}`}
                  className="group grid gap-3 px-4 py-4 transition hover:bg-white/[0.025] sm:grid-cols-[minmax(0,1fr)_110px_155px_20px] sm:items-center sm:px-5"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium text-slate-200 transition group-hover:text-sky-100">
                      {session.objective}
                    </span>
                    <span className="mt-1.5 block truncate text-[10px] text-slate-500">
                      {session.targetUrl}
                    </span>
                    <span className="mt-2 flex flex-wrap gap-1.5">
                      <span className="rounded border border-white/[0.08] px-1.5 py-0.5 text-[9px] text-slate-500">
                        {session.plan === "pro" ? "PRO" : "FREE"}
                      </span>
                      <span className="rounded border border-white/[0.08] px-1.5 py-0.5 text-[9px] text-slate-500">
                        {session.viewport === "desktop" ? "Desktop" : "Mobile"}
                      </span>
                      <span className="rounded border border-white/[0.08] px-1.5 py-0.5 text-[9px] text-slate-500">
                        {session.personas.length} persona(s)
                      </span>
                    </span>
                  </span>
                  <span className="flex items-center gap-2 text-[10px] text-slate-500">
                    Fricção
                    <span
                      className={`font-mono text-sm font-semibold ${scoreColor(session.frictionScore)}`}
                    >
                      {session.frictionScore ?? "—"}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center justify-between gap-2 sm:flex-col sm:items-start">
                    <span
                      className={`rounded-full border px-2 py-1 text-[9px] ${statusStyle(session)}`}
                    >
                      {getSessionStatusLabel(session)}
                    </span>
                    <span className="text-[10px] text-slate-600">
                      {formatDate(session.createdAt)}
                    </span>
                  </span>
                  <ArrowUpRight
                    size={14}
                    className="hidden text-slate-600 transition group-hover:text-sky-200 sm:block"
                  />
                </Link>
              ))}
            </div>
          )}
        </section>

        <footer className="mt-7 border-t border-white/[0.06] pt-4 text-[10px] text-slate-700">
          GhostQA · Engenharia de qualidade comportamental
        </footer>
      </div>
    </main>
  );
}
