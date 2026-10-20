"use client";
import { AlertCircle } from "lucide-react";
export default function ErrorPage({reset}:{reset:()=>void}){return <div className="panel empty" role="alert"><AlertCircle size={30}/><h1 className="page-title">Não foi possível carregar</h1><p className="page-subtitle">A conexão com os serviços não está disponível no momento.</p><button onClick={reset} className="button button-primary" style={{marginTop:20}}>Tentar novamente</button></div>;}
