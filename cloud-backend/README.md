# PicTour Cloud Backend v4.4

Backend mínimo para galeria cloud, checkout Mercado Pago real, webhooks e sync de vendas do PicTour Desktop.

## Rodar local

```bash
npm install
npm run dev
```

```txt
http://127.0.0.1:8787/health
```

## Variáveis úteis

```env
PORT=8787
PICTOUR_CLOUD_API_KEY=pictour_dev_secret
PUBLIC_BASE_URL=http://127.0.0.1:8787
STORAGE_DRIVER=local
DATABASE_DRIVER=json

MERCADO_PAGO_ACCESS_TOKEN=TEST-...
MERCADO_PAGO_PUBLIC_BASE_URL=http://127.0.0.1:8787
PICTOUR_MP_WEBHOOK_TOKEN=
PICTOUR_ALLOW_SIMULATED_PURCHASES=false
```

Em produção, use HTTPS público em `PUBLIC_BASE_URL`/`MERCADO_PAGO_PUBLIC_BASE_URL` e token de produção `APP_USR-...`.

## Endpoints principais

- `GET /health`
- `POST /api/publish-session`
- `POST /api/publish-photo`
- `GET /api/sync/sales`
- `GET /g/:slug`
- `GET /api/gallery/:slug`
- `POST /api/gallery/:slug/create-checkout`
- `GET /api/gallery/:slug/checkout/:checkoutId?refresh=1`
- `POST /api/gallery/:slug/purchase-simulated` — desativado por padrão
- `POST /webhooks/mercado-pago`
- `GET /webhooks/mercado-pago`

## Webhook Mercado Pago

Configure no Mercado Pago:

```txt
https://api.seudominio.com/webhooks/mercado-pago
```

Se `PICTOUR_MP_WEBHOOK_TOKEN` estiver definido, o PicTour adiciona `?token=...` automaticamente ao `notification_url` dos checkouts.

## Sync de vendas

O desktop chama:

```txt
GET /api/sync/sales?publicSlugs=pt-4821-cliente
```

Com header:

```txt
Authorization: Bearer pictour_dev_secret
```

O backend retorna sessões, fotos compradas, vendas aprovadas e checkouts para o Desktop atualizar o Caixa local e gerar entrega profissional.

## v4.3 — Painel administrativo web SaaS

Além da galeria e pagamentos, o backend agora atua como servidor SaaS de licenças.

```env
PICTOUR_LICENSE_ADMIN_TOKEN=pictour_admin_secret
PICTOUR_LATEST_VERSION=4.6.3
PICTOUR_DOWNLOAD_URL=https://seu-dominio.com/download/pictour-setup.exe
PICTOUR_RELEASE_NOTES=Cloud SaaS real|Check-in por dispositivo|Licenciamento por plano|Preparação para assinatura
```

Endpoints:

- `GET /admin?token=SEU_TOKEN`
- `GET /api/licenses/admin/list?token=SEU_TOKEN`
- `POST /api/licenses/admin/upsert`
- `POST /api/licenses/validate`
- `GET /api/updates/latest`

O desktop v4.4 envia fingerprint local, estação, versão e uso mensal para o check-in da licença.


## v4.3 — Painel administrativo web

Acesse o painel completo em:

```txt
/admin?token=SEU_TOKEN
```

Recursos principais:

- visão executiva com MRR estimado, alertas, uso mensal e dispositivos;
- cadastro/edição de empresas e licenças;
- ações rápidas para ativar, suspender e renovar +30 dias;
- filtros por busca, plano e status;
- dispositivos registrados por check-in;
- checkouts, vendas e galerias cloud;
- exportação CSV em `/api/admin/export/licenses.csv?token=SEU_TOKEN`;
- API BI/admin em `/api/admin/overview?token=SEU_TOKEN`.

## v4.3 — Storage cloud das fotos

A v4.3 adiciona um fluxo de storage mais seguro para produção:

- `STORAGE_DRIVER=local|s3|r2`;
- previews/thumbs públicos para galeria protegida;
- arquivos finais em caminho privado;
- download assinado com `PICTOUR_STORAGE_SIGNING_SECRET`;
- TTL configurável com `PICTOUR_STORAGE_SIGNED_TTL_SECONDS`;
- `GET /api/storage-info` para health/diagnóstico;
- `STORAGE_PUBLIC_BASE_URL` opcional para servir mídia por CDN.

Para produção com Cloudflare R2:

```env
STORAGE_DRIVER=r2
R2_BUCKET=pictour-photos-prod
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
S3_REGION=auto
STORAGE_PUBLIC_BASE_URL=https://cdn.seudominio.com/media
PICTOUR_STORAGE_SIGNING_SECRET=troque-por-um-segredo-grande
PICTOUR_STORAGE_SIGNED_TTL_SECONDS=900
```

## v4.3 — Assinaturas e planos

A v4.3 adiciona controle de assinatura SaaS sobre a base de licenciamento:

- plano STARTER, PRO ou ENTERPRISE;
- status de assinatura: TRIAL, ACTIVE, PAST_DUE, CANCELLED, SUSPENDED;
- ciclo MONTHLY ou YEARLY;
- preço/ciclo e MRR equivalente;
- próxima cobrança;
- tolerância de atraso;
- endpoint `GET /api/admin/subscriptions`.

Ao criar/atualizar licença via `/api/licenses/admin/upsert`, também é possível enviar:

```json
{
  "billingCycle": "MONTHLY",
  "subscriptionStatus": "ACTIVE",
  "billingProvider": "MERCADO_PAGO",
  "subscriptionPriceCents": 29900,
  "nextBillingAt": "2026-06-18",
  "graceDays": 5
}
```


## v4.4 — App mobile mais completo

A v4.4 mantém o backend cloud compatível e concentra a evolução mobile no servidor local do Desktop: portal `/photo`, fila local de upload, pré-seleção/favoritos e acompanhamento de sessão.
