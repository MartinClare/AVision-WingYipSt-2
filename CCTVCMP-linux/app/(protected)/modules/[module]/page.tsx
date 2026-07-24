import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getModuleById } from "@/lib/modules";
import { ModuleLockedDemo } from "@/components/modules/module-locked-demo";

type Props = {
  params: { module: string };
};

export default async function ModulePage({ params }: Props) {
  const module = getModuleById(params.module);

  if (!module || module.type !== "external") {
    notFound();
  }

  const t = await getTranslations("modules");

  if (module.externalUrl) {
    return (
      <div className="flex h-[calc(100vh-8rem)] flex-col gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t(module.i18nKey)}</h1>
          <p className="text-sm text-muted-foreground">{t("externalHint")}</p>
        </div>
        <iframe
          title={t(module.i18nKey)}
          src={module.externalUrl}
          className="min-h-0 flex-1 w-full rounded-xl border border-border bg-card"
          allow="fullscreen"
        />
      </div>
    );
  }

  // Pass only serializable id — icon components cannot cross the RSC boundary
  return <ModuleLockedDemo moduleId={module.id} />;
}
