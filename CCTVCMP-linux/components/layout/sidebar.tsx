"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { CMP_MODULES, isModuleActive, moduleHref } from "@/lib/modules";

export function Sidebar() {
  const pathname = usePathname();
  const tNav = useTranslations("nav");
  const tModules = useTranslations("modules");

  return (
    <aside className="hidden w-64 shrink-0 border-r border-border bg-card lg:flex lg:flex-col">
      <div className="border-b border-border p-6">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {tNav("platform")}
        </p>
        <div className="mt-1 text-xl font-semibold">{tNav("title")}</div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        <p className="mb-2 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {tModules("navLabel")}
        </p>
        {CMP_MODULES.map((module) => {
          const Icon = module.icon;
          const active = isModuleActive(module, pathname);
          return (
            <Link
              key={module.id}
              href={moduleHref(module)}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{tModules(module.i18nKey)}</span>
              {module.type === "external" && !module.externalUrl ? (
                <span
                  className={cn(
                    "ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                    active
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                  )}
                >
                  VIP
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
