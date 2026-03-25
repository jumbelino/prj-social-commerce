# Plano Técnico de Recuperação do MVP

## Registro de updates
- 2026-03-24: plano criado a partir de [app_audit.md](/home/aurea/prj-social-commerce/docs/analysis/app_audit.md) e marcado como documento vivo.
- 2026-03-24: início da implementação da Fase 1 no backend. Entregue: status canônico `pending/paid/shipped/delivered/cancelled`, base de expiração e devolução de estoque, vínculo real de cliente em pedidos, persistência de `Payment` para Checkout Pro, exclusão segura de produto vendido e correção do update por `variant_id`.
- 2026-03-24: estabilização do checkout/pagamento iniciada. Entregue: `back_urls` no Checkout Pro, rota `/checkout/result`, sincronização explícita de pagamento no retorno, uso de `checkout_url` sandbox e cobertura automatizada do fluxo principal.

## 1. Objetivo do plano
Recuperar o MVP atual para um estado operacional em que a loja consiga vender de ponta a ponta com catálogo, carrinho, checkout, pagamento via Mercado Pago Checkout Pro, cotação de frete via Melhor Envio e administração mínima confiável de produtos, pedidos e clientes.

## 2. Princípios de recuperação do projeto
- Corrigir primeiro inconsistência de domínio; feature nova só entra depois.
- Priorizar fluxo ponta a ponta sobre cobertura superficial.
- Reduzir o MVP ao mínimo operacional e cortar integrações secundárias do caminho crítico.
- Centralizar regras de pedido, estoque, pagamento e cliente em serviços reutilizáveis.
- Manter este arquivo como documento vivo; toda mudança relevante de escopo, decisão ou sequência deve ser registrada no bloco `Registro de updates`.

## 3. O que deve ser corrigido antes de qualquer feature nova
- `[bugfix]` Unificar status de pedido em backend, frontend, webhook e testes.
- `[bugfix]` Garantir devolução de estoque em cancelamento, falha e expiração.
- `[bugfix]` Impedir exclusão física insegura de produto com histórico.
- `[bugfix]` Corrigir edição de produto para operar por `variant_id`.
- `[bugfix]` Vincular pedidos a `customer_id` real.
- `[integration]` Validar Mercado Pago sandbox sem mock após estabilização do domínio.
- `[qa]` Fechar cobertura automatizada dos fluxos críticos.

## 4. Backlog priorizado por fases
### Fase 1
- `[bugfix]` Status canônico de pedido.
- `[bugfix]` Reserva/devolução de estoque.
- `[bugfix]` Cliente real vinculado ao pedido.
- `[bugfix]` Edição e exclusão seguras de produto.
- `[refactor]` Serviços centrais de pedido, estoque e cliente.
- `[qa]` Testes críticos de regressão.

### Fase 2
- `[integration]` Checkout Pro real em sandbox.
- `[integration]` Webhook idempotente e retorno de checkout.
- `[feature]` Fluxo público catálogo → carrinho → frete → checkout → confirmação.
- `[ux]` Mensagens claras para pagamento pendente, pago, expirado e cancelado.

### Fase 3
- `[feature]` Admin mínimo confiável para produtos, pedidos e clientes.
- `[bugfix]` Fechar lacunas restantes de imagens, filtros e ações administrativas.
- `[ux]` Feedbacks operacionais e estados de erro consistentes.

### Fase 4
- `[ux]` Revisão visual do storefront e admin.
- `[ux]` Ajustes mobile e estados de loading/erro/vazio.
- `[qa]` Fechamento de regressões E2E e refinamento final.

## 5. Fase 1: estabilização crítica
Objetivo: remover incoerências de domínio que impedem evolução segura.

Escopo:
- Status de pedido canônico: `pending`, `paid`, `shipped`, `delivered`, `cancelled`.
- Expiração básica de pedido com devolução de estoque.
- Cancelamento com devolução de estoque quando o pedido ainda não foi expedido.
- `customer_id` persistido e sincronizado com snapshot do pedido.
- Persistência de `Payment` também no Checkout Pro.
- Produto vendido não é hard-delete; operação de exclusão vira arquivamento.
- Update de produto opera por `variant_id` e rejeita remoção de variante já vendida.

Status atual:
- Parcialmente implementada no backend e coberta por testes automatizados.

## 6. Fase 2: fluxo de compra ponta a ponta
Objetivo: tornar o checkout real validável em sandbox sem mock.

Escopo fechado:
- Mercado Pago via Checkout Pro.
- Melhor Envio apenas para cotação de frete no checkout.
- PIX custom, etiqueta e tracking fora do caminho crítico.

Entregas:
- Ambiente sandbox sem `MERCADO_PAGO_MOCK`.
- Página/rota de retorno com leitura confiável do pedido.
- Conciliação entre callback, webhook e estado final do pedido.
- Carrinho limpo apenas no momento correto.
- Mensagens de continuidade para pedido pendente ou expirado.

## 7. Fase 3: admin funcional mínimo
Objetivo: permitir operação diária básica sem quebrar histórico.

Entregas:
- Produtos: criar, editar, arquivar/desativar e gerir imagens.
- Pedidos: listar, detalhar, acompanhar pagamento e mudar status logístico.
- Clientes: captura automática, listagem e detalhe vinculados por `customer_id`.
- Venda assistida: reaproveitar o mesmo fluxo de domínio do storefront.

## 8. Fase 4: UX/UI e acabamento
Objetivo: sair de um estado de demo inconsistente para uma experiência minimamente vendável.

Entregas:
- Hierarquia visual melhor no catálogo, detalhe, carrinho e checkout.
- PT-BR consistente em labels e mensagens.
- Estados de loading, vazio, erro e sucesso padronizados.
- Melhor leitura de preço, frete, prazo e status.
- Ajustes mobile prioritários nas telas de compra e admin.

## 9. Dependências técnicas por fase
- Fase 2 depende da Fase 1 concluída no backend e contratos do frontend alinhados.
- Fase 3 depende da Fase 1 e pode avançar em paralelo parcial com a Fase 2.
- Fase 4 depende do fechamento funcional das fases 2 e 3, mas a revisão de design pode começar antes.
- Toda fase posterior depende de testes críticos atualizados.

## 10. Riscos
- Reintroduzir lógica de domínio dispersa em controllers.
- Validar Mercado Pago real antes de fechar estoque e expiração.
- Tentar incluir PIX custom e etiqueta no mesmo ciclo de recuperação.
- Divergência entre ambiente local, sandbox e produção por flags de mock.
- Manter o frontend desatualizado em relação aos contratos corrigidos do backend.

## 11. Critérios de aceite por fase
### Fase 1
- Pedido não aceita mais `confirmed`.
- Cancelamento e expiração devolvem estoque.
- Produto vendido não gera 500 ao excluir.
- Update de produto não retorna sucesso sem persistência.
- Pedido com email válido gera ou reaproveita cliente real.

### Fase 2
- Compra completa em sandbox com Checkout Pro.
- Webhook atualiza pedido para `paid` de forma idempotente.
- Pedido expirado não fica com estoque preso.
- Retorno de checkout mostra estado confiável.

### Fase 3
- Admin opera produtos, pedidos e clientes sem 500 em fluxo normal.
- Clientes no admin mostram pedidos reais vinculados.
- Arquivamento de produto preserva histórico.

### Fase 4
- Storefront e admin têm navegação compreensível e responsiva.
- E2E cobre o fluxo principal de compra e backoffice mínimo.

## 12. Ordem recomendada de execução
1. Congelar contrato de domínio.
2. Fechar backend de pedido, estoque, cliente e produto.
3. Atualizar testes automatizados.
4. Validar Mercado Pago real em sandbox.
5. Ajustar storefront para o contrato final.
6. Fechar admin mínimo.
7. Refinar UX/UI.

## 13. Sugestão de quais tarefas podem ser paralelizadas
- Frente A: backend de domínio e migrações.
- Frente B: frontend de checkout e admin consumindo os novos contratos.
- Frente C: suíte E2E e testes de integração.
- Frente D: revisão visual e copy, desde que sem alterar contratos.

## 14. Lista de endpoints, telas e fluxos que precisam de revisão
### Endpoints
- `POST /orders`
- `GET /orders/{order_id}`
- `POST /payments/mercado-pago`
- `POST /payments/mercado-pago/preference`
- `POST /webhooks/mercado-pago`
- `GET/PATCH /admin/orders`
- `GET/POST /admin/customers`
- `GET /admin/customers/{customer_id}`
- `PUT/DELETE /products/{product_id}`

### Telas
- `/`
- `/products/[id]`
- `/cart`
- `/checkout`
- `/admin/products`
- `/admin/products/[id]`
- `/admin/orders`
- `/admin/orders/[id]`
- `/admin/customers`
- `/admin/customers/[id]`

### Fluxos
- catálogo → detalhe → carrinho
- carrinho → frete → checkout
- checkout → Mercado Pago → retorno
- webhook → pagamento → pedido
- cancelamento/expiração → devolução de estoque
- criação/edição/arquivamento de produto
- captura e consulta de clientes

## 15. Definição do “MVP funcional” final
O MVP será considerado funcional quando:
- o visitante conseguir navegar, adicionar item ao carrinho, cotar frete, fechar pedido e pagar via Checkout Pro;
- o pedido transitar corretamente entre `pending`, `paid`, `shipped`, `delivered` e `cancelled`;
- o estoque for reservado e devolvido com segurança;
- o admin conseguir criar, editar, arquivar e listar produtos sem quebrar histórico;
- o admin conseguir listar e acompanhar pedidos com status confiáveis;
- clientes forem capturados automaticamente e aparecerem no admin com vínculo real;
- a interface pública e administrativa estiverem usáveis para operação real, ainda que sem recursos avançados.

Fica fora deste MVP:
- PIX custom em UI própria;
- compra de etiqueta no Melhor Envio;
- tracking automatizado;
- CRM avançado;
- cupons, promoções e recursos de growth.
