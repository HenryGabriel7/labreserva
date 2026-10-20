import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "./globals.css";
export const metadata: Metadata = { title: { default: "LabReserva · Gestão de laboratórios", template: "%s · LabReserva" }, description: "Reserva e gestão dos laboratórios da sua instituição de ensino." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="pt-BR"><body><a href="#conteudo" className="skip-link">Pular para o conteúdo</a>{children}</body></html>; }
