# Storefront API Base URL Fix

## Sintoma

No navegador, a storefront estava fazendo:

- `GET http://localhost:3000/products`

Isso retornava:

- `404 Not Found`
- HTML do Next.js, não JSON da API

O mesmo problema impactava a cotação de frete, porque o frontend usa a mesma base de API para chamar:

- `POST /shipping/quotes`

## Causa raiz

O problema foi uma combinação de build/configuração com uma fragilidade no código:

1. o frontend foi rebuildado anteriormente com `docker build` direto, fora do `docker compose`;
2. nesse caminho, os build args do compose não foram aplicados ao bundle client-side;
3. o bundle servido ao navegador acabou compilado com `NEXT_PUBLIC_API_BASE_URL=""`;
4. em `frontend/lib/api.ts`, a leitura da env usava `??`, então string vazia era tratada como válida;
5. com base vazia, chamadas como `listProducts()` viravam request relativa:
   - `/products`
   - `/shipping/quotes`
6. como a página está em `http://localhost:3000`, o navegador chamou o servidor Next em vez do backend.

## Correção aplicada

### Código

Arquivo:

- `frontend/lib/api.ts`

Correção:

- a leitura de `NEXT_PUBLIC_API_BASE_URL` agora normaliza `trim()` e faz fallback para `http://localhost:8000` quando a env estiver vazia.

Isso evita que o frontend monte URL relativa mesmo se o build vier com env vazia.

### Build/runtime

O frontend foi rebuildado corretamente com:

- `docker compose -f infra/dev/docker-compose.yml build frontend`

e recriado com:

- `docker compose -f infra/dev/docker-compose.yml up -d --force-recreate frontend`

Esse caminho reaplica os build args corretos definidos no compose.

## Evidência objetiva após correção

### Bundle servido

No chunk ativo do frontend:

- `API_BASE_URL` voltou a estar embutida como `http://localhost:8000`
- `listProducts()` chama `http://localhost:8000/products`
- `getShippingQuotes()` chama `http://localhost:8000/shipping/quotes`

### Navegador automatizado

Validação real no navegador:

- `GET http://localhost:8000/products`
- `200 OK`
- `content-type: application/json`

## Conclusão

O problema não era ausência de produtos nem falha do backend.

Era:

- build/configuração incorreta do frontend client bundle
- somada a um fallback frágil no código para env vazia

Depois da correção:

- a storefront voltou a buscar produtos no backend correto
- a mesma base corrigida volta a atender a cotação de frete
