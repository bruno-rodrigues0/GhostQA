"use client";

import {
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleHelp,
  ExternalLink,
  FlaskConical,
  Laptop,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Plus,
  Smartphone,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DEFAULT_PERSONAS } from "@/lib/personas";
import { PLAN_LIMITS } from "@/lib/plan-constants";
import { authClient } from "@/lib/auth-client";
import type {
  DeviceViewport,
  Persona,
  Plan,
  Session,
} from "@/lib/types";

const examples = [
  { label: "Loja virtual", url: "https://www.mercadolivre.com.br/" },
  { label: "Produto digital", url: "https://vercel.com/" },
  { label: "Documentação", url: "https://nextjs.org/docs" },
];

const fieldClassName =
  "mt-2 w-full rounded-lg border border-white/[0.09] bg-[#0b111c] px-3.5 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-sky-400/50 focus:ring-2 focus:ring-sky-400/10";

interface MissionControlProps {
  user: { name: string; email: string };
  account: { plan: Plan; used: number; limit: number };
  isAdmin: boolean;
}

function isPersonaSelected(selected: Persona[], personaId: string): boolean {
  return selected.some(({ id }) => id === personaId);
}

export function MissionControl({ user, account, isAdmin }: MissionControlProps) {
  const plan = account.plan;
  const [targetUrl, setTargetUrl] = useState("");
  const [objective, setObjective] = useState("");
  const [viewport, setViewport] = useState<DeviceViewport>("desktop");
  const [selectedPersonas, setSelectedPersonas] = useState<Persona[]>([
    DEFAULT_PERSONAS[0]!,
  ]);
  const [history, setHistory] = useState<Session[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [limitReachedPlan, setLimitReachedPlan] = useState<Plan | null>(null);
  const [showPersonaForm, setShowPersonaForm] = useState(false);
  const [customPersona, setCustomPersona] = useState<Persona>({
    id: "",
    name: "",
    description: "",
    technicalLevel: "medium",
  });

  const monthlyUsage = account.used;
  const sessionLimit = account.limit;

  const loadHistory = useCallback(async () => {
    try {
      const response = await fetch("/api/runs", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Não foi possível carregar o histórico de auditorias.");
      }
      const sessions = (await response.json()) as Session[];
      setHistory(sessions);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar o histórico de auditorias.",
      );
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  function selectExample(url: string) {
    setTargetUrl(url);
  }

  function togglePersona(persona: Persona) {
    setSelectedPersonas((current) => {
      if (isPersonaSelected(current, persona.id)) {
        return current.filter(({ id }) => id !== persona.id);
      }
      if (plan === "free") {
        return [persona];
      }
      if (current.length >= 3) {
        return current;
      }
      return [...current, persona];
    });
  }

  async function submitMission(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    if (selectedPersonas.length === 0) {
      setErrorMessage("Selecione ao menos uma persona para a missão.");
      return;
    }
    if (monthlyUsage >= sessionLimit) {
      setLimitReachedPlan(plan);
      setShowUpgrade(true);
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetUrl,
          objective,
          viewport,
          personas: selectedPersonas,
        }),
      });
      const result = (await response.json()) as {
        id?: string;
        error?: string;
        code?: string;
      };
      if (!response.ok || !result.id) {
        if (result.code === "MONTHLY_LIMIT_REACHED") {
          setLimitReachedPlan(plan);
          setShowUpgrade(true);
          setErrorMessage(null);
          setIsSubmitting(false);
          void loadHistory();
          return;
        }
        throw new Error(result.error ?? "Não foi possível iniciar a missão.");
      }
      window.location.assign(`/runs/${result.id}`);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Não foi possível iniciar a missão.",
      );
      setIsSubmitting(false);
    }
  }

  function addCustomPersona(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedPersonas.length >= PLAN_LIMITS.pro.personas) {
      setErrorMessage("O plano Pro permite até três personas por missão.");
      return;
    }
    const persona: Persona = {
      ...customPersona,
      id: `custom-${crypto.randomUUID()}`,
      name: customPersona.name.trim(),
      description: customPersona.description.trim(),
      context: customPersona.description.trim(),
    };
    setSelectedPersonas((current) => [...current, persona]);
    setCustomPersona({
      id: "",
      name: "",
      description: "",
      technicalLevel: "medium",
    });
    setShowPersonaForm(false);
  }

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[248px] flex-col border-r border-white/[0.07] bg-[#0b1019] px-4 py-5 lg:flex">
        <Link href="/" className="flex items-center gap-3 px-2">
          <span className="flex size-9 items-center justify-center rounded-xl border border-sky-300/20 bg-sky-400/10 text-sky-300">
            <FlaskConical size={18} />
          </span>
          <span>
            <span className="block text-sm font-semibold tracking-wide">
              GhostQA
            </span>
            <span className="block text-[10px] tracking-[0.18em] text-slate-500">
              MISSION CONTROL
            </span>
          </span>
        </Link>

        <div className="mt-10 space-y-1">
          <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">
            Workspace
          </p>
          <Link
            href="/"
            className="flex items-center gap-3 rounded-lg bg-sky-400/[0.09] px-3 py-2.5 text-sm font-medium text-sky-200"
          >
            <Sparkles size={16} />
            Nova missão
          </Link>
          <Link
            href="/audits"
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-400 transition hover:bg-white/[0.04] hover:text-slate-200"
          >
            Auditorias
            <span className="ml-auto rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px]">
              {history.length}
            </span>
          </Link>
        </div>

        <div className="mt-auto rounded-xl border border-white/[0.07] bg-white/[0.025] p-3.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Uso mensal</span>
            <span className="font-mono text-slate-300">
              {monthlyUsage}/{sessionLimit}
            </span>
          </div>
          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
            <div
              className="h-full rounded-full bg-sky-400 transition-all"
              style={{
                width: `${Math.min(100, (monthlyUsage / sessionLimit) * 100)}%`,
              }}
            />
          </div>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-[11px] text-slate-500">Plano da conta</span>
            <span className="rounded-md bg-white/[0.08] px-2 py-1 text-[10px] font-medium text-slate-200">
              {plan === "pro" ? "Pro" : "Free"}
            </span>
          </div>
          <p className="mt-2 text-[10px] text-slate-600">
            {plan === "pro" ? "Plano Pro · R$ 149/mês" : "Plano Free · Hobby"}
          </p>
          <p className="mt-2 truncate text-[10px] text-slate-500" title={user.email}>
            {user.email}
          </p>
          <div className="mt-3 flex items-center gap-3">
            {isAdmin && <Link href="/admin" className="text-[10px] text-sky-200 hover:text-sky-100">Administração</Link>}
            <button
              type="button"
              onClick={async () => {
                await authClient.signOut();
                window.location.assign("/login");
              }}
              className="inline-flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300"
            >
              <LogOut size={11} /> Sair
            </button>
          </div>
        </div>
      </aside>

      <div className="lg:pl-[248px]">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-white/[0.07] bg-[#090d16]/90 px-5 backdrop-blur-xl sm:px-8">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="lg:hidden font-semibold text-slate-200">GhostQA</span>
            <span className="hidden lg:inline">Workspace</span>
            <span className="text-slate-700">/</span>
            <span className="text-slate-300">Nova missão</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.025] px-3 py-1.5">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-40" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
              </span>
              <span className="text-[11px] text-slate-400">Motor operacional</span>
            </div>
            <button
              type="button"
              aria-label="Ajuda"
              className="hidden size-8 items-center justify-center rounded-lg text-slate-500 hover:bg-white/[0.05] hover:text-slate-300 sm:flex"
            >
              <CircleHelp size={17} />
            </button>
            <div className="flex size-8 items-center justify-center rounded-full border border-sky-300/20 bg-sky-400/10 text-[11px] font-semibold text-sky-200">
              {user.name.slice(0, 1).toLocaleUpperCase("pt-BR")}
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1240px] px-5 py-8 sm:px-8 sm:py-10">
          <section className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-sky-300/15 bg-sky-300/[0.06] px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-sky-200">
                <WandSparkles size={12} />
                Auditoria comportamental
              </div>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-100 sm:text-[38px]">
                Nova missão
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">
                Configure uma jornada e observe como pessoas reais poderiam
                encontrar atritos no seu produto.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="size-1.5 rounded-full bg-sky-300" />
              Ambiente de auditoria pronto
            </div>
          </section>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
            <form
              onSubmit={submitMission}
              className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0e1521]/90 shadow-[0_24px_80px_-40px_rgba(0,0,0,0.8)]"
            >
              <div className="border-b border-white/[0.07] px-5 py-4 sm:px-7">
                <div className="flex items-center gap-3">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-sky-400/10 text-xs font-semibold text-sky-200">
                    01
                  </span>
                  <div>
                    <h2 className="text-sm font-semibold">Alvo da auditoria</h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Defina o site e o resultado esperado.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-6 px-5 py-6 sm:px-7 sm:py-7">
                <label className="block text-xs font-medium text-slate-300">
                  URL do produto
                  <div className="relative">
                    <ExternalLink
                      size={15}
                      className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-600"
                    />
                    <input
                      type="url"
                      name="targetUrl"
                      required
                      maxLength={2048}
                      value={targetUrl}
                      onChange={(event) => setTargetUrl(event.target.value)}
                      placeholder="https://seu-produto.com"
                      className={`${fieldClassName} pl-10`}
                    />
                  </div>
                  <span className="mt-2 block text-[11px] font-normal text-slate-600">
                    A página precisa estar acessível publicamente pela internet.
                  </span>
                </label>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">
                      Comece por um exemplo
                    </span>
                    <span className="text-[10px] text-slate-600">preenchimento rápido</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {examples.map((example) => (
                      <button
                        key={example.label}
                        type="button"
                        onClick={() => selectExample(example.url)}
                        className={`rounded-lg border px-3 py-2 text-xs transition ${
                          targetUrl === example.url
                            ? "border-sky-300/30 bg-sky-300/[0.08] text-sky-100"
                            : "border-white/[0.08] bg-white/[0.02] text-slate-400 hover:border-white/[0.16] hover:text-slate-200"
                        }`}
                      >
                        {example.label}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="block text-xs font-medium text-slate-300">
                  Objetivo da missão
                  <textarea
                    name="objective"
                    required
                    maxLength={2000}
                    rows={3}
                    value={objective}
                    onChange={(event) => setObjective(event.target.value)}
                    placeholder="Ex.: Encontrar os preços e iniciar o cadastro"
                    className={`${fieldClassName} resize-y leading-5`}
                  />
                  <span className="mt-1.5 flex justify-end text-[10px] font-normal text-slate-600">
                    {objective.length}/2000
                  </span>
                </label>

                <div className="grid gap-6 border-t border-white/[0.06] pt-6 sm:grid-cols-2">
                  <fieldset>
                    <legend className="text-xs font-medium text-slate-300">
                      Dispositivo
                    </legend>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setViewport("desktop")}
                        aria-pressed={viewport === "desktop"}
                        className={`flex items-center gap-2.5 rounded-lg border p-3 text-left transition ${
                          viewport === "desktop"
                            ? "border-sky-300/30 bg-sky-300/[0.07] text-sky-100"
                            : "border-white/[0.08] bg-white/[0.02] text-slate-400 hover:bg-white/[0.04]"
                        }`}
                      >
                        <Laptop size={17} />
                        <span>
                          <span className="block text-xs font-medium">Desktop</span>
                          <span className="mt-0.5 block text-[10px] opacity-60">1280 × 800</span>
                        </span>
                        {viewport === "desktop" && <Check size={14} className="ml-auto" />}
                      </button>
                      <button
                        type="button"
                        aria-pressed={viewport === "mobile"}
                        onClick={() => {
                          if (plan === "free") {
                            setShowUpgrade(true);
                            return;
                          }
                          setViewport("mobile");
                        }}
                        className={`relative flex items-center gap-2.5 rounded-lg border p-3 text-left transition ${
                          viewport === "mobile"
                            ? "border-sky-300/30 bg-sky-300/[0.07] text-sky-100"
                            : "border-white/[0.08] bg-white/[0.02] text-slate-400 hover:bg-white/[0.04]"
                        }`}
                      >
                        <Smartphone size={17} />
                        <span>
                          <span className="block text-xs font-medium">Mobile</span>
                          <span className="mt-0.5 block text-[10px] opacity-60">390 × 844</span>
                        </span>
                        {plan === "free" ? (
                          <span className="absolute -right-1.5 -top-1.5 rounded border border-amber-300/25 bg-amber-300/10 px-1 py-0.5 text-[8px] font-bold tracking-wider text-amber-200">
                            PRO
                          </span>
                        ) : viewport === "mobile" ? (
                          <Check size={14} className="ml-auto" />
                        ) : null}
                      </button>
                    </div>
                  </fieldset>

                  <div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-slate-300">Personas</p>
                      <span className="text-[10px] text-slate-600">
                        {selectedPersonas.length}/{plan === "pro" ? 3 : 1} selecionada(s)
                      </span>
                    </div>
                    <div className="mt-2 space-y-2">
                      {DEFAULT_PERSONAS.map((persona) => {
                        const selected = isPersonaSelected(
                          selectedPersonas,
                          persona.id,
                        );
                        return (
                          <button
                            key={persona.id}
                            type="button"
                            onClick={() => togglePersona(persona)}
                            aria-pressed={selected}
                            className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition ${
                              selected
                                ? "border-sky-300/25 bg-sky-300/[0.06]"
                                : "border-white/[0.07] bg-white/[0.015] hover:border-white/[0.14]"
                            }`}
                          >
                            <span
                              className={`flex size-4 shrink-0 items-center justify-center rounded border ${
                                selected
                                  ? "border-sky-300 bg-sky-300 text-[#08111c]"
                                  : "border-white/20"
                              }`}
                            >
                              {selected && <Check size={11} strokeWidth={3} />}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-slate-300">
                              {persona.name}
                            </span>
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        disabled={
                          plan === "pro" && selectedPersonas.length >= PLAN_LIMITS.pro.personas
                        }
                        onClick={() =>
                          plan === "pro"
                            ? setShowPersonaForm(true)
                            : setShowUpgrade(true)
                        }
                        className="flex w-full items-center gap-2 rounded-lg border border-dashed border-white/[0.12] px-3 py-2 text-left text-[11px] text-slate-500 transition hover:border-sky-300/25 hover:text-sky-200 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Plus size={13} />
                        Nova persona
                        {plan === "free" && (
                          <span className="ml-auto text-[9px] font-semibold text-amber-200/70">
                            PRO
                          </span>
                        )}
                      </button>
                      {selectedPersonas
                        .filter(
                          ({ id }) =>
                            !DEFAULT_PERSONAS.some((item) => item.id === id),
                        )
                        .map((persona) => (
                          <button
                            key={persona.id}
                            type="button"
                            onClick={() => togglePersona(persona)}
                            className="flex w-full items-center gap-2 rounded-lg border border-sky-300/20 bg-sky-300/[0.05] px-3 py-2 text-left text-[11px] text-sky-100"
                          >
                            <Check size={13} />
                            <span className="flex-1 truncate">{persona.name}</span>
                            <span className="text-slate-500">Remover</span>
                          </button>
                        ))}
                    </div>
                  </div>
                </div>

                {errorMessage && (
                  <div
                    role="alert"
                    className="rounded-lg border border-rose-300/20 bg-rose-400/[0.06] px-3.5 py-3 text-xs leading-5 text-rose-200"
                  >
                    {errorMessage}
                  </div>
                )}
              </div>

              <div className="flex flex-col-reverse items-start justify-between gap-3 border-t border-white/[0.07] bg-black/10 px-5 py-4 sm:flex-row sm:items-center sm:px-7">
                <p className="text-[11px] text-slate-600">
                  <span className="font-mono text-slate-500">
                    {PLAN_LIMITS[plan].steps} passos máx.
                  </span>{" "}
                  · screenshots e relatório incluídos
                </p>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-sky-300 px-4 text-xs font-semibold text-[#07111c] shadow-[0_6px_24px_-10px_rgba(56,189,248,0.7)] transition hover:bg-sky-200 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                >
                  {isSubmitting ? (
                    <LoaderCircle size={15} className="animate-spin" />
                  ) : (
                    <Sparkles size={15} />
                  )}
                  {isSubmitting ? "Iniciando missão..." : "Iniciar auditoria"}
                  {!isSubmitting && <ArrowUpRight size={14} />}
                </button>
              </div>
            </form>

            <aside className="space-y-4">
              <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0e1521]/80">
                <div className="border-b border-white/[0.07] px-4 py-3.5">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                    <span className="size-1.5 rounded-full bg-emerald-400" />
                    Resumo do plano
                  </div>
                </div>
                <div className="space-y-3 px-4 py-4">
                  {[
                    ["Sessões mensais", `${sessionLimit} testes`],
                    ["Personas simultâneas", `Até ${PLAN_LIMITS[plan].personas}`],
                    ["Profundidade", `${PLAN_LIMITS[plan].steps} passos`],
                    ["Dispositivo", plan === "pro" ? "Desktop + Mobile" : "Desktop"],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between gap-3">
                      <span className="text-[11px] text-slate-500">{label}</span>
                      <span className="text-[11px] font-medium text-slate-300">{value}</span>
                    </div>
                  ))}
                  {plan === "free" && (
                    <button
                      type="button"
                      onClick={() => setShowUpgrade(true)}
                      className="mt-1 flex w-full items-center justify-between rounded-lg border border-sky-300/15 bg-sky-300/[0.05] px-3 py-2.5 text-left text-[11px] text-sky-100 transition hover:bg-sky-300/[0.09]"
                    >
                      Ver plano Pro
                      <ArrowUpRight size={13} />
                    </button>
                  )}
                </div>
              </section>

              <section className="rounded-2xl border border-white/[0.08] bg-[#0e1521]/80 p-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                  <span className="flex size-6 items-center justify-center rounded-md bg-violet-300/10 text-violet-200">
                    <Sparkles size={13} />
                  </span>
                  O que será analisado
                </div>
                <ul className="mt-4 space-y-3">
                  {[
                    "Clareza dos caminhos e chamadas para ação",
                    "Atritos de navegação por dispositivo",
                    "Erros técnicos e respostas HTTP",
                  ].map((item) => (
                    <li
                      key={item}
                      className="flex gap-2.5 text-[11px] leading-5 text-slate-500"
                    >
                      <Check size={13} className="mt-0.5 shrink-0 text-emerald-300/70" />
                      {item}
                    </li>
                  ))}
                </ul>
              </section>
            </aside>
          </div>

          <footer className="mt-8 flex items-center justify-between border-t border-white/[0.06] pt-4 text-[10px] text-slate-700">
            <span>GhostQA · Engenharia de qualidade comportamental</span>
            <span className="hidden items-center gap-1 sm:flex">
              <span className="size-1 rounded-full bg-emerald-400/70" />
              Ambiente seguro
            </span>
          </footer>
        </main>
      </div>

      {showUpgrade && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setShowUpgrade(false);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="upgrade-title"
            className="w-full max-w-md rounded-2xl border border-white/10 bg-[#111a29] p-6 shadow-2xl"
          >
            <div className="flex size-10 items-center justify-center rounded-xl border border-amber-200/15 bg-amber-200/[0.07] text-amber-200">
              <LockKeyhole size={18} />
            </div>
            <h2 id="upgrade-title" className="mt-4 text-lg font-semibold">
              {limitReachedPlan === "pro"
                ? "Limite mensal atingido"
                : "Desbloqueie o plano Pro"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              {limitReachedPlan === "pro"
                ? "Sua conta atingiu o limite mensal de auditorias. O limite será renovado no próximo mês."
                : "O plano Pro inclui até 100 auditorias por mês, Mobile, 3 personas simultâneas e jornadas com até 12 passos. A ativação é feita manualmente pela equipe GhostQA."}
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setShowUpgrade(false)}
                className="flex-1 rounded-lg bg-sky-300 px-3 py-2.5 text-xs font-semibold text-[#07111c] hover:bg-sky-200"
              >
                Entendi
              </button>
              <button
                type="button"
                onClick={() => setShowUpgrade(false)}
                className="rounded-lg border border-white/10 px-3 py-2.5 text-xs text-slate-400 hover:bg-white/[0.04]"
              >
                Agora não
              </button>
            </div>
          </section>
        </div>
      )}

      {showPersonaForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <form
            onSubmit={addCustomPersona}
            className="w-full max-w-md rounded-2xl border border-white/10 bg-[#111a29] p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Nova persona</h2>
              <button
                type="button"
                onClick={() => setShowPersonaForm(false)}
                aria-label="Fechar"
                className="rounded p-1 text-slate-500 hover:text-slate-200"
              >
                <ChevronDown size={18} />
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Crie um perfil para explorar uma perspectiva específica.
            </p>
            <label className="mt-5 block text-xs text-slate-300">
              Nome
              <input
                required
                maxLength={100}
                value={customPersona.name}
                onChange={(event) =>
                  setCustomPersona((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="Ex.: A pesquisadora cuidadosa"
                className={fieldClassName}
              />
            </label>
            <label className="mt-4 block text-xs text-slate-300">
              Idade
              <input
                required
                type="number"
                min={1}
                max={120}
                value={customPersona.age ?? ""}
                onChange={(event) => {
                  const age = event.currentTarget.valueAsNumber;
                  setCustomPersona((current) => ({
                    ...current,
                    age: Number.isNaN(age) ? undefined : age,
                  }));
                }}
                className={fieldClassName}
              />
            </label>
            <label className="mt-4 block text-xs text-slate-300">
              Contexto
              <textarea
                required
                maxLength={2000}
                rows={3}
                value={customPersona.description}
                onChange={(event) =>
                  setCustomPersona((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                placeholder="Descreva como essa pessoa navega e o que busca..."
                className={`${fieldClassName} resize-y`}
              />
            </label>
            <label className="mt-4 block text-xs text-slate-300">
              Nível técnico
              <select
                value={customPersona.technicalLevel}
                onChange={(event) => {
                  const level = event.currentTarget.value;
                  if (level === "low" || level === "medium" || level === "high") {
                    setCustomPersona((current) => ({
                      ...current,
                      technicalLevel: level,
                    }));
                  }
                }}
                className={fieldClassName}
              >
                <option value="low">Baixo</option>
                <option value="medium">Intermediário</option>
                <option value="high">Alto</option>
              </select>
            </label>
            <button
              type="submit"
              className="mt-5 w-full rounded-lg bg-sky-300 px-4 py-2.5 text-xs font-semibold text-[#07111c] hover:bg-sky-200"
            >
              Adicionar persona
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
