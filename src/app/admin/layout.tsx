import type { Metadata } from "next";
import { PortalShell } from "@/components/portal-shell";

export const metadata: Metadata = { title: "Administração" };

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PortalShell administrativo>{children}</PortalShell>;
}
