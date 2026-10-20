# Decisões

- 2026-10-20: usar Next.js 16 real, App Router, npm, TypeScript strict e proxy.ts, conforme solicitado. O runtime Sites usa Vinext/Workers; não trocar a stack nem publicar uma versão estática que perderia as Server Actions. Entrega local preparada para Vercel + Supabase.
- Funcionário tem os mesmos privilégios de professor e prioridade 2. Admin/monitor não elevam a prioridade do solicitante.
- Ausência de credenciais deve falhar de forma segura; modo de demonstração exclusivamente de leitura e identificado, sem simular autenticação ou persistência.
- Configurações mantêm chave única além de UUID, conciliando a identidade universal de tabelas com a busca por chave.
- O ambiente Windows bloqueia npm.ps1; usar npm.cmd, sem alterar a política de execução.
- Auditoria de dependências: atualizar jsPDF para 4.2.1+ e Vitest para 5.0.5+. O plugin ESLint do Next 16 depende de fast-glob/braces sem correção publicada no momento; override restrito desse plugin para tinyglobby, que oferece a única API usada (globSync com onlyDirectories). Teste específico verifica resolução rootDir. `npm audit --audit-level=high` passou com zero alertas após essas mudanças.
- Fonte Inter variável hospedada no próprio aplicativo, sem consulta ao Google Fonts em build ou navegação.
- A preparação de módulos independentes foi paralelizada; integração, verificações e commits permanecem ordenados por etapa. O script de checkpoint seleciona os arquivos das etapas 2/3 para não incluir antecipadamente a interface preparada para a etapa 4.
- Recorrência respeita o limite de meses e também a antecedência máxima por ocorrência, valendo o mais restritivo. Configurações padrão permitem 90 dias dentro do limite máximo de 6 meses.
- Tentativas inválidas fazem rollback da transação RPC: o rate limit do endpoint de solicitação é consumido em uma requisição de serviço separada antes da RPC autenticada; há defesa adicional dentro da RPC.
- Validação auxiliar com PostgreSQL WASM é reproduzível; adapters Supabase externos são declarados. `supabase test db` continua obrigatório no CI com serviços reais.
