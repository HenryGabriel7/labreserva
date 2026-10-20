import Link from "next/link";
import { ArrowRight, CalendarDays, FlaskConical, Network, Monitor, Microscope, Activity, ChevronLeft, ChevronRight } from "lucide-react";
import type { StatusReserva, TipoLaboratorio } from "@/lib/types";
import { corStatus, nomeStatus } from "@/lib/types";
import { formatInTimeZone } from "date-fns-tz";
import { ptBR } from "date-fns/locale";
export const iconeTipo = { redes:Network, informatica:Monitor, quimica:FlaskConical, anatomia:Activity };
export const dataBr = (data:string,formato="dd/MM/yyyy")=>formatInTimeZone(new Date(data),"America/Sao_Paulo",formato,{locale:ptBR});
export function StatusBadge({status}:{status:StatusReserva}){return <span className={`badge badge-${corStatus[status]}`}><span style={{width:4,height:4,borderRadius:"50%",background:"currentColor"}}/>{nomeStatus[status]}</span>;}
export function LabIcon({tipo,size=20}:{tipo:TipoLaboratorio;size?:number}){const Icon=iconeTipo[tipo]??Microscope;return <span className={`lab-icon lab-icon-${tipo}`}><Icon size={size} strokeWidth={1.6}/></span>;}
export function PageHeading({titulo,descricao,acao}:{titulo:string;descricao:string;acao?:React.ReactNode}) {return <div className="page-heading"><div><h1 className="page-title">{titulo}</h1><p className="page-subtitle">{descricao}</p></div>{acao&&<div className="page-actions">{acao}</div>}</div>;}
export function EmptyState({titulo="Nada por aqui, por enquanto",descricao="As informações aparecerão neste espaço quando estiverem disponíveis.",href,label}:{titulo?:string;descricao?:string;href?:string;label?:string}){return <div className="empty"><CalendarDays size={30}/><h3 style={{fontSize:14,color:"#425c6b",margin:"0 0 8px"}}>{titulo}</h3><p style={{fontSize:12,maxWidth:360,margin:"0 auto 16px",lineHeight:1.7}}>{descricao}</p>{href&&<Link className="section-link" href={href}>{label??"Explorar laboratórios"}<ArrowRight size={13}/></Link>}</div>;}
export function Pagination({pagina,total,base}:{pagina:number;total:number;base:string}){const paginas=Math.ceil(total/20);return <div className="pagination"><span>{total} registro{total!==1?"s":""} · página {pagina} de {Math.max(1,paginas)}</span><div>{pagina>1?<Link href={`${base}${base.includes("?")?"&":"?"}pagina=${pagina-1}`} className="button button-outline button-sm"><ChevronLeft size={13}/>Anterior</Link>:null}{pagina<paginas?<Link href={`${base}${base.includes("?")?"&":"?"}pagina=${pagina+1}`} className="button button-outline button-sm">Próxima<ChevronRight size={13}/></Link>:null}</div></div>;}
