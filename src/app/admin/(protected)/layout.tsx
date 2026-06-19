import { AdminShell } from "@/components/admin-shell";
import { requireAdmin } from "@/lib/auth";
export default async function Layout({children}:{children:React.ReactNode}){await requireAdmin();return <AdminShell>{children}</AdminShell>}
