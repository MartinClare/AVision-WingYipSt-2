import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  ClipboardCheck,
  Construction,
  Eye,
  FileText,
  FolderOpen,
  HardHat,
  LayoutDashboard,
  Lock,
  MapPin,
  Radio,
  Settings,
  ShieldAlert,
  Truck,
  UserCheck,
} from "lucide-react";

export type AVisionTabKey =
  | "dashboard"
  | "edgeDevices"
  | "incidents"
  | "analytics"
  | "reports"
  | "settings";

export type ModuleId =
  | "avision"
  | "tower-crane"
  | "restricted-zone"
  | "mobile-machine"
  | "people-tracker"
  | "smart-lock"
  | "confined-space"
  | "check-in-out"
  | "document-system";

export type CmpModule =
  | {
      id: "avision";
      i18nKey: "avision";
      icon: LucideIcon;
      type: "internal";
      href: string;
    }
  | {
      id: "tower-crane";
      i18nKey: "tower-crane";
      icon: LucideIcon;
      type: "internal";
      href: "/tower-crane";
    }
  | {
      id: Exclude<ModuleId, "avision" | "tower-crane">;
      i18nKey: Exclude<ModuleId, "avision" | "tower-crane">;
      icon: LucideIcon;
      type: "external";
      /** When set, the module page embeds this URL in an iframe. */
      externalUrl?: string;
    };

export const AVISION_TABS: {
  href: string;
  i18nKey: AVisionTabKey;
  icon: LucideIcon;
}[] = [
  { href: "/dashboard", i18nKey: "dashboard", icon: LayoutDashboard },
  { href: "/edge-devices", i18nKey: "edgeDevices", icon: Radio },
  { href: "/incidents", i18nKey: "incidents", icon: ShieldAlert },
  { href: "/analytics", i18nKey: "analytics", icon: BarChart3 },
  { href: "/reports", i18nKey: "reports", icon: FileText },
  { href: "/settings", i18nKey: "settings", icon: Settings },
];

export const AVISION_PATH_PREFIXES = AVISION_TABS.map((tab) => tab.href);

export const CMP_MODULES: CmpModule[] = [
  {
    id: "avision",
    i18nKey: "avision",
    icon: Eye,
    type: "internal",
    href: "/dashboard",
  },
  {
    id: "tower-crane",
    i18nKey: "tower-crane",
    icon: Construction,
    type: "internal",
    href: "/tower-crane",
  },
  {
    id: "restricted-zone",
    i18nKey: "restricted-zone",
    icon: MapPin,
    type: "external",
  },
  {
    id: "mobile-machine",
    i18nKey: "mobile-machine",
    icon: Truck,
    type: "external",
  },
  {
    id: "people-tracker",
    i18nKey: "people-tracker",
    icon: UserCheck,
    type: "external",
  },
  {
    id: "smart-lock",
    i18nKey: "smart-lock",
    icon: Lock,
    type: "external",
  },
  {
    id: "confined-space",
    i18nKey: "confined-space",
    icon: HardHat,
    type: "external",
  },
  {
    id: "check-in-out",
    i18nKey: "check-in-out",
    icon: ClipboardCheck,
    type: "external",
  },
  {
    id: "document-system",
    i18nKey: "document-system",
    icon: FolderOpen,
    type: "external",
  },
];

export function getModuleById(id: string): CmpModule | undefined {
  return CMP_MODULES.find((module) => module.id === id);
}

export function isAVisionPath(pathname: string): boolean {
  return AVISION_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function moduleHref(module: CmpModule): string {
  if (module.type === "internal") return module.href;
  return `/modules/${module.id}`;
}

export function isModuleActive(module: CmpModule, pathname: string): boolean {
  if (module.type === "internal") {
    if (module.id === "avision") return isAVisionPath(pathname);
    return pathname === module.href || pathname.startsWith(`${module.href}/`);
  }
  return pathname === `/modules/${module.id}` || pathname.startsWith(`/modules/${module.id}/`);
}
