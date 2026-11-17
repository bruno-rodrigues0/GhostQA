# Status do Projeto: Bunter

## 🔄 Sprint Atual
- [x] Fase 1: Setup do Projeto (Next.js, Tailwind, Shadcn) — revisada para OpenRouter
- [x] Fase 2: Instalação do Playwright e criação do motor isolado de Set-of-Mark (validado em Chromium headless)
- [x] Fase 3: Integração do motor Playwright com OpenRouter via SDK da OpenAI (JSON mode validado)
- [x] Fase 4: Construção da UI (Tela Inicial, execução ao vivo e Dashboard de Relatório)
- [x] Fase 5: Limites Freemium vs Pro, cotas mensais e exportação Markdown/PDF
- [x] Reexecução de auditorias concluídas ou com falha sem criar nova sessão
- [x] Autenticação Better Auth, isolamento de auditorias por usuário e concessão manual de plano Pro
- [x] Migração PostgreSQL e armazenamento privado de screenshots implementados
- [x] Docker Compose com PostgreSQL, Chromium Playwright, persistência e migrations automáticas

## ⚙️ Configuração necessária para ativar autenticação
- [ ] Configurar allowlist administrativa e SMTP de produção no arquivo `.env` (SMTP local de desenvolvimento usa Mailpit)
- [ ] Criar e verificar a conta admin; simular e aplicar a migração de sessões legadas com `docker compose exec app npm run migrate:legacy-runs`

## 🐛 Bugs Conhecidos e Workarounds
*(Agente: Anote aqui qualquer problema persistente com Playwright, timeouts ou hidratação do React para não esquecermos e não cometermos o mesmo erro duas vezes).*

## 📦 Variáveis de Ambiente Necessárias
- `OPENROUTER_API_KEY=` (configure em `.env`; nunca salve chaves no repositório)
- `OPENROUTER_MODEL=nvidia/nemotron-3.5-super-vl:free` (modelo NVIDIA multimodal; OpenRouter seleciona o endpoint)
- `DATABASE_URL=` (gerada para PostgreSQL do Docker)
- `BETTER_AUTH_SECRET=` (gerado no `.env` local)
- `ADMIN_EMAILS=` e `SMTP_*` (configuração manual)
