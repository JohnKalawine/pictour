# PicTour v4.1 — Painel administrativo web

## Objetivo

A v4.1 transforma o backend cloud em um painel administrativo web real para operar o PicTour como SaaS. A partir desta versão, o gestor do produto consegue administrar clientes, licenças, dispositivos, check-ins, consumo mensal, checkouts cloud e alertas comerciais sem editar JSON manualmente.

## Acesso

Com o backend cloud rodando:

```bash
cd cloud-backend
npm install
npm run dev
```

Abra:

```txt
http://127.0.0.1:8787/admin?token=pictour_admin_secret
```

Em produção, configure:

```env
PICTOUR_LICENSE_ADMIN_TOKEN=um_token_forte
PUBLIC_BASE_URL=https://seu-backend-cloud.com
PICTOUR_LATEST_VERSION=4.1.0
```

## O que entrou na v4.1

- Painel web em `/admin`.
- Compatibilidade mantida com `/admin/licenses`.
- KPIs executivos:
  - MRR estimado.
  - empresas cadastradas.
  - licenças ativas/teste.
  - alertas comerciais.
  - fotos e vendas reportadas no mês.
  - dispositivos com check-in.
- Cadastro/edição de empresa e licença.
- Filtros por busca, status e plano.
- Ações rápidas:
  - ativar licença.
  - suspender licença.
  - renovar +30 dias.
- Lista de dispositivos registrados.
- Área comercial cloud com:
  - checkouts recentes.
  - galerias publicadas.
  - vendas cloud.
  - receita cloud aprovada.
- Eventos recentes de licença/check-in.
- Exportação CSV de licenças.
- API BI/admin em `/api/admin/overview`.

## Endpoints novos

```txt
GET  /admin?token=...
GET  /api/admin/overview?token=...
GET  /api/admin/export/licenses.csv?token=...
POST /api/admin/license-status
POST /api/admin/license-extend
```

Todos exigem token administrativo via:

```txt
?token=...
```

ou header:

```txt
x-pictour-admin-token: ...
```

## Fluxo de operação

1. Criar empresa no painel web.
2. Escolher plano: STARTER, PRO ou ENTERPRISE.
3. Definir status e validade.
4. Copiar `companyId` e `licenseKey` para o PicTour Desktop.
5. Validar licença no Desktop.
6. Acompanhar check-ins, dispositivos e uso no painel web.
7. Suspender/renovar conforme cobrança.

## Observação comercial

Esta versão ainda não cobra assinatura automaticamente. Ela prepara a operação SaaS para a v4.3, onde entram planos/assinaturas de forma mais completa.

## Próximo passo

v4.2 — Storage cloud das fotos.
