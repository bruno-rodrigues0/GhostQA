import { RunReport } from "@/components/run-report";
import { getCurrentUser } from "@/lib/auth-session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

interface RunPageProps {
  params: Promise<{ id: string }>;
}

export default async function RunPage({ params }: RunPageProps) {
  if (!(await getCurrentUser())) {
    redirect("/login");
  }
  const { id } = await params;
  return <RunReport sessionId={id} />;
}
