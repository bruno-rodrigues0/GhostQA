# Bunter — visão de negócio e engenharia

## 1. Resumo executivo

Bunter é uma plataforma de auditoria exploratória de experiência do usuário.
Uma equipe descreve uma jornada e o público a simular; o sistema navega por um
site em Chromium, captura evidências visuais, observa erros técnicos e transforma
os passos em um relatório de atritos e recomendações priorizadas.

O produto combina personas configuráveis, automação de navegador e interpretação
multimodal de screenshots. Ele acelera a descoberta de problemas em ciclos
iniciais de produto, mas complementa — não substitui — pesquisa com usuários
reais, testes de usabilidade moderados ou validação de hipóteses de negócio.

## 2. Valor de negócio e modelo de planos

### Proposta de valor

- **Aprendizado mais rápido:** testar uma tarefa concreta sem preparar uma sessão
  moderada para cada iteração.
- **Evidência reproduzível:** cada decisão pode ser revisada junto da screenshot,
  da persona e do passo correspondente.
- **Priorização acionável:** problemas são classificados por severidade e
  convertidos em recomendações para revisão da jornada.
- **Visões comportamental e técnica:** o produto separa atrito percebido de
  evidências de console, erros da página, respostas HTTP e falhas da automação.

Resultados da IA devem ser tratados como hipóteses de auditoria. As equipes
devem revisar as evidências antes de priorizar ou atribuir causa a um problema.

### Freemium implementado

Os limites são aplicados no servidor; o cliente não pode escolher seu próprio
plano nem ampliar permissões apenas alterando a requisição.

| Capacidade | Free | Pro |
|---|---:|---:|
| Auditorias iniciadas por mês | 5 | 100 |
| Personas por missão | 1 | 3 |
| Profundidade máxima | 12 passos por persona | 30 passos por persona |
| Dispositivo | Desktop | Desktop e Mobile |
| Personas | Catálogo padrão | Catálogo e personas personalizadas |
| Raio-X técnico | Logs ocultos na resposta da API | Logs completos |
| Exportação | Relatório na aplicação | Markdown e impressão/PDF pelo navegador |

O contador mensal usa o mês do calendário UTC e conta auditorias criadas no
período. Repetir uma auditoria concluída ou com falha reutiliza a sessão e não
cria outra unidade de cota.

### Como o desenho favorece recorrência de uso

O limite mensal cria uma cadência natural para equipes que revisam o produto a
cada release: testar uma mudança, comparar o resultado, corrigir um atrito e
repetir a avaliação no ciclo seguinte. O histórico de missões e screenshots
permite voltar às evidências, enquanto o volume maior do Pro atende a equipes
com mais jornadas e iterações. Mobile, mais personas, jornadas mais longas e
diagnóstico técnico completo também criam motivos concretos para ampliar o uso.

**Importante: recorrência de uso não significa cobrança recorrente já
implementada.** O código atual não contém checkout, gateway de pagamento,
renovação automática, faturamento, cancelamento ou gestão de assinaturas. A
interface apresenta “R$ 149/mês” como preço do Pro, mas o acesso Pro é concedido
ou revogado manualmente por um administrador, com registro do responsável e uma
nota opcional. Portanto, o mecanismo de monetização está desenhado na oferta e
nos limites, mas a receita recorrente ainda depende de um fluxo comercial/manual
ou da futura integração de billing.

## 3. Arquitetura

### Visão de componentes

```mermaid
flowchart LR
    U[Usuário] --> UI[Next.js App Router<br/>Mission Control e relatórios]
    UI --> API[Rotas HTTP /api]
    API --> AUTH[Better Auth<br/>sessão e verificação de e-mail]
    AUTH --> DB[(PostgreSQL / Prisma)]
    API --> PL[Planos e cotas<br/>validação no servidor]
    PL --> DB
    API --> QUEUE[Next after()<br/>agendamento em processo]
    QUEUE --> RUN[Executor de auditoria]
    RUN --> PW[Playwright + Chromium]
    PW --> WEB[Site autorizado sob teste]
    RUN --> SOM[Set-of-Mark<br/>captura e indexação]
    SOM --> AI[OpenRouter<br/>modelo multimodal]
    AI --> RUN
    RUN --> DB
    RUN --> FS[(data/private-runs<br/>screenshots privadas)]
    UI --> API
    API --> FS
    SMTP[SMTP ou Mailpit] --> AUTH
```

### Tecnologias e responsabilidades

- **Next.js App Router, React e TypeScript:** interface, páginas protegidas,
  rotas HTTP e execução no runtime Node.js.
- **Better Auth:** cadastro, sessão, login com senha, verificação de e-mail e
  recuperação de senha.
- **Prisma e PostgreSQL:** contas, sessões de autenticação, concessões de plano
  e auditorias. O payload da auditoria é armazenado como JSONB.
- **Playwright e Chromium:** navegação headless, interação, eventos técnicos e
  screenshots.
- **OpenAI SDK apontado ao OpenRouter:** chamadas multimodais ao modelo
  selecionado por `OPENROUTER_MODEL`.
- **Nodemailer:** envio das mensagens de autenticação por SMTP. No Compose local,
  Mailpit recebe as mensagens sem enviá-las à Internet.
- **Docker Compose:** aplicação, PostgreSQL, Chromium instalado na imagem e
  Mailpit para desenvolvimento.

### Organização do código

| Caminho | Responsabilidade |
|---|---|
| `src/app/` | Páginas, layouts e endpoints |
| `src/components/` | Mission Control, autenticação, histórico e relatório |
| `src/lib/ghost-engine.ts` | Orquestração do navegador, passos e capturas |
| `src/lib/set-of-mark.ts` | Descoberta e marcação visual dos elementos |
| `src/lib/ghost-decision.ts` | Prompt, chamada multimodal e validação da decisão |
| `src/lib/openrouter.ts` | Cliente OpenAI compatível com OpenRouter |
| `src/lib/plan-constants.ts` e `plan-limits.ts` | Limites e autorização de plano |
| `src/lib/run-store.ts` | Persistência e isolamento das auditorias |
| `src/lib/report.ts` | Status, priorização e relatório Markdown |
| `prisma/` | Modelo de dados e migrations |
| `tests/` | Testes unitários, de API, componentes e integração Playwright |

## 4. Fluxo de uma auditoria

1. O usuário autenticado informa URL HTTP(S), objetivo, viewport e personas.
2. A rota `POST /api/runs` consulta o plano da conta no banco, valida a entrada
   e aplica os limites daquele plano. Não aceita o plano informado pelo cliente
   como fonte de autorização.
3. Uma transação serializa a criação por usuário, verifica o grant Pro vigente,
   conta o uso do mês e grava a auditoria no PostgreSQL.
4. A rota responde `202 Accepted` e agenda a execução com `next/server` `after()`.
   O executor atual roda em processo, sem uma fila externa durável.
5. O motor abre Chromium headless, navega ao alvo, coleta eventos técnicos e
   executa os passos sequencialmente para cada persona selecionada.
6. Antes de cada decisão, o Bunter constrói uma captura anotada e solicita ao
   modelo uma próxima ação estruturada.
7. O motor valida a ação contra os elementos disponíveis, verifica novamente
   o alvo e executa a interação. Passos, status e logs são persistidos durante a
   execução.
8. A UI consulta `GET /api/runs/[id]` para atualizar a jornada e apresenta
   relatório, screenshots e recomendações. O histórico está em `/audits`.
9. A repetição usa `POST /api/runs/[id]/retry`, reinicia os dados da sessão
   existente e não cria uma nova auditoria mensal.

### Persistência

- **PostgreSQL:** entidades de autenticação, concessões Pro e registro de cada
  auditoria, incluindo o conteúdo JSONB da sessão e dos passos.
- **Disco privado:** screenshots de cada passo em
  `data/private-runs/[sessionId]/[personaId]/`.
- **Rota de screenshots:** exige autenticação, confirma que a auditoria pertence
  ao usuário e valida persona/caminho antes de ler o arquivo. As respostas são
  privadas e sem cache.
- **Diretórios locais e volume Docker:** `data/` e `public/runs/` são montados
  para persistência em execução local via Compose. `public/runs/` atende dados
  legados; as screenshots atuais ficam em `data/private-runs/`.

## 5. Set-of-Mark: grounding visual para interação

O motor não pede ao modelo para adivinhar coordenadas livres na screenshot. O
Set-of-Mark transforma os elementos interativos visíveis em alvos enumerados e
conecta a interpretação visual da IA a pontos de interação calculados pelo
navegador.

### 5.1 Descoberta e elegibilidade

`injectSetOfMark()` percorre elementos interativos — links, botões, campos,
controles ARIA, elementos com `tabindex` e outros alvos compatíveis — em cada
documento. Um elemento só entra no conjunto candidato se estiver habilitado,
visível e dentro do viewport. A coleta considera estilos e ancestrais, inclusive
raízes Shadow DOM abertas e fechadas rastreadas antes da navegação.

Para não marcar controles que parecem clicáveis mas estão encobertos, o motor
calcula possíveis pontos dentro do retângulo do elemento e usa `elementFromPoint`
para confirmar que o alvo realmente recebe o hit-test. O ponto escolhido,
retângulo, rótulo acessível/textual e tag são guardados junto do identificador.
Iframes também são percorridos, com IDs sequenciais para distinguir elementos
entre frames.

### 5.2 Anotação que alinha visão e ação

Cada alvo recebe um ID estável para aquela captura e uma marca visual vermelha
com o mesmo número. O motor salva a screenshot anotada e envia ao modelo a
imagem junto de uma lista serializada dos elementos reais: ID, tipo, rótulo,
limites e ponto de clique. Assim, “o botão de continuar” passa a ser uma escolha
entre candidatos concretos daquela tela, não uma coordenada inventada.

Depois da decisão, uma nova captura limpa preserva a evidência apresentada no
relatório sem as marcações de análise; a captura anotada permanece disponível
para inspeção. O caminho da screenshot usa a rota autenticada de auditoria.

### 5.3 Engenharia de prompt e contrato de decisão

O prompt de sistema combina instruções de papel e comportamento da persona,
objetivo, contexto de acessibilidade/nível técnico, histórico resumido da
jornada e o inventário de alvos da captura atual. Ele também limita o espaço de
ação, orienta quando concluir ou desistir, exige evidência antes de atribuir
defeito ao site e proíbe inventar ou reutilizar IDs. Timeouts de automação não
devem ser reportados como defeitos observados.

A resposta define um contrato explícito com pensamento da persona, frustração,
ação, `elemento_id`, texto digitado, problema de UX e severidade. O cliente
OpenAI envia a screenshot como imagem ao endpoint compatível do OpenRouter e
solicita JSON mode:

```ts
response_format: { type: "json_object" }
```

Há validação de runtime após a resposta: JSON válido, chaves esperadas, tipos,
faixa de frustração, enumerações de ação/severidade e combinação coerente entre
ação e alvo. Se a resposta falhar no contrato, uma segunda chamada instrui o
modelo a reavaliar e corrigir a saída. O motor também confere se o ID retornado
está na lista da tela; se a decisão ainda apontar para um alvo inexistente,
solicita nova decisão e, após outra falha, encerra a persona sem transformar
isso em bug do site.

**Precisão sobre o recurso do provedor:** a implementação usa JSON mode
(`json_object`) mais validação determinística no servidor. Ela **não** envia um
JSON Schema estrito via `response_format: { type: "json_schema", ... }`. Portanto,
o contrato é aplicado por prompt e pelo parser/validador do Bunter, em vez de
ser imposto como esquema estrito pela API do modelo.

### 5.4 Verificação do alvo no momento do clique

Entre a captura e a ação, a página pode mudar. Antes de interagir, o motor
localiza novamente o elemento marcado e confirma que ele continua conectado ao
DOM e que o ponto calculado ainda atinge o próprio elemento. Só então o
Playwright clica naquele ponto. Isso reduz cliques deslocados e evita selecionar
elementos que desapareceram ou foram cobertos depois da decisão.

Se a automação não confirmar uma interação, o passo não atribui um problema de
UX sem evidência; após falhas consecutivas, a persona é encerrada. CAPTCHAs e
verificações humanas são detectados e registrados como missão bloqueada, sem
interação ou tentativa de contorno.

## 6. Autenticação, autorização e API

- Cadastro exige senha de pelo menos 12 caracteres e verificação de e-mail.
- `ADMIN_EMAILS` define a allowlist administrativa do servidor.
- O plano é consultado no banco para cada criação de auditoria; o grant Pro
  vigente é persistido com autor, data e nota opcional.
- A criação da auditoria e a verificação de cota ocorrem em transação com
  bloqueio da linha do usuário, evitando ultrapassar o limite por submissões
  concorrentes do mesmo usuário.
- Histórico, relatório e screenshots são consultados no escopo do usuário
  autenticado. Logs técnicos são omitidos nas respostas de contas Free.

| Endpoint | Operação |
|---|---|
| `GET /api/account` | Plano e uso mensal da conta autenticada |
| `GET /api/runs` | Histórico da conta |
| `POST /api/runs` | Valida e agenda uma auditoria |
| `GET /api/runs/[id]` | Lê estado e relatório de uma auditoria própria |
| `POST /api/runs/[id]/retry` | Reinicia uma auditoria elegível sem nova cota |
| `GET /api/runs/[id]/screenshots/[...path]` | Entrega screenshot privada após checagem de propriedade |
| `GET/POST /api/admin/users` | Lista contas e altera grants Pro; exige administrador |
| `GET/POST /api/auth/[...all]` | Endpoints delegados ao Better Auth |

## 7. Operação e limitações conhecidas

- **Instância única:** execução em background usa `after()` e um conjunto em
  memória para evitar duplicidade dentro do mesmo processo. Não é uma fila
  durável e não deve ser assumida como compartilhada entre várias instâncias.
- **Screenshots em disco local:** o modelo atual pressupõe armazenamento
  persistente no filesystem. Para escalar horizontalmente ou usar serverless,
  substitua-o por storage privado compartilhado e use uma fila durável para
  executar missões.
- **Integração de billing ausente:** grants Pro são manuais; implementar
  assinatura exige checkout, webhooks idempotentes, estados de assinatura e
  processo de reconciliação/cancelamento.
- **Dependências externas:** auditorias exigem saída de rede para o site alvo e
  OpenRouter; envio externo de e-mail exige SMTP liberado pelo provedor.
- **DNS do Compose:** o serviço `app` declara `8.8.8.8` e `1.1.1.1`; ambientes
  corporativos podem precisar configurar os resolvedores autorizados.
- **Segredos:** `.env` é local e não deve ser versionado. Em produção, use
  segredos fortes, URL HTTPS pública e SMTP autorizado.
- **Uso responsável:** execute testes apenas contra ambientes e domínios em que
  haja autorização. O bloqueio de CAPTCHA é intencional e exige intervenção
  humana.

## 8. Verificação de qualidade

```bash
npm test
npm run test:playwright
npm run test:coverage
npm run lint
npx tsc --noEmit
npm run build
```

`npm test` executa testes unitários, de API e de componentes. A integração
Playwright usa um servidor de teste local e requer Chromium instalado
(`npx playwright install --with-deps chromium` em Linux). `npm run test:coverage`
habilita explicitamente essa integração além dos outros testes.
