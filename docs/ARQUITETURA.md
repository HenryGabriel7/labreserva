# Arquitetura

Next.js 16 App Router com Server Components por padrão. Componentes cliente ficam nas interações: filtros, calendário, formulários React Hook Form e ações rápidas. PostgreSQL é a autoridade para autorização, estados, concorrência, disponibilidade e auditoria.

## Fronteiras

1. `proxy.ts`: renovação de cookies e redirecionamento otimista, nunca autorização definitiva.
2. Server Components: `getClaims()`, perfil ativo e papéis em `user_roles`. Consultas autenticadas respeitam RLS.
3. Actions/handlers sensíveis: `getUser()`, autorização por papel/posse, Zod strict e RPC. Route Handlers de mutação conferem Origin.
4. RPCs SECURITY DEFINER: search_path fixo, papel, vínculo de monitor, transição e bloqueio consultivo transacional por laboratório.
5. Outbox: alterações de reserva enfileiram e-mails dentro da mesma transação; worker usa claim com SKIP LOCKED e idempotência do provedor.

O identificador de papel nunca vem de user_metadata. A chave service role é confinada aos módulos server-only, à CLI operacional e à Edge Function; operações do usuário usam seu JWT e RLS. URL e chave publicável não são segredos, mas são configuradas no servidor; a factory browser recebe somente essa configuração explicitamente. A memoização React das consultas é do ciclo de renderização, sem cache compartilhado de dados pessoais entre usuários.

RLS e RPCs também verificam `auth.jwt().session_id` em `auth.sessions`, para o mesmo `auth.uid()` e respeitando `not_after`. Assim, chamar PostgREST diretamente não permite reutilizar uma sessão removida. O helper é privado e não concede leitura da tabela Auth ao cliente.

## Integridade temporal

UTC em timestamptz e intervalos semiabertos `[inicio,fim)`. Horários civis e recorrências são interpretados em America/Sao_Paulo. Restrição de exclusão GiST impede aprovação simultânea da sala. Lock por lab serializa decisões e alterações do cadastro; estoque considera pico de uso em cada ponto de mudança, inclusive término e início coincidentes. Pendentes coexistem. Aprovação sempre revalida condições atuais.

## Dados e acesso

Tabelas de fluxo não oferecem INSERT/UPDATE/DELETE aos clientes. Perfil permite somente UPDATE da coluna preferencias_notificacao ao próprio usuário ativo. Disponibilidade expõe intervalos e quantidades, sem solicitante/finalidade. Auditoria append-only, com contexto de IP/user-agent sanitizado quando disponível. FKs e filtros possuem índices. Listas de reservas, monitor, ocorrências e auditoria têm paginação; catálogo e coleções auxiliares possuem limites explícitos. Indicadores do painel são calculados por RPC sobre o escopo completo autorizado, sem depender da primeira página.

## Contas e mensagens privadas

O primeiro administrador usa uma operação excepcional service-only, `inicializar_administrador`, fechada assim que qualquer papel admin existir. A CLI gera a identidade por `generateLink`; perfil, papel, auditoria e convite na fila são criados atomicamente. Contas seguintes passam pelo administrador autenticado e `provisionar_usuario`. As falhas não apagam contas ou histórico.

Convite e recuperação são confirmados no servidor por `verifyOtp`. A RLS da fila oculta eventos/templates de autenticação inteiros, incluindo payload, chave idempotente e snapshot: `token_hash` é uma credencial bearer e não pode chegar à central no navegador. O worker tem leases, backoff e supressão; essenciais ignoram opt-out, mas não conta inativa ou supressões. Um envelope imutável preserva o conteúdo dos retries. `enviada` significa aceite pelo provedor, sem afirmar entrega. Ver `EMAIL.md`.

## Renderização e verificação

O layout é dinâmico para que a CSP aplique um nonce novo aos scripts a cada resposta. Dados autenticados usam `private, no-store`; scripts de produção não permitem inline genérico ou eval. A Inter é servida localmente.

Vitest cobre regras auxiliares e fronteiras isoladas. O verificador PGlite executa SQL/RLS/RPC com adaptadores declarados para serviços Supabase e TAP. pgTAP nativo, Auth/PostgREST, concorrência HTTP e E2E autenticados exigem Supabase local/Docker. Playwright testa a demonstração em Chromium e 360 px independentemente desses serviços. Os resultados observados estão em `TESTES.md` e `PROGRESSO.md`.

## Desenvolvimento sem serviços

Sem variáveis Supabase o aplicativo mostra dados ilustrativos em modo de leitura identificado. Nenhuma conta é simulada, nenhuma mutação é aceita. Uma integração indisponível com configuração presente produz erro; não é substituída por dados de demonstração. Não se usa localStorage para tokens ou reservas.
