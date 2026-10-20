import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getContexto } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { PageHeading } from "@/components/shared";
import { ConfiguracoesForm } from "@/components/configuracoes-form";
import "../laboratorios/laboratorios.css";
export default async function Configuracoes(){const ctx=await getContexto();if(!ctx.demonstracao)await requireUser(["admin"]);let configuracoes:{chave:string;valor:unknown}[]=Object.entries({cancelamento_prazo_horas:2,antecedencia_min_horas:1,antecedencia_max_dias:90,noshow_tolerancia_minutos:15,pendencia_lembrete_horas:24,pendencia_alerta_admin_horas:48,recorrencia_max_meses:6,login_max_falhas:5,login_bloqueio_minutos:15,dominios_email_permitidos:[]}).map(([chave,valor])=>({chave,valor}));if(!ctx.demonstracao){const db=await createClient();const {data,error}=await db.from("configuracoes").select("chave,valor").order("chave");if(error)throw new Error("Falha ao carregar configurações");configuracoes=data;}
return <><PageHeading titulo="Cada instituição, seu jeito de organizar" descricao="Ajuste as regras de acesso e de reserva com clareza." acao={<Link href="/laboratorios/gerenciar" className="button button-outline">Gerenciar cadastros</Link>}/>{ctx.demonstracao&&<p className="notice" style={{marginBottom:20}}>Configurações ilustrativas. Alterações exigem uma conta de administrador e conexão com o banco.</p>}<ConfiguracoesForm configuracoes={configuracoes} demonstracao={ctx.demonstracao}/></>;}
