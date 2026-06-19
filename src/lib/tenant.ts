import { cache } from "react";
import { db } from "./db";

export const getTenantBySlug = cache(async (slug: string) => db.client.findUnique({
  where: { slug, isActive: true },
  include: { featureFlag: true, homepageSections: { where: { isEnabled: true }, orderBy: { order: "asc" } } },
}));
export const getTenantAdmin = cache(async (id: string) => db.client.findUnique({ where: { id }, include: { featureFlag: true } }));
export function themeVars(client: {primaryColor:string;secondaryColor:string;accentColor:string;backgroundColor:string;surfaceColor:string;textColor:string;mutedTextColor:string}) {
  return {"--primary":client.primaryColor,"--secondary":client.secondaryColor,"--accent":client.accentColor,"--background":client.backgroundColor,"--surface":client.surfaceColor,"--text":client.textColor,"--muted":client.mutedTextColor} as React.CSSProperties;
}
