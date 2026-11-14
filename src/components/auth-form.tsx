"use client";

import Link from "next/link";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function AuthForm() {
  const [mode, setMode] = useState<"sign-in" | "sign-up" | "forgot">("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setNoticeMessage(null);
    setIsSubmitting(true);
    try {
      if (mode === "forgot") {
        const result = await authClient.requestPasswordReset({
          email,
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (result.error) {
          setErrorMessage(result.error.message ?? "Não foi possível solicitar a redefinição.");
        } else {
          setNoticeMessage("Se o e-mail estiver cadastrado, enviaremos um link para redefinir a senha.");
        }
        return;
      }

      const result = mode === "sign-in"
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({ name, email, password });
      if (result.error) {
        setErrorMessage(result.error.message ?? "Não foi possível autenticar.");
        return;
      }
      if (mode === "sign-up") {
        setNoticeMessage("Conta criada. Verifique seu e-mail para confirmar o endereço antes de entrar.");
        setMode("sign-in");
        return;
      }
      window.location.assign("/");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Não foi possível autenticar.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#090d16] px-5 text-slate-100">
      <section className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#0e1521] p-7 shadow-2xl">
        <Link href="/" className="text-sm font-semibold tracking-wide text-slate-200">GhostQA</Link>
        <p className="mt-8 text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-200">Conta GhostQA</p>
        <h1 className="mt-2 text-2xl font-semibold">{mode === "sign-in" ? "Entrar" : "Criar conta"}</h1>
        <p className="mt-2 text-xs leading-5 text-slate-500">
          Auditorias e plano ficam associados à sua conta.
        </p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          {mode === "sign-up" && (
            <label className="block text-xs text-slate-300">
              Nome
              <input required autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} className="mt-2 w-full rounded-lg border border-white/10 bg-[#0b111c] px-3 py-3 text-sm outline-none focus:border-sky-300/50" />
            </label>
          )}
          <label className="block text-xs text-slate-300">
            E-mail
            <input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 w-full rounded-lg border border-white/10 bg-[#0b111c] px-3 py-3 text-sm outline-none focus:border-sky-300/50" />
          </label>
          {mode !== "forgot" && (
            <label className="block text-xs text-slate-300">
              Senha
              <input required type="password" minLength={mode === "sign-up" ? 12 : undefined} autoComplete={mode === "sign-in" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 w-full rounded-lg border border-white/10 bg-[#0b111c] px-3 py-3 text-sm outline-none focus:border-sky-300/50" />
              {mode === "sign-up" && <span className="mt-1 block text-[10px] text-slate-600">Use pelo menos 12 caracteres.</span>}
            </label>
          )}
          {errorMessage && <p role="alert" className="text-xs text-rose-300">{errorMessage}</p>}
          {noticeMessage && <p role="status" className="text-xs leading-5 text-emerald-200">{noticeMessage}</p>}
          <button disabled={isSubmitting} className="w-full rounded-lg bg-sky-300 px-4 py-3 text-xs font-semibold text-[#07111c] disabled:opacity-60">
            {isSubmitting ? "Aguarde..." : mode === "sign-in" ? "Entrar" : mode === "sign-up" ? "Criar conta" : "Enviar link de redefinição"}
          </button>
        </form>
        <div className="mt-5 flex flex-col gap-3 text-center text-xs">
          {mode === "sign-in" && (
            <button type="button" onClick={() => { setErrorMessage(null); setNoticeMessage(null); setMode("forgot"); }} className="text-slate-500 hover:text-slate-300">
              Esqueci minha senha
            </button>
          )}
          <button type="button" onClick={() => { setErrorMessage(null); setNoticeMessage(null); setMode(mode === "sign-up" ? "sign-in" : mode === "forgot" ? "sign-in" : "sign-up"); }} className="text-slate-400 hover:text-slate-200">
            {mode === "sign-up" ? "Já tem conta? Entrar" : mode === "forgot" ? "Voltar para entrar" : "Ainda não tem conta? Criar conta"}
          </button>
        </div>
      </section>
    </main>
  );
}
