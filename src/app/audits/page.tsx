import type { Metadata } from "next";
import { AuditHistory } from "@/components/audit-history";
import { getCurrentUser } from "@/lib/auth-session";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Auditorias | GhostQA",
};
export const dynamic = "force-dynamic";

export default async function AuditsPage() {
  if (!(await getCurrentUser())) {
    redirect("/login");
  }
  return <AuditHistory />;
}
