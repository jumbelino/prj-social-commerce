# ORQUESTRADOR DO PROJETO
Social Commerce Platform MVP

Projeto para construção de uma plataforma de social commerce para pequenos negócios que vendem principalmente via Instagram/WhatsApp.

Objetivo inicial: atender um caso real (marca de roupas), permitindo vendas via catálogo online simples e checkout integrado.

Este documento é a referência central para o desenvolvimento.

---

# Visão do Produto

A plataforma deve permitir que pequenos vendedores:

- Cadastrem produtos rapidamente
- Atualizem estoque constantemente
- Tenham uma loja online simples
- Recebam pagamentos via Pix e cartão
- Gerenciem pedidos facilmente
- Enviem links de produtos rapidamente em conversas

No futuro, o sistema deverá evoluir para:

- centralização de atendimento via Chatwoot
- automações de vendas
- analytics
- CRM leve
- recuperação de carrinho
- automação de mensagens

---

# Filosofia do Produto

Este produto NÃO tenta competir com plataformas completas como:

- Nuvemshop
- Shopify
- WooCommerce

Ele foca em:

SOCIAL COMMERCE PARA PEQUENOS NEGÓCIOS

Problema que resolve:

- vendas nascem em DM
- catálogo muda rápido
- estoque pequeno
- vendedores querem agilidade
- vendedores querem operação simples

---

# Arquitetura Técnica

Arquitetura inicial: monólito modular.

Backend:
- FastAPI
- SQLAlchemy
- PostgreSQL
- Redis
- Celery ou Dramatiq
- MinIO

Frontend:
- Next.js
- TypeScript
- Tailwind

Infraestrutura:
- Docker Compose
- Nginx ou Traefik
- HTTPS obrigatório

---

# Módulos do Sistema

## Catalog Module

Responsável por:

- produtos
- variantes
- categorias
- imagens
- estoque

Principais entidades:

Product  
ProductVariant  
ProductImage  
InventoryMovement

---

## Storefront Module

Responsável por:

- página inicial
- catálogo público
- página do produto
- carrinho
- checkout

---

## Orders Module

Responsável por:

- carrinho
- pedidos
- itens do pedido
- histórico de status

Status básicos:

pending  
paid  
shipped  
delivered  
cancelled

---

## Payments Module

Integração inicial:

Mercado Pago

Funções:

- gerar pagamento Pix
- gerar link de pagamento
- receber webhook
- atualizar status do pedido

---

## Customers Module

Responsável por:

- clientes
- endereços
- histórico de compras

---

## Shipping Module

Inicialmente simples:

- cálculo básico
- integração futura com APIs de frete

---

## CRM Light Module

MVP inclui:

- origem do lead
- observações
- status comercial

Futuro:

- pipeline
- follow-up
- automações

---

# Fluxos Principais

## Fluxo A: Compra pela loja

cliente acessa link da loja  
cliente escolhe produto  
cliente escolhe variante  
cliente adiciona ao carrinho  
cliente informa endereço  
cliente calcula frete  
cliente paga  
pedido é criado  
pagamento confirmado via webhook

---

## Fluxo B: Venda assistida

cliente manda mensagem no Instagram

vendedor:

abre painel  
cria pedido manual  
gera link de pagamento  
envia link para cliente

cliente paga  
pedido muda status

---

## Fluxo C: Compartilhamento de produto

vendedor copia link do produto  
envia para cliente no direct

cliente abre produto  
cliente compra

---

# Requisitos de Produto

## Catálogo

- cadastro rápido
- múltiplas fotos
- variantes
- estoque por variante
- duplicar produto
- ativar/desativar

---

## Loja

- grade de produtos
- página de produto
- carrinho
- checkout

---

## Operação

- painel admin
- pedidos recentes
- estoque baixo
- pedidos pendentes

---

# Evolução Futura

v2

- Chatwoot
- atendimento centralizado

v3

- automações
- recuperação de carrinho
- CRM completo

v4

- IA assistiva
- analytics