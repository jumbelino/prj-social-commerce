# Estado Atual da Aplicação, Débitos Técnicos e Prontidão para Beta

Data da análise: 2026-03-31  
Branch atual: `task/chatwoot-and-sales-handoff-foundation`

## 1. Objetivo deste documento

Este documento consolida:

- como a aplicação está hoje, no código e na infra do repositório;
- o que já está funcional;
- os débitos técnicos relevantes;
- o que falta para lançar um beta;
- o que pode ser melhorado para a aplicação operar como catálogo online com pagamento integrado e sistema de envio;
- um ponto de continuidade técnica claro para outro agente CLI assumir o trabalho.

Este documento foi escrito com base no estado real do código em `backend/`, `frontend/`, `infra/`, `docs/` e no runtime local Docker descrito no repositório.  
Ele deve ser tratado como fotografia técnica atual, não como histórico das fases anteriores.

## 2. Resumo executivo

### Diagnóstico geral

O produto já passou da fase de MVP cru. Hoje ele possui:

- storefront pública polida;
- área admin funcional;
- fluxo de venda assistida operacional;
- pedidos, clientes, estoque e pagamentos com domínio único;
- frete por cotação via Melhor Envio;
- pagamento Mercado Pago com Checkout Pro, PIX, sincronização e webhook;
- operações admin para pedidos, clientes, produtos e pós-venda.

### Conclusão curta

O sistema está **próximo de um beta operacional**, mas ainda **não está pronto para um beta público confiável de e-commerce self-service completo** sem alguns ajustes obrigatórios.

O principal motivo é que o produto já cobre bem:

- catálogo;
- carrinho;
- checkout;
- pedido;
- pagamento;
- venda assistida;
- operação admin;

mas ainda tem lacunas em:

- robustez de configuração de ambiente/auth;
- homologação real e repetível de Mercado Pago;
- escopo real de “sistema de envio” (hoje há cotação e seleção, mas não fulfillment/logística completa);
- captura de endereço para envio físico;
- padronização de ambiente, observabilidade e critérios de produção/beta.

### Avaliação de prontidão

| Área | Estado atual |
|---|---|
| Catálogo/storefront | Bom |
| Admin operacional | Bom |
| Venda assistida | Bom |
| Domínio de pedidos/clientes/estoque | Bom |
| Pagamento Mercado Pago | Funcional, mas depende de homologação real e padronização de ambiente |
| Frete/Envio | Parcial: cotação pronta, fulfillment ainda incompleto |
| Infra/auth local | Funcional, porém frágil e sensível a host/env |
| Prontidão para beta interno/fechado | Alta |
| Prontidão para beta externo mais amplo | Média, com bloqueios claros |

## 3. Estado atual do produto por módulo

## 3.1 Backend

Stack principal:

- FastAPI
- SQLAlchemy 2
- Alembic
- Pydantic
- PostgreSQL

Módulos principais em `backend/app/`:

- `api/products.py`
- `api/orders.py`
- `api/payments.py`
- `api/shipping.py`
- `api/webhooks.py`
- `api/admin_orders.py`
- `api/admin_customers.py`
- `api/admin_dashboard.py`
- `api/admin_product_images.py`
- `services/orders.py`
- `services/inventory.py`
- `services/customers.py`
- `integrations/mercado_pago.py`
- `integrations/melhor_envio.py`
- `integrations/minio_storage.py`

Estado funcional atual do backend:

- produtos públicos e admin operam pelo mesmo domínio;
- pedidos storefront e assistidos usam o mesmo motor de criação;
- `orders.source` diferencia `storefront` e `admin_assisted`;
- `delivery_method` suporta `shipping` e `pickup`;
- cliente já é persistido/vinculado por `upsert_customer()`;
- estoque é abatido no momento da criação do pedido;
- estoque é liberado para pedidos expirados/cancelados/rejeitados;
- Mercado Pago já possui:
  - criação de PIX;
  - criação de preferência Checkout Pro;
  - sincronização explícita;
  - webhook;
- Melhor Envio já possui:
  - cotação;
  - validação de dimensões;
  - persistência do snapshot de frete selecionado.

## 3.2 Frontend

Stack principal:

- Next.js 16
- React 19
- TypeScript
- Tailwind v4
- NextAuth

Áreas principais:

- storefront pública em `frontend/app/(storefront)/`
- admin em `frontend/app/admin/`
- proxies autenticados em `frontend/app/api/admin/*`
- auth em `frontend/auth.ts`
- cliente HTTP central em `frontend/lib/api.ts`

Estado funcional atual do frontend:

- storefront com home, PDP, cart, checkout e result;
- admin com dashboard, produtos, pedidos, clientes e venda assistida;
- pedidos com listagem/detalhe mais claros;
- ações rápidas de cópia e geração manual de link no detalhe;
- venda assistida até criação do pedido e geração de link;
- upload/admin de imagens;
- proxies Next para rotas admin autenticadas.

## 3.3 Infra local

Base em `infra/dev/docker-compose.yml`:

- Postgres
- Redis
- MinIO
- Keycloak
- Backend
- Frontend

Há `.env.example` para infra, backend e frontend, mas existe **drift entre templates, `.env` real e runtime atual**, especialmente em auth/issuer/base URLs.

## 4. O que já está funcional hoje

## 4.1 Storefront pública

Funciona hoje:

- listagem de produtos;
- detalhe de produto com galeria e variantes;
- carrinho com persistência local;
- cálculo e seleção de frete;
- checkout com criação de pedido;
- retorno do pagamento em `/checkout/result`;
- visual dark-first e PT-BR consistente;
- fallback de imagem e estados principais;
- CTA comercial mais claro.

## 4.2 Admin

Funciona hoje:

- login via Keycloak + NextAuth;
- dashboard;
- gestão de produtos;
- upload e ordenação de imagens;
- listagem e detalhe de pedidos;
- atualização de status;
- listagem e detalhe de clientes;
- venda assistida;
- ações rápidas no detalhe do pedido.

## 4.3 Venda assistida

Funciona hoje:

- busca de produto e variante;
- seleção de cliente existente ou novo inline;
- `shipping` ou `pickup`;
- frete condicional;
- criação do pedido assistido;
- geração manual de link de pagamento;
- cópia e abertura do checkout;
- integração com listagem normal de pedidos.

## 4.4 Pagamento

Funciona em código:

- Checkout Pro via preferência;
- PIX;
- página de retorno;
- sincronização ativa;
- webhook Mercado Pago com verificação de assinatura;
- persistência de `Payment` e reflexo em `Order.latest_payment_status`.

Importante:

- o fluxo técnico existe e está consistente;
- a validação real depende de ambiente correto, credenciais válidas e retorno/webhook públicos;
- existe documentação de sandbox e homologação, mas isso ainda precisa ser tratado como item de go-live/beta, não como problema completamente encerrado.

## 4.5 Frete / envio

Funciona hoje:

- cotação via Melhor Envio;
- seleção do serviço;
- persistência do snapshot do frete no pedido;
- fluxo assistido suporta `pickup` como alternativa sem frete.

Mas o sistema de envio hoje é **apenas cotação + seleção**, não fulfillment completo.

## 5. O que ainda está incompleto ou parcial

## 5.1 Envio físico não está completo

Este é o principal gap entre “tem frete” e “tem sistema de envio funcional”.

Hoje o produto:

- calcula frete;
- guarda serviço/preço/prazo;
- guarda CEP de destino;

mas **não captura endereço completo** no pedido:

- rua;
- número;
- complemento;
- bairro;
- cidade;
- UF;
- referência.

Também não existe:

- compra de etiqueta;
- geração de etiqueta;
- fluxo de postagem;
- tracking pós-envio;
- atualização automática de entrega.

Conclusão:

- se o beta for “catálogo + pagamento + entrega operada manualmente”, é viável com ressalvas;
- se o beta for “e-commerce com envio integrado ponta a ponta”, ainda não está pronto.

## 5.2 Homologação real de pagamento ainda precisa virar rotina operacional

Embora o fluxo exista, ainda há dependência operacional de:

- `MERCADO_PAGO_MOCK=0`;
- credenciais válidas;
- URL pública de retorno/webhook;
- ambiente coerente entre frontend/backend.

O repositório já possui documentação de homologação, mas ainda não há uma experiência de ambiente realmente “plug and play” para qualquer agente subir e repetir a validação real sem ajustes.

## 5.3 Auth/admin ainda é sensível a host/base URL/issuer

O bug recente de admin via LAN mostrou que auth ainda é frágil quando muda:

- host público do frontend;
- base URL do auth;
- issuer OIDC esperado pelo backend;
- ambiente em Docker vs host.

Foi corrigido localmente, mas há dívida em:

- templates `.env.example`;
- padronização do runtime;
- documentação única e atualizada do setup.

## 5.4 Drift entre documentação histórica e código atual

Existem docs antigas que já não refletem integralmente o estado atual.

Exemplo:

- auditorias anteriores ainda carregam achados que já foram corrigidos;
- novos módulos concluídos nas fases recentes ainda não foram incorporados em uma documentação consolidada de produto.

Isso é um débito real de continuidade entre agentes.

## 6. Débitos técnicos prioritários

## 6.1 Débitos críticos para beta

### 1. Configuração/auth dependente demais de ambiente

Sintoma:

- login/admin pode falhar por `issuer`, host ou base URL incorretos;
- proxies `/api/admin/*` dependem de alinhamento fino entre NextAuth, Keycloak e backend.

Impacto:

- risco alto de quebrar admin no ambiente errado;
- difícil transferência entre máquinas/operadores.

Arquivos relevantes:

- `frontend/auth.ts`
- `frontend/app/api/admin/*`
- `backend/app/auth/*`
- `infra/dev/docker-compose.yml`
- `infra/dev/.env.example`

### 2. Endereço de entrega incompleto

Sintoma:

- checkout e pedido operam com CEP + frete, mas sem endereço postal completo.

Impacto:

- impossível transformar “pedido pago” em envio físico integrado de forma robusta;
- inviável afirmar que o módulo de envio está completo para beta público.

Arquivos relevantes:

- `frontend/app/(storefront)/checkout/page.tsx`
- `backend/app/schemas/orders.py`
- `backend/app/models/order.py`

### 3. Beta depende de segredos/envs e runbook ainda frágeis

Sintoma:

- env de desenvolvimento está funcional, mas ainda sujeito a drift;
- `.env.example` não acompanha integralmente o runtime real usado nas últimas correções.

Impacto:

- onboarding técnico frágil;
- alto risco de “na minha máquina funciona”.

### 4. Worktree atual não está limpo

Estado atual do repositório no momento desta análise:

- `frontend/app/admin/products/page.tsx` modificado
- `infra/dev/.env` modificado
- `docs/analysis/admin_lan_auth_and_products_stability.md` não commitado

Isso é importante porque outro agente pode assumir o projeto achando que a branch está limpa, quando não está.

## 6.2 Débitos médios

### 5. Falta de CI/qualidade automatizada mais visível

Há testes relevantes, mas não há evidência no repositório de:

- pipeline CI formal;
- smoke obrigatório de release;
- gate de merge para backend + frontend + E2E.

### 6. Falta de observabilidade operacional

Hoje faltam:

- logging estruturado mais claro;
- tracking de erros por ambiente;
- monitoramento de webhook/pagamento;
- painel mínimo de falhas operacionais.

### 7. Acoplamento entre fluxo de pagamento e configuração de ambiente

O fluxo é correto, mas depende de:

- `NEXT_PUBLIC_APP_BASE_URL`
- `CHECKOUT_RESULT_REDIRECT_BASE_URL`
- `MERCADO_PAGO_NOTIFICATION_URL`

Se esses valores divergirem, a UX quebra mesmo com código certo.

### 8. Gap entre “cotação de frete” e “operação logística”

Hoje o produto resolve a escolha do frete, mas não a operação de postagem/expedição.  
Isso não impede beta fechado, mas impede comunicar “sistema de envio completo” sem ressalvas.

## 6.3 Débitos baixos, mas relevantes

### 9. Inconsistência documental

- docs espalhadas;
- análises históricas sem consolidação;
- ausência de uma visão única de release readiness.

### 10. Falta de documentação de suporte operacional

Ainda falta um runbook mais objetivo para:

- como operar pedido pago;
- como operar pedido `pickup`;
- como tratar pagamento pendente/rejeitado;
- como validar webhook;
- como lidar com expiração e reenvio de link.

## 7. O que falta para lançar um beta

## 7.1 Interpretação correta de “beta”

Há dois recortes possíveis:

### Beta A — fechado / operacional / acompanhado

Objetivo:

- poucos usuários;
- operação manual assistida;
- equipe acompanhando pedidos, pagamentos e entrega manualmente.

Para esse beta, a aplicação está relativamente próxima.

### Beta B — loja pública mais autônoma e confiável

Objetivo:

- usuário navega sozinho;
- compra com pagamento real;
- entrega com fluxo minimamente consistente;
- operação menos dependente de suporte manual.

Para esse beta, ainda faltam itens obrigatórios.

## 7.2 Itens obrigatórios antes de beta

### Obrigatório 1. Fechar a padronização do ambiente

Fazer:

- consolidar envs reais e templates;
- refletir as correções recentes de auth/base URL;
- garantir setup reproduzível em `README` e `.env.example`;
- limpar worktree e versionar a correção do admin LAN.

Sem isso:

- o admin pode voltar a quebrar por ambiente, não por código.

### Obrigatório 2. Definir claramente o escopo do envio no beta

Decisão de produto necessária:

- o beta vai operar com envio manual depois do pedido pago?
- ou precisa de integração logística além da cotação?

Se a resposta for “só cotação + operação manual”, o produto pode seguir com ressalva.  
Se a resposta for “envio integrado funcional”, ainda falta implementar mais.

### Obrigatório 3. Capturar endereço completo se houver envio físico

Se o beta permitir pedido com envio físico real, precisa haver:

- endereço completo no checkout;
- persistência no pedido;
- leitura clara no admin.

Sem isso:

- o pedido pago não vira entrega com segurança.

### Obrigatório 4. Homologar Mercado Pago real com runbook repetível

Não basta “já funciona no código”.  
É preciso validar e documentar uma rotina repetível de:

- pedido;
- preferência;
- redirecionamento;
- retorno;
- webhook ou sync;
- estados `approved`, `pending`, `rejected/failure`.

### Obrigatório 5. Fechar checklist operacional do admin

O admin já é funcional, mas para beta precisa existir clareza sobre:

- tratamento de pedido pendente;
- reuso/geração de link;
- operação `pickup` vs `shipping`;
- atualização de status;
- rotina pós-venda.

## 7.3 Itens recomendados antes de beta, mas não necessariamente bloqueadores

- smoke E2E autenticado do admin mais estável;
- documentação única de operação diária;
- limpeza de débitos de copy/UX residuais;
- revisão de mensagens de erro em pagamento/frete.

## 8. Melhorias recomendadas como catálogo online com pagamento e envio

## 8.1 Melhorias de maior valor e menor risco

### 1. Captura de endereço completa

Maior ganho para a operação real.

Implementar:

- CEP
- rua
- número
- complemento
- bairro
- cidade
- UF

### 2. Resumo de entrega mais completo no pedido/admin

Hoje já existe:

- método de entrega
- serviço
- prazo
- CEP

Melhorar para:

- endereço completo quando `shipping`
- instruções operacionais
- contexto melhor para expedição

### 3. Padronização final dos envs e runbook

Ganhos:

- menos falha de ambiente;
- onboarding mais rápido;
- menor risco de regressão local.

### 4. Homologação real de pagamento repetível

Ganhos:

- confiança no beta;
- menos risco de descobrir bug real só com usuário.

## 8.2 Melhorias de valor médio

### 5. Busca/filtro/coleções no catálogo

Hoje a storefront é boa para catálogo pequeno.  
Se o catálogo crescer, faltará:

- busca;
- categorias/coleções;
- filtros básicos.

### 6. Melhor UX de acompanhamento de pedido para cliente

Hoje o foco está mais no admin e no retorno imediato do pagamento.  
Pode melhorar com:

- consulta simples de pedido;
- mensagem pós-compra mais rica;
- reforço de status e próximos passos.

### 7. Refino da gestão de produtos

Hoje já funciona, mas pode melhorar em:

- edição em lote;
- validação mais forte de dimensões;
- defaults melhores de frete;
- preview operacional do produto.

## 8.3 Melhorias para depois do beta

- CRM;
- Chatwoot;
- handoff atendimento -> venda;
- automações;
- kanban;
- analytics mais completos;
- tracking/etiqueta/logística avançada;
- múltiplos meios de cobrança adicionais.

## 9. Riscos técnicos e operacionais

## 9.1 Riscos altos

- auth quebrar por env/host;
- pagamento real falhar por configuração divergente;
- envio físico ficar bloqueado por ausência de endereço completo;
- ambiente local de homologação não ser facilmente reproduzível.

## 9.2 Riscos médios

- webhook não ser validado em fluxo real quando o túnel expirar;
- operadores dependerem demais de conhecimento tácito;
- documentação histórica induzir outro agente ao erro.

## 9.3 Riscos baixos

- pequenos ruídos de UX/copy;
- ajustes visuais residuais no admin.

## 10. Cobertura atual de testes e lacunas

Estado encontrado:

- backend: `46 tests collected`
- frontend E2E: `5` specs Playwright

Suites backend atuais:

- `test_admin_product_images.py`
- `test_checkout_preferences.py`
- `test_minio_storage.py`
- `test_orders_shipping_persistence.py`
- `test_recovery_foundations.py`
- `test_shipping_quotes.py`
- `test_timeboxed_critical_flows.py`
- `test_webhooks_mercado_pago.py`

Suites frontend atuais:

- `admin.spec.ts`
- `cart-shipping.spec.ts`
- `checkout-payment.spec.ts`
- `product-images.spec.ts`
- `smoke.spec.ts`

### O que isso cobre bem

- imagens de produto;
- checkout/preference;
- frete;
- recovery foundations;
- webhook;
- partes principais de admin/storefront.

### O que ainda merece reforço

- homologação real de Mercado Pago com credencial/túnel;
- fluxo completo de envio físico;
- repetibilidade do login admin em ambientes variáveis;
- checklist de beta no runtime final real.

## 11. Recomendações objetivas para lançar o beta

## 11.1 Se o objetivo é lançar um beta fechado logo

Recomendação:

1. versionar e consolidar as correções pendentes de auth/admin LAN;
2. atualizar `.env.example`, README e runbook;
3. decidir formalmente que o beta terá:
   - pagamento integrado;
   - cotação de frete;
   - operação manual de envio;
4. homologar Mercado Pago real ponta a ponta;
5. fechar checklist operacional do admin.

Com isso, o produto pode seguir como **beta fechado/assistido**.

## 11.2 Se o objetivo é lançar um beta público mais autônomo

Além do bloco acima, fazer antes:

1. capturar e persistir endereço completo;
2. melhorar o fluxo real de expedição;
3. consolidar ambiente/auth para múltiplos hosts;
4. validar pagamento real com cenários de falha e pendência;
5. garantir uma rotina mínima de suporte/monitoramento.

## 12. Ordem recomendada de trabalho a partir daqui

### Fase 1 — Fechamento técnico do estado atual

- commitar e limpar as correções locais de admin/auth;
- alinhar `infra/dev/.env.example` e README ao runtime real;
- consolidar documentação operacional.

### Fase 2 — Beta readiness mínima

- homologação real Mercado Pago;
- checklist operacional de pedidos;
- definição formal do escopo de envio no beta.

### Fase 3 — Gap crítico de shipping

- captura de endereço completo;
- persistência no pedido;
- leitura no admin.

### Fase 4 — Polimento orientado a beta

- pequenos reforços de UX;
- runbook de suporte;
- smoke final de release.

## 13. Mapa técnico para outro agente continuar

## 13.1 Arquivos mais importantes para continuidade

### Backend

- `backend/app/services/orders.py`
- `backend/app/services/inventory.py`
- `backend/app/services/customers.py`
- `backend/app/api/orders.py`
- `backend/app/api/admin_orders.py`
- `backend/app/api/payments.py`
- `backend/app/api/shipping.py`
- `backend/app/api/webhooks.py`
- `backend/app/models/order.py`
- `backend/app/schemas/orders.py`

### Frontend

- `frontend/lib/api.ts`
- `frontend/auth.ts`
- `frontend/app/(storefront)/checkout/page.tsx`
- `frontend/app/(storefront)/checkout/result/page.tsx`
- `frontend/app/admin/assisted-sale/client.tsx`
- `frontend/app/admin/orders/client.tsx`
- `frontend/app/admin/orders/[id]/page.tsx`
- `frontend/app/admin/products/page.tsx`

### Infra

- `infra/dev/docker-compose.yml`
- `infra/dev/.env.example`
- `README.md`

## 13.2 Estado do worktree no momento desta análise

Pendências locais detectadas:

- `frontend/app/admin/products/page.tsx`
- `infra/dev/.env`
- `docs/analysis/admin_lan_auth_and_products_stability.md`

Outro agente deve começar confirmando se essas mudanças:

- serão commitadas;
- serão descartadas;
- ou precisam ser reescritas em arquivo versionado adequado.

## 14. Conclusão final

### O produto já é um sistema utilizável?

Sim.  
Ele já é um sistema utilizável de:

- catálogo;
- checkout;
- pedido;
- pagamento;
- venda assistida;
- operação admin.

### Ele já está pronto para beta?

Resposta curta:

- **sim, para beta fechado/assistido, com alguns ajustes obrigatórios**;
- **ainda não, para um beta mais amplo vendendo entrega integrada ponta a ponta sem ressalvas**.

### Maiores bloqueios reais para beta

1. consolidar auth/env/base URL;
2. homologar Mercado Pago real de forma repetível;
3. definir escopo real do envio no beta;
4. capturar endereço completo se houver envio físico de verdade.

### Melhor leitura de produto neste momento

Hoje a aplicação está mais madura como:

- **loja/catálogo com pagamento integrado e operação admin forte**, e
- **plataforma de venda assistida + pedidos**,

do que como e-commerce finalizado com logística completa.

Essa distinção é importante para não prometer no beta algo que o domínio ainda não entrega ponta a ponta.
