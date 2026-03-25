# Auditoria Técnica do Estado Atual da Aplicação

## 1. Resumo executivo

### Diagnóstico geral

A aplicação já possui uma base funcional relevante para um MVP:

- backend FastAPI com rotas públicas e admin
- frontend Next.js com storefront, checkout e área administrativa
- autenticação admin via Keycloak/NextAuth
- cálculo de frete via Melhor Envio
- upload de imagens via MinIO
- criação de pedidos e integração com Mercado Pago

O problema é que o sistema está em um estado incoerente entre camadas. O maior bloqueio atual não é ausência total de código, e sim incompatibilidade entre modelo de dados, regras de negócio, status de pedido, gestão de estoque e comportamento do frontend.

### Estado consolidado

| Área | Estado |
|---|---|
| Arquitetura base | Implementado e funcional |
| Catálogo público | Implementado e funcional |
| Carrinho | Implementado e funcional |
| Frete Melhor Envio | Implementado e funcional |
| Checkout | Implementado parcialmente |
| Mercado Pago | Implementado parcialmente / quebrado para cenário real |
| Admin produtos | Implementado parcialmente |
| Admin pedidos | Implementado parcialmente |
| Clientes | Implementado mas quebrado / incompleto |
| Estoque | Implementado mas conceitualmente quebrado |

### Achados mais graves

1. O estoque é baixado na criação do pedido, antes da confirmação do pagamento, e não existe reversão automática para abandono/falha/cancelamento.
2. O modelo de status de pedido está inconsistente:
   - backend admin aceita `confirmed`
   - webhook grava `paid`
   - frontend admin opera com `paid`
3. Exclusão de produto com histórico de pedidos quebra com erro 500 por integridade referencial.
4. Edição de produto pode retornar `200` sem aplicar mudanças quando a alteração implica remover/substituir variante já usada em pedido.
5. Clientes não são persistidos a partir do checkout nem da venda assistida; existem pedidos com dados de cliente e a lista de clientes continua vazia.
6. No ambiente Docker atual, Mercado Pago está em modo mock (`MERCADO_PAGO_MOCK=1`), então o fluxo local não valida integração real de sandbox/cartão.

### Evidências coletadas

- Inspeção integral do código em `backend/`, `frontend/`, `infra/` e `docs/`.
- Testes backend executados com sucesso: `33 passed in 213.79s`.
- E2E frontend executados parcialmente: `26 passed`, `6 failed`.
- Reproduções manuais em runtime:
  - `GET /health` OK.
  - `POST /shipping/quotes` retornando cotações reais do Melhor Envio sandbox.
  - upload de imagem admin OK e objeto MinIO acessível por URL pública.
  - `POST /payments/mercado-pago/preference` e `POST /payments/mercado-pago` retornando apenas respostas mock no ambiente atual.
  - `DELETE /products/{id}` em produto referenciado por pedido retornando erro 500.
  - `PUT /products/{id}` em produto referenciado por pedido retornando `200` sem aplicar mudanças.

## 2. Visão geral da arquitetura atual

### Organização do projeto

Estrutura principal:

- `backend/`: API FastAPI, modelos SQLAlchemy, Alembic, integrações externas
- `frontend/`: Next.js App Router, storefront e admin
- `infra/dev/`: docker-compose, Keycloak, MinIO
- `docs/`: documentação avulsa e notas de integração

### Stack real em uso

- Frontend: Next.js 16, React 19, TypeScript, Tailwind v4
- Backend: FastAPI, SQLAlchemy 2, Alembic, Pydantic
- Banco: PostgreSQL
- Auth admin: Keycloak + NextAuth
- Storage de imagens: MinIO
- Frete: Melhor Envio
- Pagamento: Mercado Pago

### Arquitetura backend

Não existe camada explícita de serviços/domínio. A maior parte da regra de negócio está embutida diretamente nos handlers HTTP em `backend/app/api/*.py`.

Consequências:

- regras de estoque, pedido e pagamento ficam acopladas à camada web
- transições de status e consistência transacional ficam dispersas
- aumenta risco de regressão ao ajustar um fluxo isolado

### Arquitetura frontend

O frontend mistura:

- chamadas diretas ao backend público (`requestJson`)
- chamadas via rotas proxy do Next para áreas autenticadas (`requestNextApi`)
- lógica de fluxo diretamente nas páginas
- estado de carrinho em `localStorage`

Não há camada central de estado do checkout, nem sincronização de carrinho com reserva de estoque ou sessão de pagamento.

### Rotas principais

Backend público:

- `/health`
- `/products`
- `/orders`
- `/shipping/quotes`
- `/payments/mercado-pago`
- `/payments/mercado-pago/preference`
- `/webhooks/mercado-pago`

Backend admin:

- `/admin/ping`
- `/admin/orders`
- `/admin/customers`
- `/admin/dashboard/metrics`
- `/admin/products/{product_id}/images/*`

Frontend público:

- `/`
- `/products/[id]`
- `/cart`
- `/checkout`

Frontend admin:

- `/admin`
- `/admin/products`
- `/admin/products/new`
- `/admin/products/[id]`
- `/admin/orders`
- `/admin/orders/[id]`
- `/admin/customers`
- `/admin/customers/[id]`
- `/admin/assisted-sale`

## 3. Mapa dos módulos existentes

### Backend

| Módulo | Papel |
|---|---|
| `app/api/products.py` | CRUD de produtos |
| `app/api/orders.py` | criação e leitura de pedidos públicos |
| `app/api/payments.py` | PIX e Checkout Pro |
| `app/api/shipping.py` | cotação de frete |
| `app/api/webhooks.py` | webhook Mercado Pago |
| `app/api/admin_orders.py` | listagem e atualização de pedidos admin |
| `app/api/admin_customers.py` | listagem/leitura de clientes admin |
| `app/api/admin_product_images.py` | upload, exclusão e reorder de imagens |
| `app/api/admin_dashboard.py` | métricas admin |
| `app/models/*.py` | produtos, pedidos, pagamentos, clientes |
| `app/integrations/*.py` | Mercado Pago, Melhor Envio, MinIO |

### Frontend

| Módulo | Papel |
|---|---|
| `app/(storefront)` | catálogo, detalhe, carrinho, checkout |
| `app/admin/*` | páginas administrativas |
| `app/api/admin/*` | proxies autenticados do Next para backend |
| `components/cart-provider.tsx` | estado do carrinho em `localStorage` |
| `components/products/*` | formulário, imagens, carrossel |
| `lib/api.ts` | cliente HTTP central |
| `auth.ts` | configuração NextAuth + Keycloak |

### Modelo de dados real

Entidades existentes:

- `Product`
- `ProductVariant`
- `ProductImage`
- `Order`
- `OrderItem`
- `Payment`
- `Customer`

Observação crítica:

`Customer` existe no banco, mas o fluxo de pedido não cria nem vincula cliente (`customer_id` permanece nulo). Na prática, clientes e pedidos estão desacoplados.

## 4. Fluxos que funcionam hoje

### Implementado e funcional

| Fluxo | Evidência |
|---|---|
| Healthcheck | `GET /health` retornou `{"status":"ok"}` |
| Login admin | `GET /admin/ping` autenticado retornou status OK com role `admin` |
| Catálogo público básico | `GET /products` e `GET /products/{id}` funcionam |
| Carrinho local | estado persistido em `localStorage` via `cart-provider.tsx` |
| Cotação de frete | `POST /shipping/quotes` retornou opções reais do Melhor Envio |
| Criação de pedido | `POST /orders` cria pedido, itens e snapshot de frete |
| Upload de imagem | `POST /admin/products/{id}/images/upload` funcionou |
| Acesso à imagem pública | URL do MinIO retornou HTTP 200 para objeto enviado |
| Listagem de pedidos admin | `/admin/orders` retornou pedidos criados |
| Dashboard admin | `/admin/dashboard/metrics` retornou métricas coerentes |

### Observação

Esses fluxos funcionam tecnicamente, mas alguns já nascem com regra de negócio incorreta, principalmente pedido/estoque/pagamento.

## 5. Fluxos parcialmente funcionais

| Fluxo | Estado | Observação |
|---|---|---|
| Checkout storefront | Parcial | cria pedido e aciona pagamento, mas não fecha ciclo de confirmação/retorno |
| Mercado Pago Checkout Pro | Parcial | endpoint existe; no ambiente atual só foi validado em mock |
| PIX Mercado Pago | Parcial | gera QR mock; confirmação depende de webhook |
| Admin produtos | Parcial | listagem funciona; criação via API funciona; edição/exclusão têm falhas de consistência |
| Admin pedidos | Parcial | lista e detalhe funcionam, mas transições quebram com status `paid`/`confirmed` |
| Venda assistida | Parcial | cria pedido admin e gera link; herda os mesmos problemas de estoque/pagamento |
| Gestão de imagens | Parcial | upload validado; reorder/delete existentes em código, sem validação manual nesta auditoria |

## 6. Fluxos quebrados

### 6.1 Exclusão de produto com histórico

Estado: implementado mas quebrado.

Reprodução confirmada:

- produto criado
- pedido criado referenciando a variante
- `DELETE /products/{id}` retornou HTTP 500

Causa:

- `order_items.variant_id` referencia `product_variants.id`
- `delete_product()` tenta apagar variantes em cascata
- o banco bloqueia a exclusão por FK

Impacto:

- exclusão quebra em produção para qualquer produto vendido
- o backend expõe erro interno em vez de erro de negócio tratável

### 6.2 Edição de produto com variante já usada em pedido

Estado: implementado mas quebrado.

Reprodução confirmada:

- `PUT /products/{id}` retornou HTTP 200
- resposta retornou o produto sem nenhuma alteração aplicada

Causa:

- `update_product()` reconcilia variantes por `sku`, não por `id`
- ao renomear/remover SKU antigo, tenta deletar a variante antiga
- se houver `order_items` apontando para ela, ocorre erro de integridade
- o código executa `db.rollback()` dentro do loop e depois faz `db.commit()`
- resultado: alterações anteriores também são revertidas, mas a API retorna sucesso

Impacto:

- comportamento falso-positivo
- usuário acredita que editou, mas o dado continua igual

### 6.3 Gestão de clientes

Estado: implementado parcialmente, na prática quebrado.

Fatos verificados:

- pedidos podem ser criados com `customer_name`, `customer_email` e `customer_phone`
- tabela `customers` existe
- lista admin de clientes retornou `[]` mesmo com pedidos existentes
- `POST /admin/customers` no backend retorna `405 Method Not Allowed`

Causas:

- não há criação automática de `Customer` no checkout nem na venda assistida
- não há CRUD de clientes no backend
- leitura de pedidos por cliente depende de matching por nome/email, não por `customer_id`

### 6.4 Estoque em caso de pagamento não concluído

Estado: implementado mas quebrado conceitualmente.

Fato verificado:

- `create_order()` decrementa `variant.stock` imediatamente
- não existe rotina de liberação de estoque para:
  - abandono de checkout
  - falha de pagamento
  - timeout
  - cancelamento por webhook

Impacto:

- o estoque pode ficar preso em pedidos pendentes/falhos
- exatamente o problema já relatado manualmente pelo produto

### 6.5 Administração de pedidos após webhook aprovado

Estado: quebrado.

Reprodução confirmada:

- webhook Mercado Pago marcou pedido como `paid`
- `PATCH /admin/orders/{id}` depois disso retornou `400 invalid current status: paid`

Causa:

- enum backend só conhece `pending`, `confirmed`, `shipped`, `delivered`, `cancelled`
- webhook grava `paid`
- frontend admin usa `paid`

## 7. Bugs identificados

### Backend

1. `backend/app/api/products.py`
   - `delete_product()` não trata `IntegrityError`; quebra com 500 ao excluir produto vendido.

2. `backend/app/api/products.py`
   - `update_product()` reconcilia variantes por `sku` e ignora `id`.
   - remoção de variante em uso dispara rollback interno e pode devolver `200` sem aplicar nada.

3. `backend/app/api/webhooks.py`
   - webhook grava `order.status = "paid"` embora `OrderStatus` não contenha `paid`.

4. `backend/app/api/admin_orders.py`
   - transições só aceitam `confirmed`, mas o resto do sistema usa `paid`.

5. `backend/app/api/orders.py` e `backend/app/api/admin_orders.py`
   - decrementam estoque já na criação do pedido.

6. `backend/app/api/orders.py` e `backend/app/api/admin_orders.py`
   - não criam nem vinculam registro `Customer`.

### Frontend

7. `frontend/components/products/ProductForm.tsx`
   - dimensões/peso são `required` nos inputs HTML, mas não entram no cálculo de `isValid`.
   - botão pode ficar habilitado e o browser bloquear submit sem feedback consistente.

8. `frontend/app/admin/orders/client.tsx` e `frontend/app/admin/orders/[id]/page.tsx`
   - frontend trabalha com `paid`; backend admin espera `confirmed`.
   - pedidos `confirmed` não têm caminho coerente de progressão na UI.

9. `frontend/lib/api.ts`
   - `createAdminCustomer()` existe no cliente, mas o backend não implementa o endpoint correspondente.

10. `frontend/app/api/admin/customers`
   - existe apenas `route.ts` de coleção; não existe proxy Next para `/api/admin/customers/[id]`.
   - a página de detalhe contorna isso com `fetch` direto ao backend.

### QA/Testes

11. Suite frontend desatualizada em pontos críticos:
   - 6 falhas em 32 testes E2E executados
   - parte das falhas é bug real
   - parte é drift de fixture/assertion

## 8. Lacunas de implementação

### Não implementado

- reserva temporária de estoque com expiração
- devolução automática de estoque por falha/abandono/cancelamento
- persistência real de clientes a partir do checkout
- CRUD real de clientes
- fluxo completo de compra de frete/etiqueta/tracking do Melhor Envio
- página/rota de retorno do Mercado Pago com conciliação do checkout
- política explícita de cancelamento e reembolso
- histórico/auditoria de eventos de pedido/pagamento/estoque

### Implementado parcialmente

- pagamento real via Mercado Pago sandbox
- gestão admin de produto vendido
- experiência de checkout pós-pagamento
- experiência de pedido confirmado/pago no admin

## 9. Problemas de integração externa

### Mercado Pago

Estado atual:

- endpoints existem
- webhook existe
- mock funciona
- integração real não foi validada no stack atual

Problemas encontrados:

1. O ambiente Docker atual roda com `MERCADO_PAGO_MOCK=1`.
2. O token no container é placeholder, então o fluxo local não reproduz sandbox real.
3. O webhook muda o pedido para `paid`, status incompatível com o restante do backend admin.
4. Checkout Pro não persiste um registro `Payment` na criação da preferência.
5. Não há fluxo frontend de retorno/callback consolidando sucesso, falha ou abandono.

Conclusão:

Mercado Pago está implementado em nível técnico, mas o fluxo ponta a ponta real ainda não é confiável.

### Melhor Envio

Estado atual:

- `POST /shipping/quotes` funcionou com token sandbox configurado
- resposta veio ordenada e com múltiplos serviços

Limitações:

- só há cotação
- não há compra de etiqueta, tracking, impressão ou reconciliação logística
- token é lido como string estática; não existe fluxo de refresh/gestão OAuth robusta

### MinIO

Estado atual:

- upload validado
- URL pública validada com HTTP 200

Risco:

- integração depende de configuração correta de bucket/política no bootstrap do ambiente

### Segredos e configuração

Há risco de drift e exposição de segredos:

- existe `.env` populado fora dos exemplos
- o ambiente Docker em uso difere do `.env` raiz para Mercado Pago
- Melhor Envio está com token real configurado no container

Recomendação:

- revisar imediatamente higiene de segredos
- remover credenciais reais de arquivos locais compartilháveis
- centralizar configuração por ambiente

## 10. Problemas de modelo de dados

1. `Order.status` é string livre sem constraint de banco.
2. O enum de status não representa o estado realmente usado pelo webhook (`paid`).
3. `Customer` existe, mas não participa do fluxo principal.
4. `Order.customer_id` fica sem uso real.
5. `OrderItem.variant_id` protege histórico, mas o domínio não trata isso na gestão de produto.
6. Não existe modelo de reserva de estoque separado de estoque disponível.
7. Não existe modelo para expiração de carrinho/checkout/pagamento pendente.
8. Não existe modelo de remessa/etiqueta/tracking.

## 11. Problemas de UX/UI

### Storefront

- idioma misturado entre inglês e português.
- home e detalhe são aceitáveis visualmente, mas ainda parecem demonstração e não loja pronta.
- não há busca, filtros, categorias ou ordenação.
- não há feedback sobre disponibilidade reservada por checkout pendente.
- não há confirmação final clara de compra concluída.
- não há fluxo claro de retomada quando pagamento falha depois do pedido ser criado.

### Carrinho e checkout

- carrinho depende totalmente de `localStorage`, sem sincronização com backend.
- checkout limpa carrinho ao receber preferência/PIX, antes da confirmação efetiva do pagamento.
- formulário não valida bem telefone e identidade do comprador.
- não existe tela de sucesso/erro/retorno do provedor de pagamento.

### Admin

- produtos: formulário mistura criação/edição, mas a validação é inconsistente.
- produtos: o botão pode parecer pronto para submit mesmo faltando campos HTML obrigatórios.
- pedidos: UI e backend discordam sobre status.
- clientes: existe página, mas não existe fluxo real de gestão.
- testes E2E mostram deriva entre expectativa e comportamento atual.

## 12. Riscos arquiteturais

1. Regra de negócio concentrada em controllers HTTP.
2. Ausência de modelagem de estados do pedido/pagamento/estoque.
3. Inconsistência semântica entre backend, webhook e frontend.
4. Falta de camada de serviço dificulta correção incremental segura.
5. Testes verdes no backend não protegem coerência de negócio; eles validam inclusive o estado inconsistente atual.
6. Suite frontend parcialmente defasada reduz confiança no diagnóstico automático.
7. Segredos e config por ambiente estão propensos a drift.

## 13. Lista priorizada de problemas

### Prioridade 0

1. Corrigir o modelo de status de pedido em todas as camadas (`pending`/`paid`/`confirmed`).
2. Implementar estratégia de estoque correta:
   - reservar
   - confirmar no pagamento
   - devolver em falha/cancelamento/timeout
3. Corrigir edição e exclusão de produto com histórico de pedidos.

### Prioridade 1

4. Implementar clientes de verdade:
   - criação
   - vínculo `customer_id`
   - leitura consistente por pedido
5. Fechar o fluxo Mercado Pago real:
   - sandbox real
   - callback/retorno
   - webhook coerente
   - conciliação de pagamento

### Prioridade 2

6. Melhorar confiabilidade do admin:
   - produtos
   - pedidos
   - clientes
7. Reorganizar regras em camada de serviço.
8. Atualizar e estabilizar a suíte E2E.

## 14. Recomendações iniciais

1. Congelar novas features por um ciclo curto e corrigir primeiro a espinha dorsal de pedido/pagamento/estoque.
2. Definir um único estado canônico para pedidos e propagá-lo para:
   - enum backend
   - transições admin
   - webhook
   - frontend
   - testes
3. Introduzir camada de serviço para:
   - criação de pedido
   - reserva/liberação de estoque
   - transição de pagamento
4. Trocar reconciliação de variantes por `id`, não por `sku`.
5. Tratar produtos vendidos como:
   - arquiváveis/desativáveis
   - não deletáveis fisicamente sem política explícita
6. Persistir cliente no ato do checkout/admin order e parar de depender de match por nome/email.
7. Validar Mercado Pago em sandbox real fora do mock antes de qualquer nova evolução de checkout.
8. Revisar segredos e separar claramente:
   - ambiente local mock
   - sandbox real
   - produção

## 15. Anexo técnico com arquivos/áreas importantes do sistema

### Backend crítico

- `backend/app/api/products.py`
- `backend/app/api/orders.py`
- `backend/app/api/payments.py`
- `backend/app/api/webhooks.py`
- `backend/app/api/admin_orders.py`
- `backend/app/api/admin_customers.py`
- `backend/app/models/order.py`
- `backend/app/models/product.py`
- `backend/app/models/customer.py`
- `backend/app/schemas/enums.py`
- `backend/app/integrations/mercado_pago.py`
- `backend/app/integrations/melhor_envio.py`
- `backend/app/integrations/minio_storage.py`

### Frontend crítico

- `frontend/lib/api.ts`
- `frontend/components/cart-provider.tsx`
- `frontend/app/(storefront)/page.tsx`
- `frontend/app/(storefront)/cart/page.tsx`
- `frontend/app/(storefront)/checkout/page.tsx`
- `frontend/app/admin/products/client.tsx`
- `frontend/app/admin/products/[id]/page.tsx`
- `frontend/components/products/ProductForm.tsx`
- `frontend/app/admin/orders/client.tsx`
- `frontend/app/admin/orders/[id]/page.tsx`
- `frontend/app/admin/customers/client.tsx`
- `frontend/app/admin/customers/[id]/page.tsx`
- `frontend/auth.ts`

### Infra e configuração

- `infra/dev/docker-compose.yml`
- `infra/dev/.env.example`
- `backend/.env.example`
- `.env`

### Testes relevantes

- `backend/tests/test_timeboxed_critical_flows.py`
- `backend/tests/test_checkout_preferences.py`
- `backend/tests/test_shipping_quotes.py`
- `backend/tests/test_webhooks_mercado_pago.py`
- `frontend/tests/admin.spec.ts`
- `frontend/tests/cart-shipping.spec.ts`
- `frontend/tests/checkout-payment.spec.ts`

### Resultado resumido dos testes executados nesta auditoria

- Backend: `33 passed`
- Frontend E2E executados: `32`
- Frontend E2E aprovados: `26`
- Frontend E2E falhos: `6`

Falhas frontend observadas:

- criação de produto no admin não concluiu navegação esperada
- edição de produto no admin não observou requisição de update esperada
- teste de detalhe de pedido falhou por expectativa incorreta da suíte
- teste de transição ilegal falhou por clicar botão desabilitado
- teste de frete usou item inválido fora do catálogo atual
- teste de checkout falhou por texto esperado divergente da UI atual

Conclusão do anexo:

A suíte atual ajuda a sinalizar regressões, mas já não é uma representação totalmente confiável do comportamento esperado do produto.
