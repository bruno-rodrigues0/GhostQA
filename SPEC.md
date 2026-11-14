# Contexto e Objetivo do Projeto
Você é um Engenheiro de Software Sênior e Product Designer especialista em aplicações SaaS B2B e agentes autônomos com visão computacional. Sua tarefa é construir o MVP funcional completo do **GhostQA**, uma plataforma SaaS de testes automatizados de usabilidade (UX) e QA comportamental usando personas sintéticas.

O produto deve ter estética de ferramenta de observabilidade e engenharia moderna (inspirado em Linear, Sentry, Vercel e PostHog) — **nunca** deve parecer um chatbot genérico ou ter "cara de IA". Toda a interface, textos, personas e relatórios devem estar em **Português (PT-BR)**.

---

# Stack Tecnológica Obrigatória
- **Framework:** Next.js 14+ (App Router) com TypeScript
- **Estilização & UI:** Tailwind CSS + Shadcn/UI + Lucide Icons
- **Automação de Browser:** Playwright (`playwright` em Node.js) rodando em modo headless no backend (API Routes / Server Actions)
- **Inteligência Artificial (Visão + Decisão):** Google Gemini API (`@google/genai` usando `gemini-2.5-flash` com `responseSchema` para Structured Outputs) — deixar preparado via `.env` (`GEMINI_API_KEY`)
- **Persistência (Rápida e Zero-Config para MVP):** SQLite com Prisma ou armazenamento estruturado local em JSON + salvamento das screenshots em `/public/runs/[sessionId]/` para carregamento instantâneo no frontend

---

# Modelo de Negócio (Freemium vs Pro)
Implemente a lógica de planos diretamente na experiência do produto (sem gateway de pagamento real, mas com bloqueios visuais elegantes, contadores de uso e modal de upgrade):

1. **Plano Free (Hobby / Validação):**
   - Limite de **5 sessões/mês** (exibir contador no header/sidebar, ex: `2/5 testes usados`).
   - Apenas **1 persona padrão** por teste.
   - Profundidade máxima de **5 passos** por navegação.
   - Apenas viewport **Desktop (`1280x800`)** (opção Mobile exibe badge `PRO` e abre modal de upgrade ao clicar).
   - Relatório visual padrão (sem exportação Markdown/PDF e com aba de Raio-X Técnico parcialmente bloqueada como preview).

2. **Plano Pro (`R$ 149/mês`):**
   - **100 sessões/mês**.
   - Até **3 personas simultâneas** na mesma missão (comparativo lado a lado).
   - Criação de **Personas Customizadas** (usuário escreve nome, idade, contexto e nível técnico).
   - Profundidade de até **12 passos** por navegação.
   - Dispositivos **Desktop (`1280x800`) e Mobile (`390x844`)**.
   - **Raio-X Técnico completo** (erros de console JS e requisições HTTP 4xx/5xx) + **Exportação do Relatório em Markdown/PDF**.

*Nota para demonstração:* Inclua um discreto switch no rodapé da sidebar (`Simular Plano: Free | Pro`) para permitir testar e demonstrar ambos os fluxos instantaneamente sem precisar alterar banco de dados.

---

# Arquitetura do Motor de Navegação (Set-of-Mark + VLM)
Crie um serviço isolado em `src/lib/ghost-engine.ts` que execute o seguinte loop autônomo:

1. **Inicialização e Listeners Técnicos:**
   - Abre uma página no Playwright com o viewport escolhido (Desktop ou Mobile).
   - Registra listeners `page.on('console')` (filtrando `type === 'error'`), `page.on('pageerror')` e `page.on('response')` (filtrando `status >= 400`) para alimentar o **Raio-X Técnico**.
   - Acessa a URL alvo e aguarda estabilização (`networkidle` com timeout de segurança de 10s).

2. **Injeção Set-of-Mark (SoM):**
   - Injeta um script no DOM que localiza todos os elementos interativos visíveis na viewport atual (`a`, `button`, `input`, `textarea`, `select`, `[role="button"]`).
   - Atribui um atributo `data-ghost-id="1..N"` a cada elemento e renderiza uma overlay visual de alto contraste (borda colorida + etiqueta numérica `[1]`, `[2]`, etc.) no canto superior esquerdo de cada elemento.
   - Tira o screenshot anotado (`step-X-annotated.png`).

3. **Tomada de Decisão Multimodal (Gemini 2.5 Flash):**
   - Envia o screenshot anotado + perfil da Persona + Objetivo da Missão + histórico resumido dos passos anteriores para o modelo.
   - Exige resposta estritamente no seguinte JSON Schema:
     ```json
     {
       "pensamento_persona": "Monólogo interno realista da persona sobre o que vê na tela",
       "nivel_frustracao": 3,
       "acao": "click | type | scroll | finish | give_up",
       "elemento_id": 4,
       "texto_digitado": "string ou null",
       "problema_ux_encontrado": "Descrição objetiva de atrito de UX/UI ou null",
       "severidade_problema": "baixa | media | alta | nenhuma"
     }
     ```

4. **Execução e Registro:**
   - Remove as tags visuais do DOM, desenha um marcador circular no centro do elemento alvo (para mostrar onde o clique aconteceu) e salva o screenshot limpo (`step-X-clean.png`).
   - Executa a ação no Playwright (`click` no `[data-ghost-id="X"]`, `fill` se `type`, `mouse.wheel` se `scroll`).
   - Salva o passo no estado da sessão para consumo em tempo real pelo frontend.
   - Repete até `acao === 'finish'`, `acao === 'give_up'` ou atingir o limite de passos do plano (`5` ou `12`).

5. **Síntese Final:**
   - Ao terminar a sessão, gera um resumo consolidado contendo: **Score de Fricção (0 a 100)**, status da missão (`Concluída` ou `Abandonada`), e uma lista priorizada de **Recomendações Práticas de Correção**.

---

# Personas Padrão (Pré-configuradas)
1. **O Apressado (Scannability & Velocidade):** Lê apenas títulos e botões, não tem paciência para textos longos ou formulários com muitos campos. Abandona facilmente se não achar o caminho em 3 interações.
2. **Baixa Familiaridade Digital:** Confunde textos sublinhados com links, tem dificuldade com termos técnicos em inglês (ex: "Pricing", "Sign up", "Dashboard"), fontes pequenas ou ícones sem rótulo.
3. **O Caçador de Bugs (Edge-Case Tester):** Testa limites da interface, tenta submeter formulários vazios, procura links quebrados, estados vazios e inconsistências visuais.

---

# Telas e Funcionalidades do Frontend

1. **Nova Missão (`/`) — Estilo "Mission Control":**
   - Formulário estruturado e limpo: Campo de URL (com botões de preenchimento rápido de exemplos reais), Campo de Objetivo da Missão (ex: *"Encontrar os preços e iniciar o cadastro"*), Seletor de Dispositivo (Desktop / Mobile), Seletor de Personas (cards selecionáveis + botão `+ Nova Persona` do Pro).
   - Histórico recente de auditorias logo abaixo, mostrando URL, Score de Fricção com badge colorido, status e data.

2. **Execução ao Vivo (`/runs/[id]` enquanto `status === 'running'`):**
   - Tela dividida: à esquerda, preview ao vivo do último screenshot capturado com indicador pulsante `"Agente navegando..."`; à direita, feed em tempo real do monólogo interno da persona, barra de frustração atual e contador de passos (`Passo 2 de 5`). Atualizar via polling rápido (1.5s) ou SSE.

3. **Relatório de Auditoria UX (`/runs/[id]` quando `status === 'completed'`):**
   - **Header do Relatório:** URL testada, dispositivo, persona(s), Score de Fricção (0-100) em destaque, status da missão e botão `Exportar Relatório (.md)` (Pro).
   - **Seletor de Persona (se houver múltiplas no Pro):** Abas para alternar entre a jornada de cada persona.
   - **Timeline Visual Interativa:** Carrossel/linha do tempo passo a passo. Ao clicar em um passo, exibe a imagem com o ponto de clique marcado, o pensamento da persona naquele segundo, o nível de frustração (1-10) e o alerta de UX detectado.
   - **Abas Inferiores:**
     - *Plano de Ação UX:* Cards priorizados por severidade (Alta/Média/Baixa) com diagnóstico e sugestão de melhoria.
     - *Raio-X Técnico:* Tabela com erros de Console JS e requisições HTTP falhas (404/500) capturadas durante a sessão.

---

# Ordem de Execução Sugerida
Construa o projeto de forma incremental e testável:
1. Configure a estrutura Next.js + Tailwind + Shadcn/UI, o tema visual ("Mission Control" dark/slate refinado) e os tipos TypeScript (`Session`, `Step`, `Persona`, `TechLog`).
2. Implemente o motor Playwright + injeção Set-of-Mark + integração estruturada com Gemini (`src/lib/ghost-engine.ts`) e a API Route `POST /api/runs` + `GET /api/runs/[id]`.
3. Construa a tela inicial (`/`) com seletor de personas, regras Freemium/Pro, modal de upgrade e histórico.
4. Construa a tela de execução ao vivo e o dashboard completo de relatório (`/runs/[id]`) com timeline visual, Raio-X técnico e exportação Markdown.

Comece agora pela **Etapa 1** e me avise quando concluir para avançarmos para a **Etapa 2**.
