import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export async function requireUser() {
  // Local shortcut until the /login page exists
  if (process.env.NODE_ENV === "development") {
    return prisma.user.upsert({
      where: { authId: "test-user" },
      update: {},
      create: { authId: "test-user", email: "test@example.com" },
    });
  }

  const store = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => store.getAll(), setAll: () => {} } }
  );
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  return prisma.user.upsert({
    where: { authId: data.user.id },
    update: {},
    create: { authId: data.user.id, email: data.user.email! },
  });
}
