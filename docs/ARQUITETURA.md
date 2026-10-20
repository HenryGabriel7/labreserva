# Arquitetura

Next.js 16 App Router com Server Components por padrão. Componentes cliente ficam nas interações: filtros, calendário, formulários React Hook Form e ações rápidas. PostgreSQL é a autoridade para autorização, estados, concorrência, disponibilidade e auditoria.

## Fronteiras

1. `proxy.ts`: renovação de cookies e redirecionamento otimista, nunca autorização definitiva.
2. Server Components: `getClaims()`, perfil ativo e papéis em `user_roles`. Consultas autenticadas respeitam RLS.
3. Actions/handlers sensíveis: `getUser()`, autorização por papel/posse, Zod strict e RPC. Route Handlers de mutação conferem Origin.
4. RPCs SECURITY DEFINER: search_path fixo, papel, vínculo de monitor, transição e bloqueio consultivo transacional por laboratório.
5. Outbox: alterações de reserva enfileiram e-mails dentro da mesma transação; worker usa claim com SKIP LOCKED e idempotência do provedor.

O identificador de papel nunca vem de user_metadata. A chave service role é confinada aos módulos server-only e à Edge Function; operações do usuário usam seu JWT e RLS. URL e chave publicável não são segredos, mas são configuradas no servidor; a factory browser recebe somente essa configuração explicitamente.

## Integridade temporal

UTC em timestamptz e intervalos semiabertos `[inicio,fim)`. Horários civis e recorrências são interpretados em America/Sao_Paulo. Restrição de exclusão GiST impede aprovação simultânea da sala. Lock por lab serializa decisões e alterações do cadastro; estoque considera pico de uso em cada ponto de mudança, inclusive término e início coincidentes. Pendentes coexistem. Aprovação sempre revalida condições atuais.

## Dados e acesso

Tabelas de fluxo não oferecem INSERT/UPDATE/DELETE aos clientes. Perfil permite somente UPDATE da coluna preferencias_notificacao ao próprio usuário ativo. Disponibilidade expõe intervalos e quantidades, sem solicitante/finalidade. Auditoria append-only. FKs e filtros possuem índices. Listas são paginadas; relatórios têm limites explícitos.

## Desenvolvimento sem serviços

Sem variáveis Supabase o aplicativo mostra dados ilustrativos em modo de leitura identificado. Nenhuma conta é simulada, nenhuma mutação é aceita. Uma integração indisponível com configuração presente produz erro; não é substituída por dados de demonstração. Não se usa localStorage para tokens ou reservas.
