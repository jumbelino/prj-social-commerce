# Plano Completo: Frente de Caixa Movel / Venda Rapida

## Contexto

O Social Commerce hoje atende dois canais: **Loja Online** (storefront) e **Venda Assistida** (admin_assisted). Ambos compartilham a entidade Order como centro do dominio, com integracao Mercado Pago (PIX + checkout) e controle de estoque.

Comerciantes que vendem presencialmente em feiras, lojas fisicas e eventos nao tem como registrar vendas dentro do sistema. Usam maquininha ou Pix avulso, controlam manualmente, e perdem conciliacao entre venda, pagamento e estoque.

A **Frente de Caixa Movel** resolve isso: um terceiro canal de venda (`source="pos"`) que permite ao vendedor, pelo celular, montar uma venda rapida, fechar pagamento (PIX integrado, dinheiro ou cartao externo) e gerar um pedido nativo no sistema -- tudo com reaproveitamento maximo do backend existente.

---

## 1. Resumo Executivo

**Problema**: Vendas presenciais ficam fora do sistema. Sem conciliacao, sem controle de estoque, sem historico unificado.

**Por que canal separado**: A venda presencial tem ritmo, UX e requisitos diferentes da venda assistida (que e consultiva, remota, com frete e link de pagamento). Misturar os dois degradaria a experiencia de ambos.

**Menor recorte com maior valor**: Um fluxo mobile-first onde o vendedor adiciona itens, aplica desconto simples, fecha com PIX/dinheiro/cartao externo, e o pedido nasce no sistema com pagamento conciliado.

---

## 2. Delimitacao de Produto

### Loja Online (`source="storefront"`)
- Fluxo iniciado pelo **cliente**
- Catalogo publico -> carrinho -> checkout -> pagamento
- Frete obrigatorio (ou retirada)
- Cliente se identifica obrigatoriamente
- Pagamento via Mercado Pago (PIX ou cartao)

### Venda Assistida (`source="admin_assisted"`)
- Fluxo iniciado pelo **vendedor**, para venda **remota/consultiva**
- Identificacao do cliente obrigatoria (nome + contato)
- Frete ou retirada
- Gera link de pagamento para o cliente
- Venda assincrona -- o cliente paga depois
- Ideal para: WhatsApp, Instagram, atendimento indireto

### Frente de Caixa Movel (`source="pos"`)
- Fluxo iniciado e **concluido presencialmente** pelo vendedor
- Foco em velocidade operacional
- Cliente **opcional** (venda anonima permitida)
- Sem frete (sempre `delivery_method="pickup"`)
- Pagamento **imediato** no ato (PIX, dinheiro, cartao externo)
- Desconto simples no pedido
- Registro do operador que fez a venda
- Interface isolada, fullscreen, mobile-first

### Fronteiras claras

| Aspecto | Loja Online | Venda Assistida | Frente de Caixa |
|---|---|---|---|
| Quem inicia | Cliente | Vendedor | Vendedor |
| Presencial? | Nao | Nao | Sim |
| Cliente obrigatorio? | Sim | Sim | Nao |
| Frete? | Sim/Retirada | Sim/Retirada | Nunca |
| Pagamento | MP remoto | Link MP | PIX/Dinheiro/Cartao externo |
| Tempo de fechamento | Minutos-horas | Horas-dias | Segundos-minutos |
| UX | Catalogo web | Admin assistido | Caixa mobile |

### Fluxos que parecem parecidos mas NAO devem ser misturados

- **Venda Assistida com retirada** vs **Frente de Caixa**: Na assistida, mesmo com retirada, o pagamento e remoto (link). No caixa, tudo e presencial e imediato.
- **Checkout online com PIX** vs **Caixa com PIX**: No online o cliente opera sozinho. No caixa o vendedor gera o QR e o cliente escaneia na hora.

---

## 3. Escopo do MVP

### Obrigatorio (MVP)

- [ ] Iniciar venda rapida (tela dedicada `/pos`)
- [ ] Buscar e adicionar produtos/variantes ao carrinho
- [ ] Alterar quantidade (+/-)
- [ ] Remover item
- [ ] Desconto simples no pedido (% ou valor fixo em R$)
- [ ] Cliente opcional (nome + telefone)
- [ ] Fechar pagamento com **PIX integrado** (QR code via Mercado Pago existente)
- [ ] Fechar pagamento com **dinheiro** (registrar valor recebido, calcular troco)
- [ ] Fechar pagamento com **cartao externo** (confirmacao manual -- maquininha fora do sistema)
- [ ] Gerar pedido nativo (`source="pos"`, `delivery_method="pickup"`)
- [ ] Registrar operador (quem vendeu)
- [ ] Pedido visivel no admin com filtro `source=pos`
- [ ] Baixa de estoque no ato da venda
- [ ] Interface fullscreen, isolada do admin, mobile-first
- [ ] Link "Frente de Caixa" no menu admin

### Desejavel, pos-MVP

- Historico de vendas do dia dentro da propria tela POS
- Busca por codigo de barras / SKU com camera
- Atalhos de produtos favoritos / mais vendidos
- Relatorio de fechamento de caixa (total vendido por metodo)
- Registro de desconto com motivo
- Operador com permissoes diferenciadas (vendedor vs gerente)
- Impressao de comprovante (via share do navegador ou bluetooth)
- Offline parcial (fila de sincronizacao)

### Explicitamente fora

- Fiscal (NFC-e, SAT, DANFE)
- TEF (integracao direta com maquininha)
- Split payment (dois metodos no mesmo pedido)
- Multi-caixa robusto / terminais simultaneos
- Abertura/fechamento de caixa com sangria e suprimento
- Impressora termica
- Trocas e devolucoes avancadas
- Offline completo
- Regras promocionais complexas (compre 2 leve 3, cupom)
- Frete no fluxo POS

---

## 4. Proposta de Arquitetura

### 4.1 Entidades Reaproveitadas (sem alteracao)

| Entidade | Arquivo | Uso no POS |
|---|---|---|
| `Product` / `ProductVariant` | `backend/app/models/product.py` | Catalogo de itens |
| `Customer` | `backend/app/models/customer.py` | Cliente opcional (upsert existente) |
| `OrderItem` | `backend/app/models/order.py` | Itens do pedido POS |
| `Payment` | `backend/app/models/payment.py` | Registrar pagamento (PIX, cash, external_card) |

### 4.2 Entidade Modificada: Order

Tres novos campos na tabela `orders`:

```python
# backend/app/models/order.py
discount_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
operator_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
operator_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
```

- `discount_cents`: Valor absoluto do desconto em centavos. Formula: `total_cents = subtotal_cents - discount_cents + shipping_cents`. Para pedidos existentes e nao-POS, default=0 (inerte).
- `operator_id`: `sub` claim do JWT Keycloak (UUID string). Nullable porque storefront nao tem operador.
- `operator_name`: Nome legivel do operador (de `preferred_username` ou `email` do JWT). Armazenado para nao precisar consultar Keycloak na leitura.

### 4.3 Canal de Venda

Novo valor para `Order.source`: `"pos"`. O campo ja e String(30), sem enum no banco. Basta usar o novo valor no service.

### 4.4 Novos Providers de Pagamento

O `Payment.provider` (String(50)) aceita novos valores:
- `"cash"` -- pagamento em dinheiro
- `"external_card"` -- cartao processado em maquininha externa

Ambos terao `external_id=None` (nao ha sistema externo) e `status="approved"` (confirmacao imediata pelo operador).

A constraint `unique(provider, order_id)` garante no maximo um pagamento por provider por pedido. Como `"cash"`, `"external_card"` e `"mercado_pago"` sao providers distintos, nao ha conflito.

### 4.5 Separacao: Dominio Compartilhado vs Fluxos Especificos

```
Compartilhado (reutilizado):
  - ProductVariant (catalogo, preco, estoque)
  - Customer (upsert)
  - Order + OrderItem (entidade central)
  - Payment (registro de pagamento)
  - Inventory (reserva, liberacao, expiracao)
  - sync_order_with_payment_status()
  - Webhook Mercado Pago (PIX callback)
  - OrderRead schema (leitura unificada)
  - Admin order list com filtro source=

Especifico do POS (novo):
  - PosOrderCreate schema (sem shipping, com discount)
  - PosPaymentRequest schema (method: pix/cash/external_card)
  - create_pos_order() service
  - record_manual_payment() service
  - POST /pos/orders endpoint
  - POST /pos/orders/{id}/pay endpoint
  - Frontend /pos/* (layout isolado + UI)
```

### 4.6 PIX no POS

Reutiliza 100% da infraestrutura existente:
1. Pedido criado via `POST /pos/orders` com `source="pos"`
2. Pagamento PIX via `POST /pos/orders/{id}/pay` com `method="pix"` -- internamente chama a mesma logica de `create_pix_payment` do Mercado Pago
3. QR code retornado para o frontend exibir
4. Cliente escaneia e paga
5. Webhook do Mercado Pago atualiza o pagamento (mesma rota existente)
6. Frontend faz polling via `POST /payments/mercado-pago/sync` ate confirmar

### 4.7 Pagamentos Manuais

Novo service `record_manual_payment()` que:
1. Cria `Payment(provider="cash"|"external_card", status="approved", external_id=None)`
2. Chama `sync_order_with_payment_status(db, order, "approved")` -- reusa a transicao pending->paid
3. Pedido muda para status="paid" imediatamente

### 4.8 Expiracao de Pedidos POS

- **Dinheiro / Cartao externo**: `expires_at=None` (pagamento e imediato, nao faz sentido expirar)
- **PIX**: `expires_at=now+30min` (PIX e assincrono, precisa da mesma protecao de timeout existente)

---

## 5. Modelo de Dados Sugerido

### 5.1 Order (campos novos em destaque)

```
orders
------
id                          UUID PK
status                      VARCHAR(50)    [pending, paid, shipped, delivered, cancelled]
delivery_method             VARCHAR(20)    [shipping, pickup]  -- POS sempre "pickup"
source                      VARCHAR(30)    [storefront, admin_assisted, **pos**]
customer_id                 INT FK?        -- nullable (POS permite venda anonima)
customer_name               VARCHAR(255)?
customer_email              VARCHAR(255)?
customer_phone              VARCHAR(40)?
subtotal_cents              INT            -- soma dos itens
**discount_cents**          INT DEFAULT 0  -- desconto absoluto em centavos
shipping_cents              INT DEFAULT 0  -- POS sempre 0
total_cents                 INT            -- subtotal - discount + shipping
**operator_id**             VARCHAR(255)?  -- sub claim do JWT (quem vendeu)
**operator_name**           VARCHAR(255)?  -- nome legivel do operador
expires_at                  TIMESTAMPTZ?   -- null para cash/card POS, 30min para PIX
inventory_released_at       TIMESTAMPTZ?
created_at                  TIMESTAMPTZ
[... campos de shipping inalterados ...]
```

### 5.2 Payment (sem alteracao de schema)

```
payments
--------
id                UUID PK
order_id          UUID FK
provider          VARCHAR(50)  [mercado_pago, **cash**, **external_card**]
status            VARCHAR(50)  [pending, approved, rejected, ...]
external_id       VARCHAR(255)?  -- null para cash/external_card
external_reference VARCHAR(255)?
created_at        TIMESTAMPTZ
```

### 5.3 Enums / Valores

```python
# Source values (string, sem enum no DB)
"storefront"       # loja online
"admin_assisted"   # venda assistida
"pos"              # frente de caixa

# Payment providers (string)
"mercado_pago"     # PIX e cartao via MP
"cash"             # dinheiro
"external_card"    # cartao via maquininha externa

# Delivery methods (enum existente)
"shipping"         # envio
"pickup"           # retirada -- POS usa sempre este
```

### 5.4 Schemas POS (novos)

```python
# backend/app/schemas/pos.py

class PosOrderItemCreate(BaseModel):
    variant_id: UUID
    quantity: int = Field(ge=1)

class PosDiscount(BaseModel):
    type: Literal["percentage", "fixed"]
    value: int = Field(ge=0)  # 0-100 para %, centavos para fixed

class PosOrderCreate(BaseModel):
    items: list[PosOrderItemCreate] = Field(min_length=1)
    discount: PosDiscount | None = None
    customer_name: str | None = Field(default=None, max_length=255)
    customer_phone: str | None = Field(default=None, max_length=40)

class PosPaymentRequest(BaseModel):
    method: Literal["pix", "cash", "external_card"]
    payer_cpf: str | None = None              # apenas para PIX
    amount_received_cents: int | None = None   # apenas para dinheiro (calculo de troco)

class PosPaymentResponse(BaseModel):
    order: OrderRead
    payment_provider: str
    payment_status: str
    change_cents: int | None = None           # troco (apenas cash)
    pix_qr_code: str | None = None
    pix_qr_code_base64: str | None = None
```

### 5.5 Exemplo de Payload -- Criar Pedido POS

```json
POST /pos/orders
{
  "items": [
    {"variant_id": "550e8400-...", "quantity": 2},
    {"variant_id": "6ba7b810-...", "quantity": 1}
  ],
  "discount": {"type": "percentage", "value": 10},
  "customer_name": "Maria",
  "customer_phone": "11987654321"
}
```

Response: `OrderRead` com `source="pos"`, `discount_cents` calculado, `delivery_method="pickup"`.

### 5.6 Exemplo de Payload -- Pagar com Dinheiro

```json
POST /pos/orders/{order_id}/pay
{
  "method": "cash",
  "amount_received_cents": 10000
}
```

Response:
```json
{
  "order": { "id": "...", "status": "paid", "total_cents": 8500, ... },
  "payment_provider": "cash",
  "payment_status": "approved",
  "change_cents": 1500,
  "pix_qr_code": null,
  "pix_qr_code_base64": null
}
```

---

## 6. Fluxos Detalhados

### 6.1 Frente de Caixa com PIX

```
1. Vendedor abre /pos (interface fullscreen, mobile)
2. Busca produto por nome -> seleciona variante -> adiciona ao carrinho
3. Repete para mais itens; ajusta quantidades
4. (Opcional) Aplica desconto: 10% ou R$5,00
5. (Opcional) Informa nome/telefone do cliente
6. Toca "Pagamento" -> ve resumo com total
7. Seleciona "PIX"
8. Frontend chama POST /pos/orders (cria pedido pending, reserva estoque)
9. Frontend chama POST /pos/orders/{id}/pay com method="pix"
10. Backend chama Mercado Pago create_pix_payment (reusa integracao existente)
11. Retorna QR code + QR base64
12. Frontend exibe QR code grande na tela
13. Cliente escaneia com app do banco e paga
14. Backend recebe webhook do Mercado Pago -> atualiza payment e order para "paid"
15. Frontend faz polling via POST /payments/mercado-pago/sync
16. Ao detectar status="paid", exibe "Venda concluida!"
17. Vendedor toca "Nova Venda" -> estado reseta, pronto para proxima
```

**Caso de falha PIX**: Se o cliente nao paga em 30 min, `expires_at` aciona cancelamento automatico e libera estoque (mecanismo existente).

### 6.2 Frente de Caixa com Pagamento Manual

#### Dinheiro

```
1-6. Mesmo fluxo de montagem do carrinho
7. Seleciona "Dinheiro"
8. Frontend chama POST /pos/orders (cria pedido pending, reserva estoque, expires_at=null)
9. Tela mostra total e campo "Valor recebido" com teclado numerico
10. Vendedor digita valor recebido (ex: R$100,00)
11. Frontend calcula e exibe troco (ex: R$15,00)
12. Vendedor toca "Confirmar"
13. Frontend chama POST /pos/orders/{id}/pay com method="cash", amount_received_cents=10000
14. Backend cria Payment(provider="cash", status="approved")
15. Backend chama sync_order_with_payment_status -> order.status = "paid"
16. Retorna PosPaymentResponse com change_cents=1500
17. Frontend exibe "Venda concluida! Troco: R$15,00"
18. "Nova Venda" reseta
```

#### Cartao Externo (maquininha)

```
1-6. Mesmo fluxo
7. Seleciona "Cartao (maquininha)"
8. Frontend chama POST /pos/orders (cria pedido pending, expires_at=null)
9. Tela exibe: "Passe o cartao na maquininha. Valor: R$85,00"
10. Vendedor processa na maquininha fisicamente
11. Vendedor toca "Pagamento Confirmado"
12. Frontend chama POST /pos/orders/{id}/pay com method="external_card"
13. Backend cria Payment(provider="external_card", status="approved")
14. Backend sync -> order.status = "paid"
15. "Venda concluida!"
```

### 6.3 Venda Assistida (por que continua diferente)

```
1. Vendedor abre /admin/assisted-sale (dentro do admin, com sidebar)
2. Busca produto, seleciona variante, adiciona ao carrinho
3. Identifica cliente OBRIGATORIAMENTE (nome + email ou telefone)
4. Seleciona delivery_method: Envio ou Retirada
5. Se envio: informa CEP, calcula frete, seleciona servico, preenche endereco
6. Cria pedido (source="admin_assisted", com shipping)
7. Gera link de pagamento Mercado Pago (preference com redirect)
8. Envia link ao cliente por WhatsApp/email
9. Cliente paga quando puder (horas/dias depois)
10. Webhook confirma pagamento -> pedido muda para paid
11. Admin acompanha no painel de pedidos
```

**Diferencas fundamentais**:
- Cliente obrigatorio (contato necessario para enviar link)
- Frete possivel (endereco, cotacao, prazo)
- Pagamento remoto e assincrono (link, nao QR presencial)
- UX dentro do admin (contexto de gestao)
- Sem desconto (nao e negociacao presencial)

---

## 7. Estoque e Consistencia Operacional

### Quando baixar estoque

**No momento da criacao do pedido** (`POST /pos/orders`), identico ao fluxo existente. A funcao `create_order_from_payload` (e a nova `create_pos_order`) ja faz `variant.stock -= quantity` com lock `FOR UPDATE`.

### Reserva

Sim, o estoque e reservado (decrementado) imediatamente. Isso ja funciona assim e previne venda dupla do mesmo item.

### Pagamento pendente no PIX

- Pedido POS com PIX recebe `expires_at = now + 30min`
- Se o cliente nao paga, `expire_order_if_needed()` cancela e libera estoque
- Mesmo mecanismo ja testado no storefront/venda assistida

### Pagamento manual (cash/external_card)

- Pedido criado com `expires_at = None` (nao expira)
- Pagamento registrado imediatamente apos criacao -> status vira "paid"
- Janela entre criacao e pagamento e de segundos (operador tocando dois botoes)
- Risco de "pedido pendente esquecido" e minimo; se necessario, pode-se adicionar expires_at de 5min como safety net (pos-MVP)

### Como evitar complexidade

- NAO implementar reserva separada de "carrinho POS" -- o carrinho e local no frontend (useState), estoque so e afetado ao criar o pedido
- NAO implementar "pre-autorizacao" -- pagamento manual e tudo-ou-nada
- NAO implementar rollback parcial -- se o pagamento falha, o pedido fica pending e pode ser cancelado manualmente

---

## 8. UX / Experiencia no Celular

### Layout

- Rota `/pos` com layout proprio (sem sidebar, sem header admin)
- Fullscreen, fundo escuro neutro
- Barra superior minima: nome do operador + "Voltar ao Admin" + relogio/hora
- Conteudo ocupa 100% do viewport

### Tela principal (fase carrinho) -- mobile portrait

```
[Barra superior: Operador | Voltar ao Admin]
[Campo de busca de produto               ]
[Grid de resultados: cards 2 colunas      ]
[  Produto A  |  Produto B               ]
[  R$ 45,00   |  R$ 30,00               ]
[─────────────────────────────────────────]
[Carrinho: 3 itens                        ]
[  Camiseta P x2        R$ 90,00   [-][+]]
[  Bone único x1        R$ 30,00   [-][+]]
[─────────────────────────────────────────]
[Desconto: [10] [%|R$]                    ]
[─────────────────────────────────────────]
[Subtotal           R$ 120,00             ]
[Desconto            -R$ 12,00            ]
[TOTAL              R$ 108,00             ]
[                                         ]
[     [ PAGAMENTO  R$ 108,00 ]            ]  <-- botao grande, cor destaque
```

### Tela de pagamento

```
[Resumo: 3 itens | Total R$ 108,00       ]
[                                         ]
[    [ PIX ]                              ]  botao grande
[    [ DINHEIRO ]                         ]  botao grande
[    [ CARTAO (maquininha) ]              ]  botao grande
[                                         ]
[    [ Voltar ]                           ]
```

### Tela PIX

```
[Aguardando pagamento PIX                 ]
[Total: R$ 108,00                         ]
[                                         ]
[     [QR CODE grande]                    ]
[                                         ]
[  [Copiar codigo PIX]                    ]
[                                         ]
[  Verificando pagamento...               ]
[     [ Cancelar ]                        ]
```

### Tela Dinheiro

```
[Total: R$ 108,00                         ]
[                                         ]
[Valor recebido:                          ]
[  [ R$ 200,00 ]     <- input numerico    ]
[                                         ]
[Troco: R$ 92,00                          ]
[                                         ]
[     [ CONFIRMAR PAGAMENTO ]             ]
```

### Tela concluida

```
[                                         ]
[         Venda Concluida!                ]
[     Pedido #abc123-...                  ]
[     R$ 108,00 via PIX                   ]
[                                         ]
[     [ NOVA VENDA ]                      ]  botao grande
```

### Principios de UX

- **Poucos toques**: adicionar item = 1-2 toques (busca + tap no card). Se variante unica, adiciona direto.
- **Feedback imediato**: total atualiza em tempo real ao adicionar/remover
- **Touch targets grandes**: minimo 48px de altura nos botoes, 44px nos cards
- **Sem scroll horizontal**: tudo vertical, mobile-first
- **Sem modais desnecessarios**: desconto e inline, nao em popup
- **Cor de destaque no botao principal**: "PAGAMENTO" e o call-to-action mais importante
- **Estado de vazio**: quando carrinho vazio, mostra mensagem "Adicione produtos para iniciar"

### Erros comuns de UX a evitar

- NAO colocar campos de formulario obrigatorios antes de adicionar itens
- NAO pedir confirmacao para cada item adicionado
- NAO usar dropdown/select para variantes quando ha poucas opcoes (usar botoes)
- NAO mostrar campos de frete/endereco
- NAO esconder o total -- deve estar visivel o tempo todo
- NAO bloquear a tela durante busca -- mostrar skeleton/loading inline

---

## 9. Plano de Implementacao por Fases

### Fase 1: Backend Foundation

**Objetivo**: Toda a infraestrutura de backend pronta e testavel via curl/httpie.

**Entregas**:
1. Migration `20260406_0007_add_pos_fields.py` (discount_cents, operator_id, operator_name)
2. Atualizar `Order` model com 3 novos campos
3. Atualizar `OrderRead` schema com 3 novos campos
4. Criar `backend/app/schemas/pos.py` (PosOrderCreate, PosPaymentRequest, PosPaymentResponse)
5. Criar `create_pos_order()` em `backend/app/services/orders.py` -- reutiliza validacao de variantes, reserva de estoque, upsert de customer
6. Criar `record_manual_payment()` em `backend/app/services/payments.py`
7. Criar `backend/app/api/pos.py` com:
   - `POST /pos/orders` (cria pedido POS)
   - `POST /pos/orders/{order_id}/pay` (registra pagamento)
8. Registrar `pos_router` em `main.py`
9. Testes dos endpoints

**Dependencias**: Nenhuma (backend independente)

**Risco principal**: Refatorar `create_order_from_payload` para extrair helpers sem quebrar fluxos existentes. Mitigacao: extrair funcoes internas sem mudar a assinatura publica.

**Valor gerado**: API pronta para qualquer frontend consumir.

### Fase 2: Frontend Shell + API Layer

**Objetivo**: Estrutura de paginas, layout isolado e camada de API do frontend prontos.

**Entregas**:
1. Criar `frontend/app/pos/layout.tsx` (auth check + PosLayoutClient)
2. Criar `frontend/components/pos/PosLayoutClient.tsx` (layout fullscreen sem sidebar)
3. Criar `frontend/app/pos/page.tsx` (redirect para /pos/sale)
4. Criar `frontend/app/pos/sale/page.tsx` (server shell)
5. Criar rotas API proxy:
   - `frontend/app/api/pos/orders/route.ts`
   - `frontend/app/api/pos/orders/[id]/pay/route.ts`
6. Adicionar types e funcoes em `frontend/lib/api.ts`
7. Adicionar link "Frente de Caixa" no `AdminSidebar.tsx`

**Dependencias**: Fase 1 (endpoints backend)

**Risco principal**: Auth flow para rota fora do `/admin`. Mitigacao: usar mesmo padrao de `getServerSession` + `require_admin`.

**Valor gerado**: Navegacao funcional, auth verificada, requests fluindo.

### Fase 3: POS UI Completa

**Objetivo**: Interface de venda rapida funcional e utilizavel.

**Entregas**:
1. `frontend/app/pos/sale/client.tsx` -- componente principal com:
   - Busca de produtos com debounce
   - Grid de resultados com cards touch-friendly
   - Carrinho com +/- quantidade
   - Desconto (% ou fixo)
   - Cliente opcional
   - Fase "pagamento" com 3 botoes
   - Fluxo PIX (QR code + polling)
   - Fluxo dinheiro (input numerico + troco)
   - Fluxo cartao externo (confirmacao)
   - Tela "concluido" com reset
2. Teste end-to-end dos 3 fluxos de pagamento
3. Teste em mobile real (Chrome DevTools + dispositivo fisico)

**Dependencias**: Fases 1 e 2

**Risco principal**: Complexidade da UI em um unico componente. Mitigacao: separar em sub-componentes (PosCart, PosPayment, PosDone) se ficar grande demais, mas comecar monolitico e quebrar depois.

**Valor gerado**: Feature completa e utilizavel em producao.

---

## 10. Backlog Priorizado

### Epico: Frente de Caixa Movel MVP

| # | Tarefa | Fase | Prioridade | Justificativa |
|---|--------|------|------------|---------------|
| 1 | Migration: add discount_cents, operator_id, operator_name | 1 | P0 | Base para tudo |
| 2 | Atualizar Order model e OrderRead schema | 1 | P0 | Model precisa dos campos |
| 3 | Criar schemas POS (PosOrderCreate, PosPaymentRequest, PosPaymentResponse) | 1 | P0 | Contratos da API |
| 4 | Implementar create_pos_order() service | 1 | P0 | Core business logic |
| 5 | Implementar record_manual_payment() service | 1 | P0 | Pagamento cash/card |
| 6 | Criar POST /pos/orders endpoint | 1 | P0 | API de criacao |
| 7 | Criar POST /pos/orders/{id}/pay endpoint | 1 | P0 | API de pagamento |
| 8 | Registrar pos_router em main.py | 1 | P0 | Ativar rotas |
| 9 | Testes backend (orders + payments POS) | 1 | P0 | Garantia de qualidade |
| 10 | Criar layout POS fullscreen (frontend) | 2 | P0 | Shell da interface |
| 11 | Criar API proxies Next.js para POS | 2 | P0 | Auth + CORS |
| 12 | Adicionar types/funcoes POS em api.ts | 2 | P0 | Camada de dados |
| 13 | Link "Frente de Caixa" no AdminSidebar | 2 | P1 | Navegacao |
| 14 | UI: busca de produtos + grid | 3 | P0 | Adicionar itens |
| 15 | UI: carrinho com quantidades | 3 | P0 | Gerenciar itens |
| 16 | UI: desconto | 3 | P0 | Requisito MVP |
| 17 | UI: cliente opcional | 3 | P1 | Pode funcionar sem |
| 18 | UI: fluxo pagamento PIX | 3 | P0 | Pagamento principal |
| 19 | UI: fluxo pagamento dinheiro | 3 | P0 | Caso de uso essencial |
| 20 | UI: fluxo pagamento cartao externo | 3 | P0 | Caso de uso essencial |
| 21 | UI: tela concluido + nova venda | 3 | P0 | Ciclo completo |
| 22 | Teste end-to-end em mobile | 3 | P0 | Validacao real |

---

## 11. Criterios de Aceite do MVP

A Frente de Caixa Movel MVP esta pronta para uso real quando:

### Funcional

- [ ] Vendedor consegue acessar `/pos` pelo link no admin e ve interface fullscreen sem sidebar
- [ ] Vendedor consegue buscar produtos por nome e adicionar ao carrinho
- [ ] Vendedor consegue alterar quantidade e remover itens do carrinho
- [ ] Vendedor consegue aplicar desconto em % ou valor fixo, e o total atualiza corretamente
- [ ] Vendedor consegue fechar venda **sem identificar cliente** (venda anonima)
- [ ] Vendedor consegue fechar venda **com cliente** (nome + telefone)
- [ ] Pagamento PIX: QR code aparece, polling detecta pagamento, pedido muda para "paid"
- [ ] Pagamento dinheiro: valor recebido e registrado, troco calculado e exibido, pedido muda para "paid"
- [ ] Pagamento cartao externo: confirmacao manual registra pagamento, pedido muda para "paid"
- [ ] Pedido aparece em `/admin/orders` com `source=pos` e filtro funciona
- [ ] Estoque e decrementado ao criar pedido
- [ ] Operador (quem vendeu) e registrado no pedido
- [ ] Apos concluir venda, vendedor consegue iniciar nova venda com estado limpo
- [ ] Discount_cents nao pode ser maior que subtotal_cents (validacao server-side)

### Nao-funcional

- [ ] Interface funciona em smartphone (Chrome/Safari, tela 375px+)
- [ ] Busca de produto responde em < 500ms
- [ ] Criacao de pedido + pagamento manual em < 1s
- [ ] Nenhuma tela mostra sidebar do admin ou elementos de gestao
- [ ] Auth funciona (so admin autenticado acessa /pos)

---

## 12. Principais Riscos e Decisoes

### Riscos

| Risco | Impacto | Mitigacao |
|-------|---------|-----------|
| **Refatorar orders service quebra fluxos existentes** | Alto | Extrair helpers internos sem alterar `create_order_from_payload` signature. Testes existentes devem continuar passando. |
| **UX complexa em um componente** | Medio | Comecar monolitico, extrair sub-componentes se ultrapassar ~400 linhas. O `assisted-sale/client.tsx` tem ~340 linhas como referencia. |
| **PIX timeout no POS confunde vendedor** | Medio | UX clara de "expirado" com opcao de retry. Timer visivel na tela. |
| **Pagamento manual sem conciliacao real** | Baixo | Risco aceito no MVP. O operador e responsavel por confirmar. Pos-MVP: fechamento de caixa com totais. |
| **Desconto por % com arredondamento** | Baixo | Arredondar para baixo (floor). Desconto de 10% em R$99,90 = R$9,99 de desconto (999 centavos). |
| **Escopo creep** | Alto | Lista explicita de "fora do MVP" ja definida. Manter disciplina. |

### Decisoes a tomar agora

1. **`discount_cents` no Order e order-level, nao item-level** -- Correto para MVP. Desconto por item adiciona complexidade sem valor claro.
2. **Pagamentos manuais usam `Payment` existente com novos providers** -- Evita criar entidade separada. O modelo ja suporta.
3. **POS usa `create_pos_order()` separado, nao `create_order_from_payload()`** -- Evita poluir o service existente com condicionais de POS.
4. **Frontend POS e rota top-level `/pos`, nao `/admin/pos`** -- Layout isolado exige route group proprio.
5. **`operator_id` vem do JWT `sub` claim** -- Nao criar tabela de operadores. Keycloak ja e a fonte de verdade.

### Decisoes que podem ser postergadas

- Formato de exibicao do desconto (% vs R$) no admin de pedidos -- frontend concern
- Relatorio de fechamento de caixa -- pos-MVP
- Se `operator_id`/`operator_name` devem ser adicionados tambem na Venda Assistida -- util, mas nao bloqueia o MVP
- Suporte a multiplos descontos ou desconto por item -- so se surgir demanda real
- Offline/PWA -- complexidade enorme, postergar ate validar uso real

---

## 13. Recomendacao Final

### Arquitetura

Seguir a proposta acima: **3 novos campos no Order** + **2 novos endpoints** + **rota frontend isolada**. Maxima reutilizacao, minima superficie de mudanca.

### Escopo

O MVP descrito (21 tarefas) e o recorte correto. Resiste a tentacao de adicionar historico de vendas, fechamento de caixa ou busca por barcode na primeira entrega. Essas features sao valiosas mas nao bloqueiam o uso real.

### O que evitar

- NAO criar tabela `PosSession` ou `CashRegister` -- overengineering para o MVP
- NAO criar microservico separado para POS -- e um canal, nao um produto
- NAO reutilizar a tela de Venda Assistida -- os fluxos sao fundamentalmente diferentes
- NAO adicionar campo `payment_method` no Order -- o metodo fica no Payment (que ja existe)
- NAO implementar split payment (PIX + dinheiro no mesmo pedido) -- complexidade desproporcional

### Como lancar rapido

1. **Fase 1 (backend)**: 1-2 dias. Migration + service + endpoints. Testavel via curl.
2. **Fase 2 (frontend shell)**: 0.5 dia. Layout + proxies + types.
3. **Fase 3 (UI)**: 2-3 dias. Interface completa com 3 fluxos de pagamento.

**Total estimado**: 4-5 dias de trabalho focado para MVP funcional em producao.

### Nomenclatura sugerida

- Modulo backend: `pos` (router prefix `/pos`)
- Source: `"pos"`
- Providers: `"cash"`, `"external_card"`
- Rota frontend: `/pos`, `/pos/sale`
- Componentes: `PosLayoutClient`, `PosSaleClient`
- Schemas: `PosOrderCreate`, `PosPaymentRequest`, `PosPaymentResponse`

---

## Arquivos Criticos para Implementacao

### Backend -- Modificar
- `backend/app/models/order.py` -- 3 novos campos
- `backend/app/schemas/orders.py` -- 3 campos em OrderRead
- `backend/app/services/orders.py` -- create_pos_order + helpers extraidos
- `backend/app/main.py` -- registrar pos_router

### Backend -- Criar
- `backend/alembic/versions/20260406_0007_add_pos_fields.py`
- `backend/app/schemas/pos.py`
- `backend/app/services/payments.py`
- `backend/app/api/pos.py`

### Frontend -- Modificar
- `frontend/lib/api.ts` -- types + funcoes POS
- `frontend/components/admin/AdminSidebar.tsx` -- link Frente de Caixa

### Frontend -- Criar
- `frontend/app/pos/layout.tsx`
- `frontend/app/pos/page.tsx`
- `frontend/app/pos/sale/page.tsx`
- `frontend/app/pos/sale/client.tsx`
- `frontend/components/pos/PosLayoutClient.tsx`
- `frontend/app/api/pos/orders/route.ts`
- `frontend/app/api/pos/orders/[id]/pay/route.ts`

---

## Verificacao End-to-End

### Teste 1: Venda com dinheiro
1. Acessar `/pos` logado como admin
2. Buscar produto, adicionar 2 unidades
3. Aplicar 10% desconto
4. Tocar "Pagamento" -> "Dinheiro"
5. Informar valor recebido > total
6. Confirmar -> verificar troco exibido
7. Verificar pedido em `/admin/orders` com source=pos, status=paid

### Teste 2: Venda com PIX
1. Mesmo fluxo de montagem
2. Tocar "Pagamento" -> "PIX"
3. Verificar QR code exibido
4. Simular pagamento (webhook ou mock)
5. Verificar polling detecta status=paid

### Teste 3: Venda com cartao externo
1. Mesmo fluxo de montagem
2. Tocar "Pagamento" -> "Cartao (maquininha)"
3. Tocar "Pagamento Confirmado"
4. Verificar pedido paid

### Teste 4: Venda anonima
1. Adicionar itens SEM informar cliente
2. Fechar com dinheiro
3. Verificar pedido criado com customer_id=null

### Teste 5: Estoque
1. Anotar stock de uma variante
2. Vender 2 unidades via POS
3. Verificar stock decrementou em 2
