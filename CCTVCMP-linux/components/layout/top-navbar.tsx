import { Role } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { getTranslations } from "next-intl/server";
import { LocaleToggle } from "@/components/layout/locale-toggle";

export async function TopNavbar({ name, email, role }: { name: string; email: string; role: Role }) {
  const t = await getTranslations("nav");

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-card px-6">
      <div className="min-w-0">
        <p className="truncate text-sm text-muted-foreground">{t("platform")}</p>
      </div>
      <div className="flex items-center gap-3">
        <LocaleToggle />
        <div className="hidden text-right sm:block">
          <p className="text-sm font-medium">{name}</p>
          <p className="text-xs text-muted-foreground">{email} · {role.replace("_", " ")}</p>
        </div>
        <form action="/api/auth/signout" method="post">
          <Button variant="outline" size="sm" type="submit">{t("signOut")}</Button>
        </form>
      </div>
    </header>
  );
}
