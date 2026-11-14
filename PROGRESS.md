# Status do Projeto: GhostQA

## 🔄 Sprint Atual
- [x] Fase 1: Setup do Projeto (Next.js, Tailwind, Shadcn) — revisada para OpenRouter
- [ ] Fase 2: Instalação do Playwright e criação do motor isolado de Set-of-Mark (em andamento)
- [ ] Fase 3: Integração do motor Playwright com OpenRouter via SDK da OpenAI (Structured Outputs)
- [ ] Fase 4: Construção da UI (Tela Inicial e Dashboard de Relatório)
- [ ] Fase 5: Implementação dos limites Freemium vs Pro

## 🐛 Bugs Conhecidos e Workarounds
*(Agente: Anote aqui qualquer problema persistente com Playwright, timeouts ou hidratação do React para não esquecermos e não cometermos o mesmo erro duas vezes).*

## 📦 Variáveis de Ambiente Necessárias
- `OPENROUTER_API_KEY=` (configure localmente em `.env.local`; não salve chaves neste arquivo)
- `DATABASE_URL=` (se usar banco)
