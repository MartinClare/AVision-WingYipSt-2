"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { AVISION_TABS, isAVisionPath } from "@/lib/modules";

export function AVisionTabs() {
  const pathname = usePathname();
  const t = useTranslations("nav");

  if (!isAVisionPath(pathname)) return null;

  return (
    <div className="border-b border-border bg-card px-6">
      <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label={t("title")}>
        {AVISION_TABS.map((tab) => {
          const Icon = tab.icon;
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors",
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{t(tab.i18nKey)}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
