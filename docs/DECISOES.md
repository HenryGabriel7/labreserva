# Decisões

- 2026-10-20: usar Next.js 16 real, App Router, npm, TypeScript strict e proxy.ts, conforme solicitado. O runtime Sites usa Vinext/Workers; não trocar a stack nem publicar uma versão estática que perderia as Server Actions. Entrega local preparada para Vercel + Supabase.
- Funcionário tem os mesmos privilégios de professor e prioridade 2. Admin/monitor não elevam a prioridade do solicitante.
- Ausência de credenciais deve falhar de forma segura; modo de demonstração exclusivamente de leitura e identificado, sem simular autenticação ou persistência.
- Configurações mantêm chave única além de UUID, conciliando a identidade universal de tabelas com a busca por chave.
- O ambiente Windows bloqueia npm.ps1; usar npm.cmd, sem alterar a política de execução.
