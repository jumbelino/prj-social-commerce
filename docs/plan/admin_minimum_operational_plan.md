# Admin Mínimo Operacional — Plano de Implementação

## 1. Resumo executivo
O admin já possui base funcional, mas ainda com inconsistências entre frontend e backend, lacunas de autorização e fragilidades de operação. Esta fase foca em tornar `/admin` operacional para rotina real mínima da loja, com prioridade em Products, Orders, Customers e Dashboard.

## 2. Estado atual da área admin
- Rotas existentes: dashboard, products, orders, customers e assisted-sale.
- Backend já expõe endpoints para produtos, imagens de produto, pedidos, clientes e métricas.
- Frontend já possui páginas para os módulos principais.
- Há inconsistência de contrato (`/products` direto vs `/api/admin/*`) e validações incompletas.

## 3. Lacunas identificadas
- Navegação ainda inclui `Venda Assistida` (fora de escopo desta fase).
- Falta padronização de autorização admin em todas as bordas de API/admin.
- Listagens com paginação frágil e filtros parcialmente feitos no client.
- Regra de limite de imagens não era aplicada no backend.
- Exibição operacional de pagamento em pedidos incompleta.
- Contrato de cliente com risco para `name` nulo.

## 4. Estrutura recomendada de rotas admin
- `/admin`
- `/admin/products`
- `/admin/products/new`
- `/admin/products/[id]`
- `/admin/orders`
- `/admin/orders/[id]`
- `/admin/customers`
- `/admin/customers/[id]`
- `/admin/assisted-sale` permanece existente, mas oculto da navegação nesta fase.

## 5. Planejamento do módulo Products
- Padronizar consumo em `/api/admin/products*`.
- Fechar create/edit com consistência de variantes.
- Garantir upload múltiplo, reorder, remoção e imagem principal.
- Aplicar limite de 10 imagens também no backend.
- Manter fluxo de arquivar/desarquivar e exclusão com confirmação e feedback.

## 6. Planejamento do módulo Orders
- Listagem com filtros de status e período alinhados ao backend.
- Detalhe com status, itens, totais, frete e pagamento.
- Atualização de status manual respeitando transições válidas.
- Mensagens claras para transições inválidas e erros.

## 7. Planejamento do módulo Customers
- Lista com busca e paginação estável.
- Detalhe com dados básicos e histórico de pedidos.
- Tratamento null-safe para campos opcionais.

## 8. Planejamento do Dashboard
- Métricas operacionais básicas (pedidos, vendas, produtos ativos, clientes).
- Atalhos coerentes com escopo atual.
- Remover atalhos para módulo adiado.

## 9. Dependências de backend
- Endpoints admin com `require_admin`.
- Filtros de listagem de pedidos por período.
- Regra de limite de imagens por produto no backend.
- Contratos estáveis para consumo do frontend admin.

## 10. Dependências de frontend
- Uso exclusivo de `/api/admin/*` no admin.
- Tratamento uniforme de loading/erro/sucesso.
- Navegação sem módulos fora de escopo.
- Mensagens operacionais claras em ações críticas.

## 11. Mudanças de modelo de dados
- Sem migração estrutural obrigatória para concluir a fase.
- Ajustes de contrato/schemas para refletir nulabilidade real de campos de cliente.
- Regras de domínio aplicadas no backend (limite de imagens) sem alterar esquema SQL.

## 12. Regras de UX/UI do admin
- Sem redesign amplo nesta fase.
- Fluxos com feedback explícito (sucesso/erro).
- Confirmação obrigatória para ações destrutivas.
- Navegação previsível lista ↔ detalhe.

## 13. Backlog priorizado por fases
1. Fundação: contratos admin + autorização + remoção de escopo adiado.
2. Products: fechamento operacional completo.
3. Orders: fechamento operacional com pagamento/frete/status.
4. Customers: fechamento operacional com histórico.
5. Dashboard + regressão final.

## 14. Ordem recomendada de implementação
1. Fundação técnica (auth/contratos/navegação).
2. Products.
3. Orders.
4. Customers.
5. Dashboard e estabilização final.

## 15. Riscos e pontos de atenção
- Regressão por contratos mistos de API.
- Divergência de autorização entre camadas.
- Falhas parciais em upload/reordenação de imagens.
- Instabilidade de testes E2E por fluxo de autenticação externo.

## 16. Critérios de aceite por módulo
- **Admin Shell**: acesso restrito a admin; menu apenas com módulos do escopo.
- **Products**: list/create/edit/imagens/arquivar/excluir funcionando com feedback claro.
- **Orders**: list/detalhe/status com dados de pagamento e frete visíveis.
- **Customers**: list/detalhe/histórico funcionais e null-safe.
- **Dashboard**: métricas e atalhos operacionais consistentes.

## 17. Hardening de QA da fase (execução real)
Validação executada após implementação principal do admin mínimo operacional.

### 17.1 Correções de bloqueio de teste
- Corrigido `frontend/tests/product-images.spec.ts` para usar `Response` do Playwright (`@playwright/test`) em vez do tipo DOM.
- Resultado: `npm exec -- tsc --noEmit` em `frontend/` passou sem erros.

### 17.2 Backend (testes relevantes da fase)
- Execução em container efêmero (ambiente isolado):
  - `tests/test_admin_product_images.py`
  - `tests/test_orders_shipping_persistence.py`
- Resultado consolidado: `6 passed`.
- Ajuste de ambiente usado: instalação pontual de `pytest` apenas no container efêmero de teste (sem alteração estrutural do produto).

### 17.3 Smoke E2E admin (Playwright)
- Execução de smoke mínimo cobrindo os módulos críticos:
  - Dashboard: `dashboard loads with metrics cards`
  - Products: `products list page loads with table`
  - Customers: `customers list page loads`
  - Orders: `orders list page loads`
- Resultado consolidado: `4 passed`.

### 17.4 Pendências remanescentes
- Não foi executada suíte E2E completa do admin nesta rodada; apenas smoke focal.
- `npm run lint` completo do frontend ainda contém itens preexistentes fora do escopo desta fase.
