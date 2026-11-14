import { MissionControl } from "@/components/mission-control";
import { getCurrentUser, isAdminEmail } from "@/lib/auth-session";
import { getUserMonthlyUsage } from "@/lib/plan-limits";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  const account = await getUserMonthlyUsage(user.id);
  return (
    <MissionControl
      user={{ name: user.name, email: user.email }}
      account={account}
      isAdmin={isAdminEmail(user.email)}
    />
  );
}
