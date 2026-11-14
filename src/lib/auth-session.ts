import { headers } from "next/headers";
import { cache } from "react";
import { getAuth } from "@/lib/auth";

export const getCurrentUser = cache(async () => {
  const session = await getAuth().api.getSession({
    headers: await headers(),
  });
  return session?.user ?? null;
});

export function isAdminEmail(email: string): boolean {
  const allowedEmails = process.env.ADMIN_EMAILS?.split(",")
    .map((value) => value.trim().toLocaleLowerCase("en-US"))
    .filter(Boolean);
  return Boolean(
    allowedEmails?.includes(email.trim().toLocaleLowerCase("en-US")),
  );
}
