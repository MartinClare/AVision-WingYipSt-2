"use client";

import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";

function pageWindow(current: number, count: number): (number | "gap")[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  const pages = new Set<number>([1, count, current - 1, current, current + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= count).sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (prev && p - prev > 1) out.push("gap");
    out.push(p);
    prev = p;
  }
  return out;
}

/** Numbered page navigation: Prev · 1 2 3 … N · Next */
export function Pager({
  page,
  pageCount,
  loading = false,
  onGo,
}: {
  page: number;
  pageCount: number;
  loading?: boolean;
  onGo: (page: number) => void;
}) {
  const t = useTranslations("common");
  if (pageCount <= 1) return null;

  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5 pt-3">
      <Button
        size="sm"
        variant="outline"
        disabled={page <= 1 || loading}
        onClick={() => onGo(page - 1)}
      >
        {t("previous")}
      </Button>
      {pageWindow(page, pageCount).map((entry, i) =>
        entry === "gap" ? (
          <span key={`gap-${i}`} className="px-1 text-xs text-muted-foreground">
            …
          </span>
        ) : (
          <Button
            key={entry}
            size="sm"
            variant={entry === page ? "default" : "outline"}
            disabled={loading || entry === page}
            onClick={() => onGo(entry)}
            className="min-w-8 px-2"
          >
            {entry}
          </Button>
        )
      )}
      <Button
        size="sm"
        variant="outline"
        disabled={page >= pageCount || loading}
        onClick={() => onGo(page + 1)}
      >
        {t("next")}
      </Button>
    </div>
  );
}
