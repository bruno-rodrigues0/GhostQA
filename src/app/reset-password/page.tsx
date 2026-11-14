import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/reset-password-form";

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#090d16] text-sm text-slate-400">
          Carregando...
        </main>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
