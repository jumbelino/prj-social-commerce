# Manual Sales and Assisted Checkout — Final QA

## Estado final da fase
- `/admin/assisted-sale` permite montar pedido assistido com:
  - itens e variantes
  - cliente existente ou novo inline
  - `delivery_method` `shipping` ou `pickup`
  - frete condicional para `shipping`
  - criacao do pedido
  - geracao manual do link de pagamento
- O pedido continua usando:
  - o mesmo dominio de pedidos
  - o mesmo motor de estoque
  - o mesmo motor de pagamento
- `orders.source` permanece `admin_assisted`.

## Validacoes realizadas
- Backend:
  - criacao de pedido com `shipping`
  - criacao de pedido com `pickup`
  - filtro `source=admin_assisted` em `/admin/orders`
  - compatibilidade da storefront publica preservada
- Frontend:
  - typecheck do frontend passou
  - lint direcionado passou
  - revisao final do fluxo assistido no admin concluida
- Operacao:
  - pos-criacao mostra estado de pedido criado
  - geracao manual do link de pagamento existe
  - acoes de `Copiar link`, `Abrir checkout` e `Ver pedido` existem
  - `/admin/orders` e `/admin/orders/[id]` agora exibem origem e metodo de entrega de forma amigavel

## Ajustes finais aplicados nesta rodada
- Exibicao amigavel de origem:
  - `storefront` -> `Loja`
  - `admin_assisted` -> `Venda assistida`
- Exibicao amigavel de metodo de entrega:
  - `shipping` -> `Envio`
  - `pickup` -> `Retirada`
- Tratamento visual de pedidos com `pickup` na listagem e no detalhe:
  - sem frete calculado
  - sem tentativa de mostrar campos de envio como se fossem obrigatorios
- Filtro por origem exposto na listagem de pedidos admin

## Limitacoes restantes
- O E2E completo da rota `/admin/assisted-sale` continua dependente do runtime/auth local do ambiente.
- O fluxo funcional esta implementado, mas a validacao E2E autenticada ainda nao ficou 100% confiavel no ambiente atual.
- Nao existe historico de links ou segunda tela operacional de cobranca, por decisao de escopo.

## Conclusao
- Funcionalmente, a fase atende ao menor produto util de venda assistida.
- O acompanhamento posterior permanece corretamente no fluxo normal de pedidos.
- A branch pode seguir para fechamento, com a ressalva explicita de que a limitacao restante e de runtime/auth para E2E final, nao de contrato principal ou fluxo operacional implementado.
