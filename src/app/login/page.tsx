import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth-session";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = { title: "Entrar | GhostQA" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getCurrentUser()) {
    redirect("/");
  }
  return <AuthForm />;
}
