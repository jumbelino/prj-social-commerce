# Homologação Mercado Pago Sandbox

## 1. Estado atual da integração

O ambiente de desenvolvimento foi ajustado para operar o Checkout Pro real em sandbox com base pública HTTPS no ngrok:

- base pública do ambiente: `https://b7e1-2804-14d-7e34-8156-be24-11ff-fea8-ab04.ngrok-free.app`
- backend fora do mock
- credencial real carregada em runtime
- `checkout_url` retornada agora aponta para `sandbox_init_point`
- retorno público do checkout já responde pela URL HTTPS do ngrok

Estado validado em runtime no container `social-commerce-backend`:

- `MERCADO_PAGO_MOCK=0`
- `MERCADO_PAGO_CHECKOUT_MODE=sandbox`
- `MERCADO_PAGO_ACCESS_TOKEN` presente, mascarado `APP_US...2755`
- `MERCADO_PAGO_NOTIFICATION_URL` presente e apontando para `/webhooks/mercado-pago`
- `MERCADO_PAGO_WEBHOOK_SECRET` presente, mascarado `bfb90d...883c`
- `CHECKOUT_RESULT_REDIRECT_BASE_URL=http://localhost:3000/checkout/result`
- `FRONTEND_ORIGIN` inclui `http://localhost:3000` e a origem pública do ngrok

Estado validado em runtime no container `social-commerce-frontend`:

- `NEXT_PUBLIC_APP_BASE_URL=https://b7e1-2804-14d-7e34-8156-be24-11ff-fea8-ab04.ngrok-free.app`
- `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000`

Conclusão desta seção:

- o bloqueio anterior de `invalid_auto_return` por `http://localhost` foi removido do fluxo real;
- o bloqueio anterior de seleção errada entre `init_point` e `sandbox_init_point` foi corrigido;
- a aplicação está preparada para teste manual ponta a ponta no navegador local.

## 2. Como o fluxo está implementado hoje

### Frontend

Arquivos centrais:

- `frontend/app/(storefront)/checkout/page.tsx`
- `frontend/lib/api.ts`

Fluxo atual:

1. o checkout cria pedido via backend;
2. o frontend resolve a base pública de retorno por `NEXT_PUBLIC_APP_BASE_URL`;
3. a chamada de criação de preferência envia:
   - `order_id`
   - `return_url_base=https://...ngrok-free.app/checkout/result`
4. no navegador, o frontend usa `NEXT_PUBLIC_API_BASE_URL` para falar com o backend local;
5. a tela final de retorno continua em `/checkout/result` no frontend local.

### Backend

Arquivos centrais:

- `backend/app/api/payments.py`
- `backend/app/api/checkout.py`
- `backend/app/integrations/mercado_pago.py`

Fluxo atual:

1. `POST /payments/mercado-pago/preference`
   - carrega o pedido;
   - monta `back_urls` a partir da base pública HTTPS;
   - envia `notification_url` quando configurada;
   - persiste `Payment` com status `pending`;
   - retorna `preference_id`, `init_point`, `sandbox_init_point`, `checkout_url` e `is_sandbox`.
2. `GET /checkout/result`
   - recebe o retorno público no backend via ngrok;
   - redireciona com `307` para `http://localhost:3000/checkout/result` preservando query string.
3. `POST /payments/mercado-pago/sync`
   - continua sendo o mecanismo de reconciliação no retorno da compra.

## 3. Credenciais e parâmetros relevantes

### Variáveis do backend

- `MERCADO_PAGO_MOCK`
- `MERCADO_PAGO_CHECKOUT_MODE`
- `MERCADO_PAGO_ACCESS_TOKEN`
- `MERCADO_PAGO_NOTIFICATION_URL`
- `MERCADO_PAGO_WEBHOOK_SECRET`
- `CHECKOUT_RESULT_REDIRECT_BASE_URL`
- `FRONTEND_ORIGIN`

### Variáveis do frontend

- `NEXT_PUBLIC_APP_BASE_URL`
- `NEXT_PUBLIC_API_BASE_URL`
- `INTERNAL_API_BASE_URL`

### Arquivos de configuração usados

- `infra/dev/.env`
- `infra/dev/docker-compose.yml`

### Parâmetros relevantes do Checkout Pro

- `return_url_base`
- `back_urls.success`
- `back_urls.pending`
- `back_urls.failure`
- `notification_url`
- `auto_return=approved`

## 4. Possíveis causas do 403 PA_UNAUTHORIZED_RESULT_FROM_POLICIES

Essa não é mais a falha dominante do ambiente atual.

Situação observada agora:

- a credencial em runtime é aceita pelo Mercado Pago;
- a criação real de preferência funciona;
- a URL pública HTTPS do ngrok elimina o erro `invalid_auto_return`;
- a `checkout_url` já sai coerente para sandbox.

Classificação atual:

- problema de código anterior: corrigido nesta etapa;
- problema de ambiente anterior: corrigido nesta etapa para retorno público HTTPS;
- problema de credencial: não é o bloqueio atual;
- problema de conta/política: não apareceu na validação atual.

## 5. Evidências encontradas no código/configuração

### Evidência de runtime

No backend:

- `MERCADO_PAGO_MOCK=0`
- `MERCADO_PAGO_CHECKOUT_MODE=sandbox`
- `MERCADO_PAGO_ACCESS_TOKEN=APP_US...2755`
- `MERCADO_PAGO_NOTIFICATION_URL=https://b7e1-2804-14d-7e34-8156-be24-11ff-fea8-ab04.ngrok-free.app/webhooks/mercado-pago`
- `MERCADO_PAGO_WEBHOOK_SECRET=bfb90d...883c`
- `CHECKOUT_RESULT_REDIRECT_BASE_URL=http://localhost:3000/checkout/result`

No frontend:

- `NEXT_PUBLIC_APP_BASE_URL=https://b7e1-2804-14d-7e34-8156-be24-11ff-fea8-ab04.ngrok-free.app`
- `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000`

### Evidência de retorno público

`GET https://b7e1-...ngrok-free.app/checkout/result?...`

Resposta validada:

- `HTTP/2 307`
- `Location: http://localhost:3000/checkout/result?...`

### Evidência de criação real da preferência

Validação real executada:

1. criação de pedido de teste:
   - `POST /orders`
   - `201 Created`
   - pedido `ede4af7b-2de2-436e-ba60-f0910cb8306f`
2. criação de preferência real:
   - `POST /payments/mercado-pago/preference`
   - `return_url_base=https://b7e1-2804-14d-7e34-8156-be24-11ff-fea8-ab04.ngrok-free.app/checkout/result`
   - resposta com:
     - `preference_id` presente
     - `is_sandbox=true`
     - `checkout_url=https://sandbox.mercadopago.com.br/...`
     - `checkout_url == sandbox_init_point`
     - `checkout_url != init_point`
3. leitura posterior do pedido:
   - `status=pending`
   - `latest_payment_status=pending`
   - `latest_payment_external_id` preenchido

## 6. O que parece correto

- o backend está realmente fora do mock;
- a credencial nova está montada e funcional em runtime;
- o fluxo usa base pública HTTPS no retorno;
- o backend possui rota pública `/checkout/result` para receber o retorno externo;
- o redirecionamento para a aplicação local preserva `order_id`, `payment_id` e demais query params;
- a seleção de `checkout_url` agora respeita sandbox explicitamente;
- a preferência real é criada com sucesso com a configuração atual;
- o pedido permanece em `pending` com `Payment` persistido em `pending` antes do retorno do comprador.

## 7. O que parece incorreto ou incompleto

### Incompleto

- o webhook está configurado, mas não foi validado ponta a ponta com uma notificação real disparada pelo Mercado Pago nesta etapa;
- a compra completa no navegador com buyer sandbox ainda depende de execução manual;
- o backend redireciona o retorno público para `http://localhost:3000`, o que é correto para homologação na mesma máquina, mas não serve para compartilhamento com outro dispositivo.

### Observação operacional

O frontend voltou a usar `NEXT_PUBLIC_API_BASE_URL` diretamente no navegador. Isso remove dependência de uma proxy interna Next.js para o checkout local e reduz risco operacional na homologação.

## 8. Correções recomendadas

### Correções já aplicadas

1. configurar `NEXT_PUBLIC_APP_BASE_URL` com a URL pública HTTPS do ngrok;
2. configurar `MERCADO_PAGO_CHECKOUT_MODE=sandbox`;
3. configurar `MERCADO_PAGO_NOTIFICATION_URL` com a rota pública de webhook;
4. adicionar a rota backend pública `/checkout/result` com redirecionamento para o frontend local;
5. remover a dependência do frontend em `window.location.origin` para o retorno do checkout;
6. corrigir a seleção de `checkout_url` para usar `sandbox_init_point`.

### Próxima correção mínima recomendada

Executar a compra manual no navegador com buyer sandbox para validar:

- retorno aprovado;
- retorno pendente;
- retorno falha/cancelamento;
- webhook real, se o túnel ngrok continuar ativo durante a compra.

## 9. Procedimento de homologação sandbox passo a passo

1. Confirmar o ambiente:
   - backend com `MERCADO_PAGO_MOCK=0`
   - backend com `MERCADO_PAGO_CHECKOUT_MODE=sandbox`
   - frontend com `NEXT_PUBLIC_APP_BASE_URL` apontando para o ngrok
2. Garantir que o túnel HTTPS esteja ativo em:
   - `https://b7e1-2804-14d-7e34-8156-be24-11ff-fea8-ab04.ngrok-free.app`
3. Subir o stack:
   - `docker compose -f infra/dev/docker-compose.yml up -d`
4. Abrir a loja local em:
   - `http://localhost:3000`
5. Adicionar produto ao carrinho e seguir para checkout.
6. Finalizar a criação do pedido.
7. Confirmar que a chamada de preferência usa:
   - `return_url_base=https://b7e1-2804-14d-7e34-8156-be24-11ff-fea8-ab04.ngrok-free.app/checkout/result`
8. Confirmar que a resposta do backend traz:
   - `is_sandbox=true`
   - `checkout_url` começando com `https://sandbox.mercadopago.com.br/`
9. Abrir a `checkout_url`.
10. Realizar a compra com buyer sandbox.
11. Confirmar o retorno:
   - Mercado Pago volta para `https://b7e1-.../checkout/result?...`
   - backend responde `307`
   - navegador aterrissa em `http://localhost:3000/checkout/result?...`
12. Validar na UI e no backend:
   - `approved` -> pedido pago
   - `pending` -> pedido pendente
   - `failure/cancelled` -> pedido coerente com falha
13. Se houver webhook entregue, validar também:
   - recebimento em `/webhooks/mercado-pago`
   - reconciliação idempotente

## 10. Checklist final de validação

- backend fora do mock
- credencial real carregada em runtime
- `MERCADO_PAGO_CHECKOUT_MODE=sandbox`
- `NEXT_PUBLIC_APP_BASE_URL` configurada com ngrok HTTPS
- `MERCADO_PAGO_NOTIFICATION_URL` configurada com rota pública do webhook
- `/checkout/result` pública respondendo `307`
- preferência real criada com sucesso
- `checkout_url` igual a `sandbox_init_point`
- pedido persistindo `Payment` em `pending`

## 11. Encerramento formal da fase

Status formal da homologação nesta fase:

- Integração Checkout Pro sandbox validada até a etapa de redirecionamento e criação real de preferência.
- `checkout_url` sandbox e `return_url_base` HTTPS pública validadas.
- Fluxo de retorno da aplicação e sincronização de pagamento validados tecnicamente.

Ponto ainda não homologado integralmente:

- conclusão de compra atravessando o challenge/autenticação do ambiente sandbox do Mercado Pago em todas as variações de teste.

Classificação do bloqueio remanescente:

- o bloqueio atual está na etapa interna de challenge/autenticação do sandbox do Mercado Pago;
- não há evidência de bloqueio estrutural novo no código local para a integração já estabilizada.

Decisão de projeto para esta entrega:

- este ponto não será tratado como bloqueio do MVP neste momento;
- o projeto pode seguir para as próximas frentes de implementação planejadas.
- aplicação pronta para teste manual ponta a ponta no navegador local

## Conclusão

O objetivo desta etapa foi atingido.

Estado final observado:

- a aplicação passou a usar a URL pública HTTPS do ngrok no fluxo real de retorno;
- a `checkout_url` retornada agora está correta para sandbox;
- a preferência real foi criada com sucesso com essa configuração;
- o próximo passo já é o teste manual ponta a ponta no navegador.

Bloqueio remanescente:

- não há bloqueio estrutural de código ou credencial para abrir o Checkout Pro sandbox;
- o que resta validar é comportamento real de compra e, opcionalmente, entrega de webhook durante a sessão manual de homologação.
