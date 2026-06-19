import { notFound } from "next/navigation";
import { SiteShell } from "@/components/site-shell";
import { getTenantBySlug, themeVars } from "@/lib/tenant";
export default async function Layout({children,params}:{children:React.ReactNode;params:Promise<{clientSlug:string}>}){const tenant=await getTenantBySlug((await params).clientSlug);if(!tenant)notFound();return <div style={themeVars(tenant)}><SiteShell brand={tenant}>{children}</SiteShell></div>}
