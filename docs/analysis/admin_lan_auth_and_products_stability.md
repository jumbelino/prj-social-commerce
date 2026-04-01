# Admin LAN Auth and Products Stability

## Problema

Depois do ajuste de host publico para acesso via LAN (`http://192.168.0.234:3000`), o login do admin passou a funcionar, mas surgiram dois erros:

- `GET /api/admin/dashboard/metrics` retornando `401 Unauthorized`
- `/admin/products` quebrando no render server-side com `ApiRequestError: Unauthorized` e digest `1338230773`

## Causa raiz

Os dois sintomas tinham causas diferentes:

1. `401` nas rotas `/api/admin/*` protegidas
   - O frontend passou a autenticar o admin pelo ambiente LAN, com token contendo `iss=http://192.168.0.234:8080/realms/social-commerce`.
   - O backend ainda validava `OIDC_ISSUER=http://localhost:8080/...`.
   - Resultado: o token chegava ao backend, mas falhava na validacao de `iss`, gerando `invalid_token` e `401`.

2. Quebra de `/admin/products` em Server Components
   - A pagina `frontend/app/admin/products/page.tsx` fazia um self-fetch server-side para `/api/admin/products`.
   - Esse fetch nao carregava a sessao do navegador para o proxy Next.js.
   - O proxy devolvia `401`, `listAdminProducts()` lancava `ApiRequestError`, e o Server Component quebrava sem fallback amigavel.

## Correcao aplicada

- Alinhado o backend para usar:
  - `OIDC_ISSUER=http://192.168.0.234:8080/realms/social-commerce`
- Ajustado `/admin/products` para:
  - buscar os produtos diretamente no backend durante o render server-side, usando `session.accessToken`
  - exibir painel de erro amigavel se o carregamento inicial falhar

## Impacto

- Dashboard admin volta a carregar metricas sem `401` indevido
- `/admin/products` volta a abrir normalmente
- O admin fica consistente no acesso via LAN sem reabrir escopo de auth ou backend

## Validacao

- Sessao admin decodificada no navegador com:
  - `iss=http://192.168.0.234:8080/realms/social-commerce`
  - `aud=realm-management`
- Chamada autenticada em `/api/admin/dashboard/metrics` retornando `200`
- Navegacao em `/admin/products` sem `Application error` nem digest server-side
