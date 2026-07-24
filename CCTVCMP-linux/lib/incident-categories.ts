/** Dashboard risk category keys and incident type mapping. */

export type RiskCategoryKey = "PPE" | "Height" | "Machinery" | "Fire" | "Security";

export const INCIDENT_CATEGORY_MAP: Record<string, RiskCategoryKey> = {
  ppe_violation: "PPE",
  fall_risk: "Height",
  machinery_hazard: "Machinery",
  restricted_zone_entry: "Security",
  fire_detected: "Fire",
  smoke_detected: "Fire",
  near_miss: "Height",
  smoking: "Fire",
};

export const RISK_CATEGORY_ICONS: Record<RiskCategoryKey, string> = {
  PPE: "🪖",
  Height: "🪜",
  Machinery: "⚙️",
  Fire: "🔥",
  Security: "🔒",
};

export function isRiskCategoryKey(value: string | null | undefined): value is RiskCategoryKey {
  return (
    value === "PPE" ||
    value === "Height" ||
    value === "Machinery" ||
    value === "Fire" ||
    value === "Security"
  );
}

export function typesForCategory(category: RiskCategoryKey): string[] {
  return Object.entries(INCIDENT_CATEGORY_MAP)
    .filter(([, cat]) => cat === category)
    .map(([type]) => type);
}
