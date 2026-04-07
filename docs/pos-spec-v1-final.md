# Frente de Caixa Móvel — Especificação Final v1

> Versão: 1.1 | Data: 2026-04-07
> Status: **CONGELADA** — pronta para execução técnica

---

## 1. Veredito do Plano Anterior

### O que está correto e se mantém

- `Order` como entidade central — correto, mantido
- `source="pos"` como novo canal — correto, mantido
- `delivery_method="pickup"` para POS — correto, mantido (ver 2.6 para justificativa revisada)
- `discount_cents` no `Order` — correto, mantido (ver 2.7 para validações explícitas)
- `operator_id` + `operator_name` — correto, mantido (ver 2.8 para política de nome revisada)
- Providers `"cash"` e `"external_card"` no `Payment` — correto, mantido
- Reaproveitamento total de Product, Customer, OrderItem, Payment, Webhook — correto
- Layout isolado `/pos` sem sidebar do admin — correto, mantido
- PIX via Mercado Pago reutilizando infraestrutura existente — correto
- `expires_at=None` para pagamento manual — correto
- `expires_at=now+30min` para PIX — correto
- Carrinho POS em estado local do frontend (não persiste no servidor) — correto

### O que foi corrigido na v1.0 → v1.1

1. **Validações explícitas de desconto e pagamento em dinheiro** adicionadas ao schema e ao service
2. **Justificativa de `pickup`** reescrita como decisão pragmática de compatibilidade, sem otimismo semântico
3. **Política de `operator_name`** refinada: prioridade `name` > `preferred_username` > `email`
4. **Rotas internas do frontend POS** desbloqueadas — implementação pode ser SPA com máquina de estados ou subrotas
5. **`GET /pos/products` removido** — frontend usa `GET /products` existente diretamente
6. **Linguagem de migration** suavizada para refletir escopo do desenho v1, não promessa de unicidade absoluta

### Decisões que permanecem travadas

Todas as decisões das seções 2 a 5 são finais para v1 e não devem ser reabertas durante a implementação.

---

## 2. Decisões Finais Congeladas para v1

### 2.1 Nome final do canal

**Decisão: `"pos"`**

`"pos_mobile"` é redundante — toda Frente de Caixa neste sistema será mobile. Se no futuro existir um POS de desktop, o discriminador correto seria `device_type`, não o canal. O canal é o negócio, não o dispositivo. `"pos"` é curto, inequívoco e alinhado com terminologia de mercado.

---

### 2.2 Fluxo final de pagamento manual (cash / external_card)

**Decisão: fluxo lógico único — criação e pagamento em uma única chamada de API.**

Para `cash` e `external_card`, o endpoint `POST /pos/orders` recebe o `payment_method` junto com os itens. O backend cria o pedido, decrementa estoque e registra o pagamento na mesma transação de banco. O pedido nasce com `status="paid"` diretamente — nunca fica `"pending"`.

| Critério | Dois passos (rejeitado) | Fluxo único (adotado) |
|---|---|---|
| Janela de inconsistência | Sim (pedido pending sem pagamento) | Não |
| Chamadas de rede | 2 | 1 |
| Rollback em erro | Mais complexo | Transação única |
| Complexidade no frontend | Alta (gerenciar order_id entre etapas) | Baixa |

**Exceção: PIX.** Mantém dois passos porque o pagamento é assíncrono. O pedido é criado com `status="pending"` e o QR é retornado. O estado muda quando o webhook confirma.

---

### 2.3 Política final de cliente opcional

**Decisão: criar `Customer` somente se houver telefone. Nunca criar cliente sem dado de contato.**

| Dados fornecidos | Comportamento |
|---|---|
| `customer_phone` presente | Upsert de `Customer` (busca por phone, cria se não existe). `customer_id` vinculado. |
| `customer_name` sem phone | Salvar `customer_name` no `Order`. `customer_id = null`. Sem registro em `customers`. |
| Nenhum dado | `customer_name = null`, `customer_id = null`. Venda anônima. |

**Por que telefone como discriminador:** Nome sem contato é inútil para histórico (três "Marias" são indistinguíveis). Telefone é o identificador real em comércio local. Upsert por telefone já é suportado pelo serviço existente.

---

### 2.4 Política final de estoque por método de pagamento

| Cenário | Reserva | Confirmação | Risco |
|---|---|---|---|
| **PIX** | Na criação do pedido | Webhook MP `approved` | Baixo: job existente cancela e libera em 30min |
| **cash** | Na criação (transação única) | Mesmo ato — nasce `paid` | Zero |
| **external_card** | Na criação (transação única) | Mesmo ato — nasce `paid` | Zero |

O carrinho vive no `useState` do frontend. Estoque só é afetado ao criar o pedido. Nenhuma pré-reserva de carrinho no servidor.

---

### 2.5 Estratégia final do PIX (polling)

**Decisão: polling via `GET /pos/orders/{id}` — frontend lê estado, não dispara ação.**

1. `POST /pos/orders` → recebe `order_id` + QR code
2. Frontend faz poll `GET /pos/orders/{id}` a cada 4s enquanto `status == "pending"`
3. Webhook do MP atualiza `order.status = "paid"` no banco
4. Próximo poll detecta `status == "paid"` → sucesso exibido

`POST /payments/mercado-pago/sync` é fallback — acionado apenas pelo vendedor via botão "Verificar pagamento" após timeout, não no loop principal.

**Parâmetros:**
- Intervalo: 4s
- Timeout: 25 minutos (margem de 5min antes do `expires_at`)
- Cleanup: cancelar loop no `useEffect` cleanup (unmount / início de nova venda)

---

### 2.6 `delivery_method` no POS

**Decisão: manter `"pickup"` no MVP. Não criar novo valor de enum.**

Esta é uma simplificação pragmática por compatibilidade com o modelo atual, não uma decisão semântica perfeita. Existe imprecisão real entre "retirada agendada em loja" (que Venda Assistida com pickup representa) e "entrega imediata no balcão" (que POS representa). No contexto operacional, essa distinção é resolvida pela combinação `source="pos"` com `delivery_method="pickup"` — qualquer query que precise separar esses casos já tem o discriminador correto no `source`.

O custo de adicionar `"in_person"` ou `"carryout"` agora seria: migration, atualização de queries existentes, e um valor de enum sem benefício operacional imediato no MVP. Não vale.

Se no futuro essa distinção precisar virar dado de primeira classe (ex: relatório de "retiradas agendadas vs. vendas no balcão"), o caminho correto é adicionar o novo valor ao enum com migration controlada — não remendar o MVP.

---

### 2.7 Auditoria de desconto

**Decisão: somente `discount_cents` (valor fixo em centavos). Sem tipo, sem motivo, sem percentual no MVP.**

**Único campo adicionado:** `discount_cents INT NOT NULL DEFAULT 0`

**Validações obrigatórias no backend (schema + service):**
- `discount_cents >= 0` — sem desconto negativo
- `discount_cents <= subtotal_cents` — desconto não pode exceder o valor dos itens

O operador que aplicou o desconto é rastreável via `operator_id` + `operator_name`. Isso é suficiente para o MVP.

---

### 2.8 Operador da venda

**Decisão: persistir `operator_id` (sub do JWT) e `operator_name` com prioridade de legibilidade humana.**

- `operator_id`: claim `sub` do token Keycloak — identificador técnico estável e imutável
- `operator_name`: extraído na seguinte ordem de prioridade:
  1. `name` (nome completo do perfil Keycloak, ex: "Ana Lima") — primeira escolha
  2. `preferred_username` (shortname do Keycloak, ex: "ana.lima") — fallback
  3. `email` — último recurso, apenas se os anteriores estiverem ausentes

`operator_name` é armazenado desnormalizado para evitar roundtrip ao Keycloak na leitura de pedidos. Ambos os campos são extraídos pelo middleware de auth existente a partir dos claims do JWT.

Nenhuma tabela `operators` separada — Keycloak é a fonte de verdade de usuários.

---

## 3. Arquitetura Final

### 3.1 Entidades reaproveitadas (sem alteração de schema)

| Entidade | Arquivo | Papel no POS |
|---|---|---|
| `Product` / `ProductVariant` | `models/product.py` | Catálogo, preço, dimensões |
| `Customer` | `models/customer.py` | Upsert por telefone (opcional) |
| `OrderItem` | `models/order.py` | Itens do carrinho |
| `Payment` | `models/payment.py` | Registro de pagamento (novos providers) |
| `MercadoPagoClient` | `integrations/mercado_pago.py` | PIX — 100% reaproveitado |
| `sync_order_with_payment_status()` | `services/inventory.py` | Transição pending→paid |
| Webhook `/webhooks/mercado-pago` | `api/webhooks.py` | Confirmação PIX — inalterado |

### 3.2 Entidade modificada: `Order`

Neste desenho v1, a alteração de schema prevista são três novos campos na tabela `orders`:

```python
# backend/app/models/order.py
discount_cents: Mapped[int] = mapped_column(
    Integer, nullable=False, default=0, server_default="0"
)
operator_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
operator_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
```

Fórmula do total (atualizada):
```
total_cents = subtotal_cents - discount_cents + shipping_cents
```

Para pedidos não-POS: `discount_cents = 0` (default). Sem impacto nos fluxos existentes.

### 3.3 Entidade modificada: `Payment` (apenas novos valores de provider)

Nenhuma alteração de schema. Novos valores aceitos para `provider`:
- `"cash"` — dinheiro
- `"external_card"` — cartão via maquininha externa

O schema aceita qualquer `String(50)`; os novos valores são usados apenas pelo `pos_service.py`.

### 3.4 Novos arquivos backend

```
backend/app/
  schemas/pos.py           ← PosOrderCreate, PosOrderResponse
  api/pos.py               ← router /pos (POST /pos/orders, GET /pos/orders/{id})
  services/pos_service.py  ← create_pos_order() — lógica de negócio POS
```

### 3.5 Endpoints do POS

```
POST  /pos/orders
      Auth: admin
      Body: PosOrderCreate
      Retorno: PosOrderResponse
      Comportamento:
        - cash / external_card → cria pedido + pagamento em transação única → status="paid"
        - pix → cria pedido status="pending" → retorna QR code + order_id

GET   /pos/orders/{order_id}
      Auth: admin
      Retorno: OrderRead com status atual do pedido e pagamento
      Uso: polling de status PIX pelo frontend
```

**Catálogo de produtos no POS:** o frontend usa diretamente `GET /products?active=true&search=<termo>`, o endpoint público já existente. Não há `/pos/products`. Criar um endpoint específico seria duplicar superfície de API sem nenhum comportamento novo — o endpoint existente já suporta busca por nome/SKU e filtro `active=true`, que é exatamente o que o POS precisa.

**Não há `POST /pos/orders/{id}/pay` separado.** O pagamento é parte do `POST /pos/orders` para métodos síncronos. Para PIX, o QR é retornado no próprio `POST /pos/orders`.

### 3.6 Service: `pos_service.py`

```python
async def create_pos_order(
    db: AsyncSession,
    payload: PosOrderCreate,
    operator_id: str,
    operator_name: str,
) -> PosOrderResponse:
    """
    Validações iniciais (antes de qualquer persistência):
      - discount_cents >= 0
      - discount_cents <= subtotal calculado dos itens
      - se method="cash": amount_received_cents obrigatório e >= total_cents

    Para cash/external_card (transação única):
      1. Valida itens e estoque (SELECT FOR UPDATE)
      2. Upsert customer se customer_phone fornecido
      3. Cria Order(source="pos", status="paid", expires_at=None, operator_*)
      4. Cria OrderItems, decrementa estoque
      5. Cria Payment(provider=method, status="approved", external_id=None)
      6. Commit
      7. Retorna PosOrderResponse (com change_cents se cash)

    Para pix:
      1. Valida itens e estoque (SELECT FOR UPDATE)
      2. Upsert customer se customer_phone fornecido
      3. Cria Order(source="pos", status="pending", expires_at=now+30min, operator_*)
      4. Cria OrderItems, decrementa estoque
      5. Chama MercadoPagoClient.create_pix_payment()
         (usa email de fallback configurado se cliente não tem email)
      6. Cria Payment(provider="mercado_pago", status="pending", external_id=mp_id)
      7. Commit
      8. Retorna PosOrderResponse com pix_qr_code, pix_qr_code_base64
    """
```

Reutiliza:
- `_reserve_inventory()` de `services/orders.py`
- `upsert_customer()` de `services/orders.py`
- `MercadoPagoClient.create_pix_payment()` de `integrations/mercado_pago.py`
- `sync_order_with_payment_status()` de `services/inventory.py`

### 3.7 Separação POS vs Venda Assistida

| Aspecto | Venda Assistida | Frente de Caixa |
|---|---|---|
| Rota backend | `/admin/orders` | `/pos/orders` |
| Rota frontend | `/admin/assisted-sale` | `/pos` |
| Layout | Admin shell (sidebar + header) | Fullscreen isolado |
| `source` | `admin_assisted` | `pos` |
| Frete | Sim | Nunca |
| Cliente | Obrigatório | Opcional |
| Pagamento | Link MP assíncrono | PIX QR ou manual síncrono |
| Desconto | Não | Sim |
| Operador registrado | Não | Sim |

### 3.8 Frontend — layout isolado

O que está travado:
- Existe uma rota raiz `/pos` com layout próprio, sem `AdminLayoutClient`
- O layout verifica autenticação (Keycloak) e renderiza fullscreen, mobile-first, sem sidebar
- O link "Frente de Caixa" na sidebar do admin aponta para `/pos`

O que está aberto para o implementador:

A navegação interna do POS pode ser implementada de duas formas igualmente válidas:

**Opção A — SPA com máquina de estados local** (preferida para evitar perda de estado durante polling PIX)
```
/pos/layout.tsx
/pos/page.tsx     ← todo o fluxo gerenciado via useState/useReducer interno
```

**Opção B — subrotas internas**
```
/pos/layout.tsx
/pos/page.tsx           ← carrinho + produtos
/pos/checkout/page.tsx  ← revisão + pagamento
/pos/pix/page.tsx       ← QR + polling
/pos/success/page.tsx   ← confirmação
```

Ambas são aceitáveis. A decisão fica com o implementador, com a única restrição de que o estado do carrinho não pode ser perdido durante a transição para a tela de PIX.

---

## 4. Fluxos Finais

### 4.1 POS com PIX

```
1.  Vendedor acessa /pos (autenticado via Keycloak)
2.  Busca produto via GET /products?active=true&search=... → seleciona variante → adiciona ao carrinho
3.  Repete para mais itens; ajusta quantidades
4.  [Opcional] aplica desconto em R$ (campo numérico)
5.  [Opcional] informa nome + telefone do cliente
6.  Toca "Cobrar com PIX"
7.  Frontend → POST /pos/orders { items, discount_cents, customer_name?, customer_phone?,
                                   payment_method="pix", payer_cpf? }
8.  Backend (transação):
      a. Valida: discount_cents >= 0 e <= subtotal
      b. Valida estoque (SELECT FOR UPDATE)
      c. Upsert customer se phone fornecido
      d. Cria Order(source="pos", status="pending", expires_at=now+30min, operator_*)
      e. Cria OrderItems, decrementa estoque
      f. Chama MP.create_pix_payment() (email de fallback se anônimo)
      g. Cria Payment(provider="mercado_pago", status="pending")
      h. Commit
9.  Retorna: order_id, total_cents, pix_qr_code, pix_qr_code_base64
10. Frontend exibe QR grande + copia-cola
11. Cliente escaneia com app do banco
12. Webhook MP → backend: Payment + Order → "paid"
13. Frontend faz poll GET /pos/orders/{id} a cada 4s
14. Ao detectar status="paid" → exibe sucesso + "Nova Venda"

Timeout: após 25min sem confirmação → "PIX não confirmado" + botão "Verificar pagamento"
         (botão chama POST /payments/mercado-pago/sync como fallback)
Expiração: job existente cancela o pedido nos 30min e libera estoque
```

### 4.2 POS com Dinheiro

```
1-5. Igual — montar carrinho, desconto, cliente opcional
6.  Toca "Cobrar com Dinheiro"
7.  Tela exibe total + campo "Valor recebido" (teclado numérico automático)
8.  Frontend valida: amount_received >= total (botão confirmar desabilitado se menor)
9.  Troco calculado em tempo real no frontend
10. Vendedor confirma "Receber"
11. Frontend → POST /pos/orders { items, discount_cents, customer_*, payment_method="cash",
                                   amount_received_cents }
12. Backend (transação):
      a. Valida: discount_cents >= 0 e <= subtotal
      b. Valida: amount_received_cents >= total_cents (erro 422 se não atender)
      c. Valida estoque
      d. Upsert customer se phone
      e. Cria Order(source="pos", status="paid", expires_at=None, operator_*)
      f. Cria OrderItems, decrementa estoque
      g. Cria Payment(provider="cash", status="approved")
      h. Commit — pedido nasce PAID
13. Retorna: order, change_cents = amount_received - total
14. Frontend exibe: "Venda registrada! Troco: R$ X,XX"
```

### 4.3 POS com Cartão Externo

```
1-5. Igual
6.  Toca "Cartão (maquininha)"
7.  Tela: "Passe o cartão na maquininha. Valor: R$ X,XX" + [Confirmar recebimento]
8.  Vendedor processa na maquininha fisicamente
9.  Toca "Confirmar"
10. Frontend → POST /pos/orders { items, discount_cents, customer_*, payment_method="external_card" }
11. Backend (transação):
      a. Valida: discount_cents >= 0 e <= subtotal
      b. Valida estoque
      c. Upsert customer se phone
      d. Cria Order(source="pos", status="paid", expires_at=None, operator_*)
      e. Cria OrderItems, decrementa estoque
      f. Cria Payment(provider="external_card", status="approved")
      g. Commit — pedido nasce PAID
12. Frontend exibe: "Venda registrada!"
```

### 4.4 Venda Assistida (contraste)

```
1.  Vendedor acessa /admin/assisted-sale (dentro do shell admin, com sidebar)
2.  Identifica cliente OBRIGATORIAMENTE (nome + email ou telefone)
3.  Adiciona produtos
4.  Seleciona delivery: envio ou retirada
5.  Se envio: CEP → cotação → seleciona serviço → preenche endereço
6.  POST /admin/orders { source="admin_assisted", customer, items, shipping }
7.  Gera preferência MP → link de pagamento
8.  Envia link ao cliente (WhatsApp, email)
9.  Cliente paga horas/dias depois → webhook confirma → status="paid"
10. Admin acompanha em /admin/orders
```

---

## 5. Modelo de Dados Final

### `orders` — campos novos em destaque

```
id                    UUID         PK
status                VARCHAR(50)  [pending, paid, shipped, delivered, cancelled]
source                VARCHAR(30)  ["storefront", "admin_assisted", "pos"]  ← pos é novo
delivery_method       VARCHAR(20)  ["shipping", "pickup"]  ← POS sempre "pickup"
customer_id           INT          FK nullable
customer_name         VARCHAR(255) nullable
customer_email        VARCHAR(255) nullable
customer_phone        VARCHAR(40)  nullable
subtotal_cents        INT
discount_cents        INT          DEFAULT 0  ← NOVO | constraint: 0 <= discount <= subtotal
shipping_cents        INT          DEFAULT 0
total_cents           INT          = subtotal - discount + shipping
operator_id           VARCHAR(255) nullable   ← NOVO | sub claim do JWT
operator_name         VARCHAR(255) nullable   ← NOVO | name > preferred_username > email do JWT
expires_at            TIMESTAMPTZ  nullable   (null para cash/card, now+30min para pix)
inventory_released_at TIMESTAMPTZ  nullable
created_at            TIMESTAMPTZ
[campos shipping_* inalterados, sempre null para POS]
```

### `payments` — sem alteração de schema

```
id                UUID         PK
order_id          UUID         FK → orders.id
provider          VARCHAR(50)  ["mercado_pago", "cash", "external_card"]  ← cash/external_card novos
status            VARCHAR(50)  ["pending", "approved", ...]
external_id       VARCHAR(255) nullable  (null para cash/external_card)
external_reference VARCHAR(255) nullable
created_at        TIMESTAMPTZ
```

### Schemas POS — `backend/app/schemas/pos.py`

```python
class PosOrderItemCreate(BaseModel):
    variant_id: UUID
    quantity: int = Field(ge=1)

class PosOrderCreate(BaseModel):
    items: list[PosOrderItemCreate] = Field(min_length=1)
    discount_cents: int = Field(default=0, ge=0)  # validação de upper bound no service
    customer_name: str | None = Field(default=None, max_length=255)
    customer_phone: str | None = Field(default=None, max_length=40)
    payment_method: Literal["pix", "cash", "external_card"]
    payer_cpf: str | None = None                    # opcional, apenas para pix
    amount_received_cents: int | None = None        # obrigatório e >= total se method="cash"

    @model_validator(mode="after")
    def validate_cash_fields(self) -> "PosOrderCreate":
        if self.payment_method == "cash":
            if self.amount_received_cents is None:
                raise ValueError("amount_received_cents é obrigatório para pagamento em dinheiro")
        return self

class PosOrderResponse(BaseModel):
    order: OrderRead
    change_cents: int | None = None         # apenas cash
    pix_qr_code: str | None = None          # apenas pix
    pix_qr_code_base64: str | None = None   # apenas pix
```

**Validações no service** (após cálculo do subtotal):
```python
if payload.discount_cents > subtotal_cents:
    raise HTTPException(422, "Desconto não pode exceder o subtotal do pedido")

if payload.payment_method == "cash":
    if payload.amount_received_cents < total_cents:
        raise HTTPException(422, "Valor recebido insuficiente para cobrir o total")
```

### Migration Alembic

```python
# Neste desenho v1, a alteração de schema prevista é a adição de três campos na tabela orders
op.add_column('orders', sa.Column('discount_cents',  sa.Integer(),    nullable=False, server_default='0'))
op.add_column('orders', sa.Column('operator_id',     sa.String(255),  nullable=True))
op.add_column('orders', sa.Column('operator_name',   sa.String(255),  nullable=True))
```

Nenhuma alteração em `payments`, `products`, `customers` ou demais tabelas.

---

## 6. Backlog Final de Implementação

### Sprint 1 — Fundação backend

| # | Tarefa | Arquivo(s) |
|---|---|---|
| 1 | Migration: `discount_cents`, `operator_id`, `operator_name` em `orders` | `alembic/versions/xxxx_pos_fields.py` |
| 2 | Atualizar `Order` model com os 3 campos | `models/order.py` |
| 3 | Atualizar `OrderRead` schema para expor campos novos | `schemas/orders.py` |
| 4 | Criar `schemas/pos.py` com `PosOrderCreate` (com validadores) e `PosOrderResponse` | novo arquivo |
| 5 | Criar `services/pos_service.py` com `create_pos_order()` | novo arquivo |
| 6 | Criar `api/pos.py` com `POST /pos/orders` e `GET /pos/orders/{id}` | novo arquivo |
| 7 | Registrar router `/pos` no `main.py` | `app/main.py` |
| 8 | Testes: `tests/test_pos_flow.py` cobrindo cash, external_card, pix (mock MP) e validações | novo arquivo |

### Sprint 2 — Frontend POS

| # | Tarefa | Arquivo(s) |
|---|---|---|
| 9 | `frontend/app/pos/layout.tsx` — auth guard, fullscreen, sem `AdminLayoutClient` | novo arquivo |
| 10 | Implementar UX do POS (SPA state machine ou subrotas — decisão do implementador) | `app/pos/` |
| 11 | Busca de produtos via `GET /products?active=true&search=...` (endpoint existente) | dentro do componente |
| 12 | Carrinho local com quantidade, remoção e desconto em R$ | estado interno |
| 13 | Tela PIX: QR + copia-cola + polling `GET /pos/orders/{id}` + fallback de sync | dentro do componente |
| 14 | Telas cash e external_card conforme fluxos 4.2 e 4.3 | dentro do componente |
| 15 | Tela sucesso + "Nova Venda" (reset estado) | dentro do componente |
| 16 | `frontend/lib/api.ts` — adicionar `createPosOrder()`, `getPosOrder()` | `lib/api.ts` |
| 17 | `AdminSidebar.tsx` — adicionar link "Frente de Caixa" → `/pos` | `components/admin/AdminSidebar.tsx` |

### Sprint 3 — Validação

| # | Tarefa |
|---|---|
| 18 | Teste E2E: fluxo PIX em ambiente de produção com pagamento real |
| 19 | Teste manual: 375px width, iPhone SE baseline, fluxos completos |
| 20 | Validar `source="pos"` no filtro de pedidos do admin |
| 21 | Validar decremento de estoque e comportamento do job de expiração com pedidos POS |

---

## 7. Riscos Remanescentes

### Risco 1 — PIX em produção vs sandbox (ALTO)
Webhooks do sandbox Mercado Pago são inconsistentes. O fluxo de PIX deve ser testado com pagamento real antes do lançamento. **Mitigação:** critério de aceite inclui teste de PIX em produção (ver seção 8).

### Risco 2 — Email obrigatório no Mercado Pago para PIX (MÉDIO)
A API do MP exige `payer_email`. No POS, o cliente pode ser anônimo. **Mitigação:** variável de ambiente `POS_FALLBACK_EMAIL` configurada com email da loja. O CPF continua opcional.

### Risco 3 — Estoque negativo em condição de corrida (BAIXO)
Dois vendedores comprando o último item simultaneamente. **Mitigação existente:** `SELECT FOR UPDATE` no service de orders. Inalterado.

### Risco 4 — Perda de estado do carrinho por navegação acidental (BAIXO)
Se o vendedor navegar para fora de `/pos`, o carrinho (em `useState`) é perdido. **Mitigação MVP:** comportamento aceitável. Pós-MVP: `sessionStorage` como cache de carrinho.

### Risco 5 — Extração de claims do JWT no contexto do endpoint POS (BAIXO)
`operator_id` e `operator_name` precisam ser extraídos do token. **Mitigação:** usar o mesmo `Depends(get_current_user)` já implementado nos endpoints admin. Os claims `sub`, `name`, `preferred_username` e `email` já estão presentes no token Keycloak.

---

## 8. Recomendação Final Executiva

### Como implementar

1. **Sprint 1 (backend) antes de qualquer frontend.** Os 2 endpoints + 1 service são pequenos e testáveis isoladamente com `pytest`. Com API estável, o frontend não retrabalha por mudança de contrato.
2. **`pos_service.py` deve importar e chamar** funções existentes (`_reserve_inventory`, `upsert_customer`, `create_pix_payment`) — não reimplementar.
3. **Testar PIX em produção** com R$1,00 antes de abrir para o cliente. Isso deve ser critério de aceite explícito.
4. **Implementação do frontend** pode escolher SPA ou subrotas. Se escolher SPA: usar `useReducer` com estados `idle → cart → paying_pix → paying_manual → success`. Se escolher subrotas: garantir que o estado do carrinho sobrevive à navegação (via `Context` ou `sessionStorage`).

### O que evitar

- Criar `GET /pos/products` — usar `GET /products?active=true` existente
- Criar tabela `pos_sessions`, `pos_transactions` — `Order` cobre tudo
- Implementar desconto percentual — valor fixo é suficiente e mais simples
- Usar `POST /payments/mercado-pago/sync` como loop de polling — apenas como fallback manual
- Reutilizar `AdminLayoutClient` no `/pos` — o layout do POS é próprio e fullscreen
- Tornar cliente obrigatório — venda anônima é requisito

### O que não deve entrar nesta versão

- Abertura/fechamento de caixa
- Histórico do dia dentro do POS
- Impressão de comprovante
- Modo offline
- Permissões diferenciadas por operador
- Busca por câmera/código de barras
- PIX sem integração Mercado Pago
- Qualquer lógica fiscal

### Critério de done para v1

1. Venda com PIX: pedido gerado, estoque baixado, confirmação automática via webhook detectada pelo polling
2. Venda com dinheiro: pedido nasce `paid`, troco calculado, fluxo único sem etapa intermediária
3. Venda com cartão externo: pedido nasce `paid`, confirmação manual em 1 toque
4. Desconto aplicado: `total_cents` correto, `discount_cents > subtotal_cents` rejeitado com 422
5. `amount_received_cents < total_cents` rejeitado com 422 antes de criar qualquer pedido
6. Pedidos em `/admin/orders` filtráveis por `source="pos"`
7. Fluxo completo funciona em 375px sem scroll horizontal
8. PIX testado com pagamento real em produção e confirmado
