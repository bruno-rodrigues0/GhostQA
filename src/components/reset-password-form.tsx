"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      setErrorMessage("O link de redefinição é inválido ou expirou.");
      return;
    }
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const result = await authClient.resetPassword({ newPassword: password, token });
      if (result.error) {
        setErrorMessage(result.error.message ?? "Não foi possível redefinir a senha.");
      } else {
        setSuccess(true);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível redefinir a senha.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#090d16] px-5 text-slate-100">
      <section className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#0e1521] p-7">
        <Link href="/login" className="text-sm font-semibold text-slate-200">GhostQA</Link>
        <h1 className="mt-8 text-2xl font-semibold">Redefinir senha</h1>
        {success ? (
          <>
            <p role="status" className="mt-3 text-sm text-emerald-200">Senha atualizada com sucesso.</p>
            <Link href="/login" className="mt-6 inline-flex rounded-lg bg-sky-300 px-4 py-3 text-xs font-semibold text-[#07111c]">Entrar</Link>
          </>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4">
            <label className="block text-xs text-slate-300">
              Nova senha
              <input required minLength={12} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 w-full rounded-lg border border-white/10 bg-[#0b111c] px-3 py-3 text-sm outline-none focus:border-sky-300/50" />
            </label>
            {errorMessage && <p role="alert" className="text-xs text-rose-300">{errorMessage}</p>}
            <button disabled={isSubmitting || !token} className="w-full rounded-lg bg-sky-300 px-4 py-3 text-xs font-semibold text-[#07111c] disabled:opacity-50">
              {isSubmitting ? "Aguarde..." : "Salvar nova senha"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
