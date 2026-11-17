import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminUsers } from "@/components/admin-users";
import { getCurrentUser, isAdminEmail } from "@/lib/auth-session";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (!isAdminEmail(user.email)) {
    redirect("/");
  }
  return (
    <main className="min-h-screen bg-[#090d16] px-5 py-10 text-slate-100 sm:px-8">
      <div className="mx-auto max-w-4xl">
        <Link href="/" className="text-xs text-sky-200 hover:text-sky-100">← Voltar ao Bunter</Link>
        <p className="mt-8 text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-200">Administração</p>
        <h1 className="mt-2 text-3xl font-semibold">Acesso e planos</h1>
        <p className="mt-2 text-sm text-slate-500">Gerencie manualmente quais contas têm acesso ao plano Pro.</p>
        <AdminUsers />
      </div>
    </main>
  );
}
