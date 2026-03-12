# Mercado Pago MCP Toggle Guide

A quick reference for enabling and disabling Mercado Pago MCP support during OpenCode sessions.

## What MCP Provides

The Mercado Pago MCP helps with:
- Documentation lookup and API references
- Webhook payload validation
- Payment flow quality checks

It does **not** replace backend API calls. Your runtime integration code still handles actual payment processing.

---

## Official MCP Endpoint

```
https://mcp.mercadopago.com/mcp
```

---

## Enabling Mercado Pago MCP

### Prerequisites

Your access token is stored locally at:
```
.secrets/sandbox-integrations.env
```

Load the token into your environment before configuring MCP:
```bash
source .secrets/sandbox-integrations.env
# or export explicitly:
export MERCADO_PAGO_ACCESS_TOKEN="<your-token-here>"
```

### MCP Client Configuration

Add this to your MCP client config (e.g., Claude Desktop, OpenCode, or other MCP-compatible tools):

```json
{
  "mcpServers": {
    "mercadopago": {
      "url": "https://mcp.mercadopago.com/mcp",
      "transport": "http",
      "headers": {
        "Authorization": "Bearer ${MERCADO_PAGO_ACCESS_TOKEN}"
      }
    }
  }
}
```

Some MCP clients use a slightly different format:

```json
{
  "mcpServers": {
    "mercadopago": {
      "command": "mcp-client",
      "args": ["https://mcp.mercadopago.com/mcp"],
      "env": {
        "MERCADO_PAGO_ACCESS_TOKEN": "<your-token-here>"
      }
    }
  }
}
```

After updating your config, restart your MCP client to activate the integration.

---

## Disabling Mercado Pago MCP

Remove or comment out the `mercadopago` entry from your MCP client configuration:

```json
{
  "mcpServers": {
    // "mercadopago": { ... }  // disabled
  }
}
```

Or delete the entire `mercadopago` block. Restart your MCP client to apply.

---

## When to Enable

Enable MCP when you need to:
- Look up Mercado Pago API documentation during development
- Validate webhook payloads against expected schemas
- Check payment flow implementations for correctness
- Explore available endpoints and parameters

---

## When Not to Enable

Keep MCP disabled when:
- Working on unrelated features (reduces context noise)
- Running production builds or CI pipelines
- You don't need Mercado Pago documentation or validation
- Token rotation is in progress

---

## Security Notes

- Never commit tokens to version control
- The token in `.secrets/sandbox-integrations.env` is for sandbox/testing only
- Production tokens should be managed through your deployment secrets system
- MCP runs locally, so tokens never leave your machine

---

## Related Files

| File | Purpose |
|------|---------|
| `.secrets/sandbox-integrations.env` | Sandbox credentials (not in git) |
| `backend/app/integrations/mercado_pago.py` | Runtime client, token readers, webhook signature verification |
| `backend/app/api/payments.py` | Payment endpoints (PIX, checkout preferences) |
| `backend/app/api/webhooks.py` | Webhook handler for payment status updates |

---

## Quick Reference

| Action | Command |
|--------|---------|
| Load token | `source .secrets/sandbox-integrations.env` |
| MCP URL | `https://mcp.mercadopago.com/mcp` |
| Auth header | `Authorization: Bearer ${MERCADO_PAGO_ACCESS_TOKEN}` |
