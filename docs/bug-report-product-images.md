# Bug Report: Imagens de Produtos Não Aparecem

**Task ID:** T-46aab972-6803-4070-854d-757a75a6626f  
**Data:** 2026-03-18  
**Status:** 🔍 Analisado - Aguardando Correção  
**Severidade:** Alta  
**Componente:** Sistema de Imagens (MinIO + Frontend)

---

## 1. Resumo do Problema

Imagens de produtos **não são exibidas** em nenhum dos seguintes locais:
- ❌ Catálogo storefront (página inicial)
- ❌ Página de detalhes do produto
- ❌ Formulário de edição de produto (admin)
- ❌ Preview durante upload de novas imagens

O upload de imagens **parece funcionar** (sem erros visíveis), mas as imagens não aparecem após o upload.

---

## 2. Sintomas Observados

| Local | Comportamento Esperado | Comportamento Atual |
|-------|----------------------|---------------------|
| **Catálogo (/)** | Exibir imagem principal do produto | Placeholder/ícone de imagem vazio |
| **Detalhe Produto (/products/[id])** | Carrossel com todas as imagens | Placeholder/ícone de imagem vazio |
| **Editar Produto (/admin/products/[id])** | Grid com imagens existentes | Grid vazio ou sem imagens |
| **Novo Produto (/admin/products/new)** | Preview das imagens pendentes | Preview funciona (usa URL local) |

**Nota Importante:** O preview no formulário de **novo produto** funciona porque usa `URL.createObjectURL()` (blob local), não a URL do MinIO.

---

## 3. Fluxo de Dados das Imagens

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            FLUXO DE UPLOAD                                   │
└─────────────────────────────────────────────────────────────────────────────┘

1. Usuário seleciona imagem
   ↓
2. Frontend envia POST /api/admin/products/{id}/images/upload
   ↓
3. API Route (Next.js) encaminha para Backend FastAPI
   ↓
4. Backend salva no MinIO (object storage)
   ↓
5. Backend cria registro no PostgreSQL (tabela product_images)
   ↓
6. Backend retorna ProductImageRead {id, url, object_key, position}
   ↓
7. Frontend atualiza estado local com nova imagem

┌─────────────────────────────────────────────────────────────────────────────┐
│                          FLUXO DE EXIBIÇÃO                                   │
└─────────────────────────────────────────────────────────────────────────────┘

1. Frontend carrega lista de produtos (GET /products)
   ↓
2. Backend retorna produtos com array de imagens
   ↓
3. Frontend renderiza <img src={image.url} /> ou <Image src={image.url} />
   ↓
4. Browser tenta carregar imagem da URL do MinIO
   ↓
5. ❌ FALHA: Imagem não carrega (404, CORS, ou URL inválida)
```

---

## 4. Estrutura de Dados

### Modelo ProductImage (Backend)
```python
class ProductImage(Base):
    __tablename__ = "product_images"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    product_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("products.id"))
    object_key: Mapped[str] = mapped_column(String(255))  # ex: "products/{uuid}/image.jpg"
    url: Mapped[str] = mapped_column(String(500))         # ex: "http://localhost:9000/product-images/products/{uuid}/image.jpg"
    position: Mapped[int] = mapped_column(Integer, default=0)
```

### Schema ProductImageRead (API Response)
```typescript
interface ProductImage {
  id: number;
  product_id: string;
  object_key: string;
  url: string;           // URL pública para acesso direto
  position: number;
}
```

---

## 5. Possíveis Causas Raiz

### 🎯 Causa #1: URL Pública do MinIO Incorreta (MAIS PROVÁVEL)

**Arquivo:** `backend/app/integrations/minio_storage.py`

**Problema:** A construção da URL pública pode estar gerando URLs inacessíveis.

```python
def _read_minio_public_base_url(bucket: str) -> str:
    configured = os.getenv("MINIO_PUBLIC_BASE_URL")
    if configured is not None and configured.strip() != "":
        return configured.rstrip("/")
    return f"http://localhost:9000/{bucket}"

def build_url(self, object_key: str) -> str:
    return f"{self._public_base_url}/{object_key}"
```

**Comportamento atual:**
- `MINIO_PUBLIC_BASE_URL=http://localhost:9000/product-images`
- `object_key=products/{uuid}/image.jpg`
- **Resultado:** `http://localhost:9000/product-images/products/{uuid}/image.jpg`

**Possíveis problemas:**
1. ❌ MinIO pode estar esperando URL no formato `http://localhost:9000/{bucket}/{object_key}`
2. ❌ MinIO pode estar configurado para requerer autenticação em vez de acesso público
3. ❌ O bucket `product-images` pode não existir no MinIO
4. ❌ A política de bucket (bucket policy) pode não estar permitindo acesso público de leitura

**Verificação necessária:**
```bash
# Verificar se o bucket existe e está acessível
curl -I http://localhost:9000/product-images/products/{uuid}/image.jpg

# Verificar política do bucket
mc policy get local/product-images
```

---

### 🎯 Causa #2: Bucket Policy Não Aplicada

**Arquivo:** `backend/app/integrations/minio_storage.py:47-60`

O código só aplica a política de acesso público quando o bucket **não existe**:

```python
def upload_file(self, *, object_key: str, file_obj: BinaryIO, content_type: str | None) -> None:
    if not self._client.bucket_exists(self._bucket):
        self._client.make_bucket(self._bucket)
        policy = {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Effect": "Allow",
                    "Principal": {"AWS": ["*"]},
                    "Action": ["s3:GetObject"],
                    "Resource": [f"arn:aws:s3:::{self._bucket}/*"],
                }
            ],
        }
        self._client.set_bucket_policy(self._bucket, json.dumps(policy))
```

**Problema:** Se o bucket foi criado manualmente ou em execução anterior sem a policy, o código **nunca aplica a policy**, resultando em acesso negado.

**Verificação necessária:**
```bash
# Verificar se a política está aplicada
mc policy get local/product-images
# Deve retornar: AccessPolicy: readonly (ou similar)
```

---

### 🎯 Causa #3: Problema de CORS

Se o MinIO está em `localhost:9000` e o frontend em `localhost:3000`, o navegador pode bloquear o carregamento das imagens por política CORS.

**Arquivos afetados:**
- `frontend/app/(storefront)/page.tsx:88`
- `frontend/app/(storefront)/products/[id]/page.tsx`
- `frontend/components/products/ProductImagesManager.tsx:66`

**Configuração necessária no MinIO:**
```bash
# Configurar CORS no MinIO
mc anonymous set download local/product-images
mc cors set local/product-images cors.json
```

---

### 🎯 Causa #4: Variáveis de Ambiente Incorretas

**Arquivos de configuração:**
- `infra/dev/.env.example:13`
- `backend/.env.example:27-28`

**Verificar se as seguintes variáveis estão configuradas corretamente:**

| Variável | Valor Esperado (Docker) | Valor Esperado (Local) |
|----------|------------------------|----------------------|
| `MINIO_ENDPOINT` | `minio:9000` | `localhost:9000` |
| `MINIO_PUBLIC_BASE_URL` | `http://localhost:9000/product-images` | `http://localhost:9000/product-images` |
| `MINIO_ACCESS_KEY` | `minioadmin` | `minioadmin` |
| `MINIO_SECRET_KEY` | `minioadmin` | `minioadmin` |
| `MINIO_BUCKET` | `product-images` | `product-images` |

**⚠️ ATENÇÃO:** O `MINIO_ENDPOINT` muda dependendo do contexto:
- Backend → Docker usa `minio:9000` (nome do serviço)
- Navegador → usa `localhost:9000` (acesso externo)

---

### 🎯 Causa #5: Problema com next/image

**Arquivo:** `frontend/next.config.ts`

```typescript
const nextConfig: NextConfig = {
  images: {
    unoptimized: true,  // ✅ Isso desabilita a otimização
  },
};
```

O uso de `unoptimized: true` significa que o Next.js não processa as imagens, mas isso **não deve causar** o problema de não carregar.

**Nota:** Os componentes usam tanto `<img>` (padrão HTML) quanto `<Image>` (Next.js). O problema afeta ambos.

---

## 6. Checklist de Diagnóstico

### 6.1 Verificar Logs

```bash
# Backend logs - verificar erros durante upload
docker logs social-commerce-backend

# MinIO logs
docker logs social-commerce-minio
```

### 6.2 Testar API de Upload

```bash
# Obter token de admin
export ADMIN_TOKEN="..."

# Testar upload de imagem
curl -X POST http://localhost:8000/admin/products/{product_id}/images/upload \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -F "file=@test-image.png" \
  -v
```

### 6.3 Verificar URL da Imagem

```bash
# Pegar URL do banco
docker exec -it social-commerce-postgres psql -U social_commerce -d social_commerce \
  -c "SELECT id, product_id, url FROM product_images LIMIT 5;"

# Testar acesso direto à URL
curl -I http://localhost:9000/product-images/products/{uuid}/image.png
```

### 6.4 Verificar Bucket MinIO

```bash
# Acessar console do MinIO (se habilitado)
open http://localhost:9001

# Ou usar mc (MinIO Client)
mc alias set local http://localhost:9000 minioadmin minioadmin
mc ls local/product-images
mc policy get local/product-images
```

### 6.5 Verificar Network Tab do Browser

1. Abrir DevTools (F12)
2. Ir para Network tab
3. Carregar página de produto
4. Verificar requisições de imagem:
   - Status code (200, 403, 404?)
   - Response headers
   - CORS headers

---

## 7. Soluções Propostas

### Solução #1: Garantir Bucket Policy (RECOMENDADO)

**Arquivo:** `backend/app/integrations/minio_storage.py`

Modificar o método `upload_file` para **sempre** garantir que a policy está aplicada:

```python
def upload_file(self, *, object_key: str, file_obj: BinaryIO, content_type: str | None) -> None:
    # Criar bucket se não existir
    if not self._client.bucket_exists(self._bucket):
        self._client.make_bucket(self._bucket)
    
    # SEMPRE aplicar/atualizar policy de acesso público
    self._ensure_public_read_policy()
    
    self._client.put_object(
        bucket_name=self._bucket,
        object_name=object_key,
        data=file_obj,
        length=-1,
        part_size=10 * 1024 * 1024,
        content_type=content_type or "application/octet-stream",
    )

def _ensure_public_read_policy(self) -> None:
    """Garante que o bucket permite leitura pública."""
    policy = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Principal": {"AWS": ["*"]},
                "Action": ["s3:GetObject"],
                "Resource": [f"arn:aws:s3:::{self._bucket}/*"],
            }
        ],
    }
    self._client.set_bucket_policy(self._bucket, json.dumps(policy))
```

### Solução #2: Adicionar CORS ao MinIO

Se o problema for CORS, adicionar configuração no MinIO:

```bash
# Criar arquivo cors.json
cat > cors.json << 'EOF'
{
  "AllowedOrigins": ["http://localhost:3000"],
  "AllowedMethods": ["GET"],
  "AllowedHeaders": ["*"],
  "MaxAgeSeconds": 3000
}
EOF

# Aplicar ao bucket
mc cors set local/product-images cors.json
```

### Solução #3: Usar Presigned URLs

Em vez de URLs públicas, usar URLs pré-assinadas (mais seguro):

```python
def build_url(self, object_key: str) -> str:
    # Opção 1: URL pública (atual)
    return f"{self._public_base_url}/{object_key}"
    
    # Opção 2: Presigned URL (mais seguro)
    from datetime import timedelta
    return self._client.presigned_get_object(
        bucket_name=self._bucket,
        object_name=object_key,
        expires=timedelta(hours=24)
    )
```

---

## 8. Arquivos Relacionados

### Backend
- `backend/app/integrations/minio_storage.py` - Cliente MinIO
- `backend/app/api/admin_product_images.py` - API de upload/reorder/delete
- `backend/app/models/product.py` - Modelo ProductImage
- `backend/app/schemas/products.py` - Schema ProductImageRead

### Frontend - Admin
- `frontend/app/admin/products/[id]/page.tsx` - Página de edição
- `frontend/app/admin/products/new/page.tsx` - Página de criação
- `frontend/components/products/ProductImagesManager.tsx` - Grid de imagens
- `frontend/components/products/PendingImageUploader.tsx` - Upload de novas imagens
- `frontend/app/api/admin/products/[id]/images/upload/route.ts` - API Route upload
- `frontend/app/api/admin/products/[id]/images/reorder/route.ts` - API Route reorder
- `frontend/app/api/admin/products/[id]/images/[imageId]/route.ts` - API Route delete

### Frontend - Storefront
- `frontend/app/(storefront)/page.tsx` - Catálogo de produtos
- `frontend/app/(storefront)/products/[id]/page.tsx` - Detalhes do produto
- `frontend/components/products/ProductImageCarousel.tsx` - Carrossel de imagens

### Configuração
- `infra/dev/docker-compose.yml` - Serviço MinIO
- `infra/dev/.env.example` - Variáveis de ambiente
- `backend/.env.example` - Variáveis de ambiente backend
- `frontend/next.config.ts` - Configuração Next.js

---

## 9. Testes

**Arquivo:** `backend/tests/test_admin_product_images.py`

Os testes existentes usam `FakeMinioStorage`, então não testam integração real com MinIO. Recomenda-se adicionar:

1. Teste de integração que verifica se a URL retornada é acessível
2. Teste que verifica bucket policy após upload
3. Teste de CORS headers

---

## 10. Próximos Passos

1. **🔴 CRÍTICO:** Verificar logs do MinIO e do Backend durante upload
2. **🔴 CRÍTICO:** Testar acesso direto à URL da imagem no navegador
3. **🟡 ALTA:** Verificar bucket policy no MinIO
4. **🟡 ALTA:** Verificar variáveis de ambiente no container backend
5. **🟢 MÉDIA:** Implementar Solução #1 (garantir bucket policy)
6. **🟢 MÉDIA:** Adicionar logs de debug no fluxo de upload

---

## 11. Notas Adicionais

- O sistema está usando **MinIO** como object storage (S3-compatible)
- O upload é feito via **API Route do Next.js** (proxy para backend)
- As imagens são armazenadas com **object_key** no formato: `products/{product_uuid}/{random_uuid}.{ext}`
- A URL pública é construída concatenando `MINIO_PUBLIC_BASE_URL + object_key`
- O frontend usa tanto `<img>` quanto `<Image>` do Next.js
- O preview durante upload funciona porque usa `URL.createObjectURL()` (blob local)

---

*Documento gerado em: 2026-03-18*  
*Responsável: Sisyphus Agent*