"use client";

import { useCallback, useEffect, useState } from "react";

interface AdminUser {
  id: string;
  name: string;
  email: string;
  plan: "free" | "pro";
  grant: { note: string | null; createdAt: string } | null;
}

export function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [note, setNote] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    const response = await fetch("/api/admin/users", { cache: "no-store" });
    const result = (await response.json()) as AdminUser[] | { error?: string };
    if (!response.ok || !Array.isArray(result)) {
      const message = Array.isArray(result)
        ? "Não foi possível carregar as contas."
        : result.error ?? "Não foi possível carregar as contas.";
      throw new Error(message);
    }
    setUsers(result);
  }, []);

  useEffect(() => {
    void loadUsers().catch((error: unknown) => {
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível carregar as contas.");
    });
  }, [loadUsers]);

  async function setPlan(user: AdminUser, plan: "free" | "pro") {
    setPendingUserId(user.id);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: user.id, plan, note }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error ?? "Não foi possível alterar o plano.");
      }
      setNote("");
      await loadUsers();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível alterar o plano.");
    } finally {
      setPendingUserId(null);
    }
  }

  return (
    <section className="mt-8 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0e1521]">
      <div className="border-b border-white/[0.07] p-5">
        <h2 className="text-sm font-semibold">Contas</h2>
        <p className="mt-1 text-xs text-slate-500">A concessão Pro é manual e registrada com o administrador responsável.</p>
        <label className="mt-4 block text-xs text-slate-400">
          Nota da concessão (opcional)
          <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} className="mt-2 w-full max-w-xl rounded-lg border border-white/10 bg-[#0b111c] px-3 py-2.5 text-xs text-slate-100 outline-none focus:border-sky-300/50" />
        </label>
      </div>
      {errorMessage && <p role="alert" className="border-b border-rose-300/10 px-5 py-3 text-xs text-rose-200">{errorMessage}</p>}
      {users.length === 0 ? (
        <p className="p-5 text-xs text-slate-500">Carregando contas ou nenhuma conta cadastrada.</p>
      ) : (
        <ul className="divide-y divide-white/[0.06]">
          {users.map((user) => (
            <li key={user.id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-slate-200">{user.name}</p>
                <p className="mt-1 truncate text-[11px] text-slate-500">{user.email}</p>
                {user.grant?.note && <p className="mt-1 text-[10px] text-slate-600">Nota: {user.grant.note}</p>}
              </div>
              <div className="flex items-center gap-3">
                <span className={`rounded-full border px-2.5 py-1 text-[10px] ${user.plan === "pro" ? "border-sky-300/20 text-sky-200" : "border-white/10 text-slate-400"}`}>
                  {user.plan.toUpperCase()}
                </span>
                <button
                  type="button"
                  disabled={pendingUserId === user.id}
                  onClick={() => void setPlan(user, user.plan === "pro" ? "free" : "pro")}
                  className="rounded-lg border border-white/10 px-3 py-2 text-[10px] text-slate-300 hover:bg-white/[0.05] disabled:opacity-50"
                >
                  {pendingUserId === user.id ? "Salvando..." : user.plan === "pro" ? "Revogar Pro" : "Conceder Pro"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
