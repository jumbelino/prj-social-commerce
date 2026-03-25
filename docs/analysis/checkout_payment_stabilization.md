# Checkout e Pagamento: Estabilização

## Escopo executado
- fluxo público de checkout
- criação de pedido + início de pagamento Mercado Pago
- retorno do pagamento para a aplicação
- sincronização explícita de status no retorno
- consistência de estoque em expiração/falha/cancelamento
- cobertura automatizada backend + frontend

## Ajustes implementados

### Backend
- `POST /payments/mercado-pago/preference` agora aceita `return_url_base` e monta `back_urls` por pedido.
- a preferência agora retorna `checkout_url` e `is_sandbox`, permitindo ao frontend usar a URL correta do sandbox.
- a preferência persiste `Payment` para o fluxo Checkout Pro e mantém `external_reference` coerente.
- foi criado `POST /payments/mercado-pago/sync` para sincronizar o pagamento no retorno usando `payment_id` e/ou `status`.
- `OrderRead` agora expõe `latest_payment_status` e `latest_payment_external_id`.
- o pedido continua expirando e devolvendo estoque quando necessário; no retorno, a sincronização respeita esse estado.

### Frontend
- checkout passou a enviar `return_url_base` baseado em `window.location.origin`.
- checkout usa `checkout_url` em vez de assumir `init_point`.
- o carrinho não é mais limpo antes da confirmação do pagamento.
- foi criada a rota `/checkout/result`, que:
  - sincroniza o pagamento ao retornar do Mercado Pago;
  - mostra estados explícitos de sucesso, pendência e falha;
  - limpa o carrinho apenas quando o pedido está `paid`;
  - expõe mensagem clara quando a sincronização automática falha.
- `clearCart()` agora limpa itens, CEP e frete selecionado.

## Contratos corrigidos
- frontend deixou de depender apenas de webhook para enxergar pagamento aprovado/rejeitado.
- backend passou a informar qual URL do Mercado Pago deve ser usada em sandbox.
- retorno do checkout deixou de cair em estado implícito ou silencioso; agora sempre há página de resultado.

## Testes ajustados
- backend:
  - preferência com `back_urls` e `checkout_url`
  - sincronização de pagamento no retorno
- frontend E2E:
  - opções de pagamento no checkout
  - criação de pedido + preferência
  - erro explícito ao falhar a criação da preferência
  - retorno com pagamento aprovado
  - retorno com pagamento pendente
  - retorno com pagamento rejeitado

## Como validar manualmente o sandbox
1. Configurar `MERCADO_PAGO_ACCESS_TOKEN` com credencial de teste.
2. Desligar mock: `MERCADO_PAGO_MOCK=0`.
3. Opcional: definir `MERCADO_PAGO_NOTIFICATION_URL` se houver URL pública para webhook.
4. Subir backend e frontend atualizados.
5. Acessar a loja, adicionar produto, calcular frete e ir para `/checkout`.
6. Preencher dados do cliente e concluir em Mercado Pago.
7. Confirmar retorno para `/checkout/result?...`.
8. Validar:
   - aprovado: pedido `paid`, carrinho limpo, mensagem de sucesso;
   - pendente: pedido `pending`, carrinho preservado, mensagem de aguardo;
   - rejeitado/cancelado/expirado: pedido `cancelled`, estoque devolvido, carrinho preservado.

## Limitações restantes
- no ambiente atual, uma validação direta com `MERCADO_PAGO_MOCK=0` e o token montado no backend retornou `403 PA_UNAUTHORIZED_RESULT_FROM_POLICIES` ao criar preferência. Isso indica bloqueio de credencial/conta/política no Mercado Pago, não falha do fluxo local.
- sem `MERCADO_PAGO_NOTIFICATION_URL` público, o webhook não participa do teste local; o retorno usa sincronização ativa via `payment_id`.
- PIX continua disponível, mas o fechamento principal desta etapa foi o Checkout Pro com retorno explícito.
- a integração real ainda depende de credenciais sandbox válidas e de `MERCADO_PAGO_MOCK=0` no ambiente de execução.
