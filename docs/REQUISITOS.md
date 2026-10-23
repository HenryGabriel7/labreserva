# Sistema de Reserva de Laboratórios

Construa do zero um sistema web de reserva de laboratórios para uma instituição de ensino. Execute as etapas da seção 10 em ordem; ao fim de cada uma rode `lint`, `typecheck` e testes, corrija falhas, faça commit (`git init` se preciso) e atualize `docs/PROGRESSO.md` (feito / pendente / próximo passo). Não pergunte: em dúvida, escolha a opção mais segura e registre em `docs/DECISOES.md`. O que não puder rodar no ambiente (ex.: Supabase local sem Docker) escreva mesmo assim, sem afirmar que passou, e liste em `PROGRESSO.md` com o comando para rodar.

## 1. Stack
- Next.js 16 (App Router), TypeScript strict, npm. Use `proxy.ts` (export `proxy`); `middleware.ts` está depreciado.
- Tailwind + shadcn/ui; Zod (`.strict()`) em toda entrada; React Hook Form.
- Supabase (Postgres, Auth, RLS, Storage, Edge Functions, `pg_cron` + `pg_net`) com `@supabase/ssr`, nunca `auth-helpers`. Siga https://supabase.com/docs/guides/auth/server-side/nextjs
- Testes: Vitest; pgTAP (`supabase test db`) para RLS, constraints e RPCs; Playwright (E2E).
- E-mail: Resend atrás de `NotificationProvider` (só ele implementado), templates React Email.
- UI em pt-BR; banco em UTC (`timestamptz`), exibição em `America/Sao_Paulo`.
- Identificadores em português ASCII (snake_case no banco, camelCase no TS): `n_participantes`, nunca `nº_participantes`.

## 2. Papéis
Um único papel por conta nos formulários de criação e edição, na importação CSV e nos RPCs administrativos. Prioridade do solicitante: professor/funcionário = 2, demais = 1. Ninguém decide a própria solicitação. Contas legadas não são alteradas automaticamente; ao editá-las, é obrigatório escolher somente um papel.

| Papel | Pode |
|---|---|
| aluno | ver labs e disponibilidade; solicitar (sem limite, só rate limit); ver e cancelar as próprias |
| professor | + solicitações recorrentes e justificativa de prioridade |
| funcionario | igual ao professor, inclusive prioridade (registrar em `docs/DECISOES.md`) |
| monitor | só nos labs de `monitor_laboratorios`: decidir solicitações (com motivo), substituir, check-in/out, no_show, ocorrências, agenda/histórico, bloquear horários |
| admin | tudo, em qualquer lab: CRUD, usuários e papéis, configurações, relatórios, exportação, auditoria |

## 3. Autenticação
- Sem cadastro público: `enable_signup = false` no Supabase Auth (`config.toml` e painel) e um teste provando que `signUp` direto com a chave pública falha. O admin cria contas (individual ou CSV) no servidor com `auth.admin.generateLink({ type: 'invite' })` (cria o usuário, não envia e-mail), insere `profiles` e `user_roles` e manda pela fila de e-mail (seção 6) o link `/auth/confirm?token_hash=<hashed_token>&type=invite`, confirmado no servidor com `verifyOtp`; depois o usuário define a senha. `service_role` só nesse código de servidor.
- Domínios de e-mail permitidos em `configuracoes` (vazio = sem restrição).
- Login via Server Action (rate limit + bloqueio temporário após N falhas); cookies do `@supabase/ssr` com `Secure` e `SameSite=Lax`, sem tokens em localStorage e sem forçar `httpOnly` (o cliente de browser precisa ler o refresh token); logout global (`signOut({ scope: 'global' })`); senha forte exigida no próprio Supabase Auth, não só no formulário (anotar o ajuste manual do painel em `docs/SEGURANCA.md`); recuperação de senha pelo mesmo fluxo (`generateLink({ type: 'recovery' })` + fila de e-mail); mensagens que não revelam se o e-mail existe.
- Desativar conta = `profiles.ativo = false` (bloqueia login, preserva histórico); nunca apagar.
- Servidor: `getClaims()` protege páginas e dados; `getUser()` nas ações sensíveis (admin, decidir reservas, alterar papéis) para pegar sessão revogada; nunca `getSession()`. O `proxy.ts` só renova a sessão e redireciona (otimista); não é barreira: toda Server Action/Route Handler revalida sessão e papel.

## 4. Dados
Toda tabela: `id uuid` PK, `created_at`, `updated_at`, FKs indexadas, RLS ativa. Migrações em `supabase/migrations`.
- `profiles` (id = auth.users.id, nome, email, matricula, preferencias_notificacao jsonb, ativo)
- `user_roles` (user_id, papel: aluno|professor|funcionario|monitor|admin; unique)
- `laboratorios` (nome, tipo: redes|informatica|quimica|anatomia, capacidade, localizacao, descricao, regras_de_uso, ativo, modo_reserva: slot_fixo|intervalo_livre, granularidade_minutos, duracao_minima_minutos, duracao_maxima_minutos)
- `janelas_horario` (laboratorio_id, dia_semana, inicio, fim, duracao_slot_minutos). `slot_fixo`: reserva = slots consecutivos. `intervalo_livre`: qualquer intervalo na janela, múltiplo da granularidade e entre a duração mínima e a máxima.
- `equipamentos` (laboratorio_id, nome, patrimonio, quantidade, status: ativo|manutencao|inativo, reservavel_individualmente)
- `monitor_laboratorios` (monitor_id, laboratorio_id; unique)
- `reservas` (laboratorio_id, solicitante_id, inicio, fim, `periodo` tstzrange '[)' gerado, escopo: laboratorio|equipamentos, finalidade, n_participantes, justificativa_prioridade, prioridade_efetiva (snapshot), status, decidido_por, decidido_em, motivo, recorrencia_id, conflito bool)
  - status: pendente|aprovada|recusada|cancelada|em_uso|concluida|no_show|substituida
  - escopo `laboratorio` = sala inteira (pode listar equipamentos); `equipamentos` = só itens (mín. 1)
- `reserva_equipamentos` (reserva_id, equipamento_id, quantidade)
- `recorrencias` (solicitante_id, laboratorio_id, dia_semana, hora_inicio, hora_fim, data_inicio, data_fim, excecoes date[])
- `bloqueios` (laboratorio_id nulo = global, inicio, fim, motivo: feriado|manutencao|evento, descricao)
- `checkins` (reserva_id unique, monitor_id, entrada, saida, observacoes)
- `ocorrencias` (reserva_id, laboratorio_id, monitor_id, tipo: dano|falta_material|uso_indevido, descricao, gravidade: baixa|media|grave, anexos text[] com paths do Storage)
- `notificacoes` (usuario_id, tipo_evento, template, payload jsonb, status: pendente|enviando|enviada|falhou, tentativas, proxima_tentativa_em, chave_idempotencia unique, enviada_em, erro, lida_em)
- `audit_log` (ator_id, acao, entidade, entidade_id, antes jsonb, depois jsonb, ip, user_agent), append-only
- `configuracoes` (chave PK, valor jsonb); `rate_limits` (chave, janela_inicio, contagem)

## 5. Regras (no banco)
Lógica crítica = RPCs Postgres `security definer` (`search_path` fixo) que validam papel, vínculo e transição e gravam `audit_log` nas ações sensíveis: `solicitar_reserva`, `aprovar_reserva`, `aprovar_serie`, `recusar_reserva`, `substituir_reserva`, `cancelar_reserva`, `fazer_checkin`, `fazer_checkout`, `marcar_no_show`, `marcar_notificacoes_lidas`. Sem policies de INSERT/UPDATE/DELETE em `reservas`, `reserva_equipamentos`, `recorrencias`, `checkins`, `notificacoes` e `audit_log` (senão o aluno se autoaprova mudando o `status` ou acrescenta equipamento depois de aprovada). `REVOKE EXECUTE ... FROM public, anon` nas RPCs e `GRANT` só a `authenticated`; `anon` não acessa nada.

**Anti-conflito**
- `btree_gist` + `EXCLUDE USING gist (laboratorio_id WITH =, periodo WITH &&) WHERE (escopo = 'laboratorio' AND status IN ('aprovada','em_uso'))`.
- `aprovar_reserva` roda em transação com `pg_advisory_xact_lock` por lab e verifica: (a) sala inteira não sobrepõe nenhuma reserva aprovada/em_uso do lab (nem de equipamentos), e equipamentos não sobrepõem sala inteira aprovada; (b) equipamentos: soma aprovada no intervalo ≤ `quantidade`; (c) sem bloqueio, dentro da janela e do modo do lab, lab e equipamentos ativos, não no passado, antecedência mín./máx. `solicitar_reserva` valida (c); `aprovar_reserva` revalida (a), (b) e (c), menos antecedência mín./máx.
- Erros tipados, mapeados para mensagens pt-BR (inclui SQLSTATE `23P01`). Pendentes podem coexistir no mesmo horário.
- Bloqueio sobre reservas já aprovadas: listar as afetadas e exigir cancelá-las (motivo + e-mail) para concluir.

**Prioridade**
1. Professor/funcionário (2) > aluno (1).
2. Mesmo nível: sugestão por ordem de chegada (`created_at`), com as solicitações conflitantes lado a lado e suas `justificativa_prioridade`. Decide o monitor/admin; fugir da sugestão exige motivo, registrado no `audit_log`.
3. Professor/funcionário pede horário já aprovado a um aluno: o monitor é avisado e pode `substituir_reserva` (atômico: aluno → `substituida`, nova → `aprovada`); o aluno recebe e-mail com motivo e horários livres.
4. `em_uso` nunca é substituída.

**Ciclo de vida**
- `pendente → aprovada | recusada | cancelada`; `aprovada → em_uso | cancelada | no_show | substituida`; `em_uso → concluida`. Outras transições são erro.
- Solicitante cancela até `cancelamento_prazo_horas` antes do início; depois, só monitor/admin.
- `pg_cron`: `no_show` sem check-in após `noshow_tolerancia_minutos`; pendente com início no passado → `cancelada` ("expirada"); pendente sem resposta há `pendencia_lembrete_horas` → lembrete ao monitor, e após `pendencia_alerta_admin_horas` → alerta ao admin.

**Recorrência (professor/funcionário)**
- `solicitar_reserva` com recorrência cria a série `pendente`, uma linha por data (em `America/Sao_Paulo`, sem `excecoes`, até `recorrencia_max_meses`), agrupada por `recorrencia_id` na tela do monitor. Datas em `bloqueios` (feriados) são puladas e listadas ao solicitante.
- `aprovar_serie` aprova as datas sem conflito; as conflitantes ficam `pendente` com `conflito = true` para decisão individual.

**Padrões** (`configuracoes`, editáveis pelo admin): `cancelamento_prazo_horas=2`, `antecedencia_min_horas=1`, `antecedencia_max_dias=90`, `noshow_tolerancia_minutos=15`, `pendencia_lembrete_horas=24`, `pendencia_alerta_admin_horas=48`, `recorrencia_max_meses=6`, `login_max_falhas=5`, `login_bloqueio_minutos=15`, `dominios_email_permitidos=[]`.

## 6. E-mail
- Fila em `notificacoes` (alimentada por RPCs, triggers e jobs) com `chave_idempotencia` única (`reserva_id:evento:destinatario`). Não use o SMTP padrão do Supabase (só entrega a membros do time e limita 2 e-mails/h): convite e recuperação de senha também saem por esta fila.
- Worker: Edge Function `processar-notificacoes`, chamada a cada minuto por `pg_cron` + `pg_net` (URL e chave no Vault, nunca em migração). Lote com `FOR UPDATE SKIP LOCKED`, envio via `NotificationProvider`; falha → `tentativas + 1`, backoff 1/5/15/60 min, máx. 5, grava `erro`; `enviando` parado há mais de 10 min volta à fila. `pg_cron` também enfileira lembretes 24h e 1h antes das reservas `aprovada`.
- Eventos → destinatários: solicitação criada → monitores do lab; aprovada/recusada/substituída → solicitante; cancelamento → solicitante + monitores; lembretes 24h/1h → solicitante; pendência antiga → monitor + admin; ocorrência `grave` → admin; convite e recuperação de senha → usuário.
- Lembretes podem ser desligados pelo usuário; essenciais (decisão da reserva, convite, segurança da conta) sempre enviam; os demais têm link de descadastro.
- Webhook do Resend (bounce/complaint): valide a assinatura conforme a doc deles, marque a falha e suprima novos envios ao endereço.
- Templates pt-BR: assunto claro, link direto para a reserva, logo/cores de `configuracoes` (placeholder no seed). Chave do Resend só como secret do servidor. `docs/EMAIL.md`: templates, variáveis, config do Resend e passo manual de DNS (SPF, DKIM, DMARC).

## 7. Telas (mobile-first, WCAG AA)
Visual limpo e institucional: Inter, paleta sóbria com uma cor de destaque (tokens Tailwind), estados vazio/carregando/erro em toda lista, bottom-nav no celular. Dark mode opcional, por último.
- **Comum:** login, definir/recuperar senha, perfil (preferências de notificação), central de notificações (`notificacoes` do usuário, com `lida_em`).
- **Aluno/professor/funcionário:** início (próximas reservas + status das solicitações); catálogo de labs (filtros: tipo, capacidade, equipamentos); calendário de disponibilidade (dia/semana/mês, padrão dia no celular) via RPC `security definer` que devolve só intervalos ocupados, sem dados pessoais; formulário de solicitação (lab, data/horário conforme `modo_reserva`, finalidade, participantes, equipamentos, justificativa, recorrência); minhas reservas (filtros, cancelar, histórico).
- **Monitor:** pendentes ordenadas por prioridade e chegada (séries agrupadas, conflitos lado a lado, aprovar/recusar/substituir com um toque + motivo); agenda do dia com check-in/out rápido; ocorrências com fotos; bloqueio pontual de horários.
- **Admin:** dashboard (ocupação por lab, pendências, no-shows, ocorrências); CRUD de labs, equipamentos, janelas, bloqueios; usuários (criar, importar CSV, ativar/desativar, papéis, vínculo monitor↔lab); configurações; relatórios (uso por lab/período/papel, aprovação, no-show, ocorrências) com CSV e PDF; auditoria filtrável.

## 8. Segurança
- RLS em todas as tabelas e em `storage.objects`; policies por papel e por lab (monitor) via funções `security definer` (`tem_papel()`, `monitora_lab()`, `search_path` fixo). Autorização vem de `user_roles`, nunca de `user_metadata`. O usuário comum só altera `profiles.preferencias_notificacao` (GRANT UPDATE por coluna); conta desativada (`ativo = false`) perde acesso nas policies.
- Server Actions/Route Handlers: autenticar, autorizar, validar com Zod, checar posse por ID (IDOR). Sem SQL montado por concatenação; sem `dangerouslySetInnerHTML` com dado de usuário (XSS).
- CSRF: origem nativa das Server Actions + checagem de `Origin` em Route Handlers que alteram dados.
- Headers (`next.config`/`proxy.ts`): CSP, HSTS, X-Content-Type-Options, `frame-ancestors`, Referrer-Policy, Permissions-Policy.
- Rate limit em Postgres (`rate_limits`): login, recuperação de senha, `solicitar_reserva`, endpoints públicos e webhooks. Antes do login não há usuário: essas checagens rodam no servidor com `service_role`, em função com EXECUTE só para `service_role`.
- Fotos de ocorrência: bucket privado, jpeg/png/webp ≤ 5 MB, máx. 5 por ocorrência, tipo detectado pelo conteúdo, nome gerado no servidor, URLs assinadas curtas, policies por lab.
- `audit_log` sem policies nem GRANT de UPDATE/DELETE; registra login de admin, decisões de reserva, mudança de papéis, desativações, mudanças em `configuracoes` e exportações.
- Erros genéricos para o cliente; detalhes só no log do servidor, sem senhas ou tokens.
- LGPD: coleta mínima, `/privacidade`, exportação dos dados de um usuário (JSON) e "remoção" por anonimização de `profiles` (ids permanecem no histórico e no `audit_log`); retenção em `docs/SEGURANCA.md`.
- Segredos só em variáveis de ambiente (nunca `NEXT_PUBLIC_*`); `.env.example` sem valores.

## 9. Qualidade e entrega
- Scripts: `dev`, `build`, `lint`, `typecheck`, `test`, `test:db`, `test:e2e`, `db:reset`. ESLint + Prettier + pre-commit (husky + lint-staged).
- `supabase/seed.sql`: 4 labs (um por tipo; ao menos um `slot_fixo` e um `intervalo_livre`), equipamentos, um usuário por papel (senha só de dev), reservas em vários status.
- Testes: (1) unidade: prioridade/ordenação, recorrência, slots/intervalos; (2) pgTAP: RLS (aluno lendo reserva alheia, monitor fora do seu lab, aluno alterando `status`, `anon` chamando RPC), constraint de exclusão, RPCs, `audit_log` imutável; (3) concorrência: N `aprovar_reserva` simultâneos no mesmo horário → exatamente 1 sucesso; (4) E2E: login → solicitar → monitor aprova → check-in → check-out; conflito professor × aluno com substituição; cancelamento; `signUp` público falha e convite do admin funciona.
- CI (GitHub Actions): lint, typecheck, testes de unidade e de banco, build, `npm audit`.
- Docs: `README.md` (setup, variáveis, scripts, deploy Vercel + Supabase) e `docs/ARQUITETURA.md`, `EMAIL.md`, `DECISOES.md`, `SEGURANCA.md`, `PROGRESSO.md`.
- Server Components por padrão, paginação, índices nas FKs e nas colunas de filtro/ordenação.

## 10. Etapas
1. Setup, tooling, tokens de design, layout responsivo, CI básico.
2. Banco: migrações, RLS, RPCs, seed, testes pgTAP.
3. Auth, RBAC, `proxy.ts`, contas pelo admin.
4. CRUD de labs, equipamentos, janelas, bloqueios, configurações.
5. Solicitação, calendário, anti-conflito.
6. Painel do monitor: decisões, check-in/out, ocorrências, no_show.
7. Recorrência.
8. E-mail: fila, worker, `pg_cron`, templates, webhook.
9. Relatórios, exportação, auditoria.
10. Hardening, acessibilidade, performance.
11. E2E, CI final, documentação.

## 11. Aceite
Todos os testes da seção 9 passam no CI (RLS, concorrência, E2E); fluxos usáveis em 360 px; e-mails saem nos eventos da seção 6 com retry e erro registrado; prioridade, desempate e substituição ficam no `audit_log`.
