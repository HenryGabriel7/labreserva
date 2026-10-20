import { Shell } from "@/components/shell";
import { getContexto } from "@/lib/data";
export const dynamic = "force-dynamic";
export default async function PortalLayout({children}:{children:React.ReactNode}){const {demonstracao,usuario}=await getContexto();return <Shell demonstracao={demonstracao} nome={usuario?.nome??"Visitante"} roles={usuario?.roles??[]} >{children}</Shell>;}
