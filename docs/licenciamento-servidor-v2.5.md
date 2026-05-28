# PicTour v2.5 — Servidor e painel de licenças

Esta versão transforma o licenciamento local da v2.4 em um fluxo controlável pela cloud.

## Objetivo

Permitir que a NoMercy/PicTour controle empresas contratantes sem depender de editar manualmente o computador do cliente.

Com a v2.5, o backend cloud passa a ter:

- painel web simples de licenças;
- cadastro de empresa contratante;
- criação/renovação/suspensão de licença;
- validação da licença pelo desktop;
- histórico de validações e alterações;
- resposta de plano, limites e recursos para o app desktop.

## Como rodar localmente

```bash
cd cloud-backend
npm install
npm run dev
```

Health:

```txt
http://127.0.0.1:8787/health
```

Painel de licenças:

```txt
http://127.0.0.1:8787/admin/licenses?token=pictour_admin_secret
```

O token padrão pode ser alterado com:

```bash
PICTOUR_LICENSE_ADMIN_TOKEN=uma_senha_forte npm run dev
```

## Fluxo recomendado

1. Abrir o backend cloud.
2. Entrar no painel `/admin/licenses`.
3. Criar empresa.
4. Escolher plano: Starter, Pro ou Enterprise.
5. Definir status e validade.
6. Copiar `companyId` e `licenseKey`.
7. No desktop, ir em **Configurações → Licença / assinatura**.
8. Colar o ID da empresa, chave da licença e URL do servidor.
9. Clicar em **Validar no servidor**.

## Endpoint de validação

```txt
POST /api/licenses/validate
```

Body:

```json
{
  "companyId": "empresa_parque_aventura",
  "licenseKey": "PIC-PRO-XXXX",
  "appVersion": "2.5.0",
  "deviceName": "BALCAO-01"
}
```

Resposta aprovada:

```json
{
  "ok": true,
  "message": "Licença validada no servidor PicTour.",
  "company": {
    "id": "empresa_parque_aventura",
    "name": "Parque Aventura",
    "status": "ACTIVE"
  },
  "license": {
    "plan": "PRO",
    "status": "ACTIVE",
    "expiresAt": "2030-01-01",
    "maxUsers": 10,
    "maxLocations": 3,
    "monthlyPhotoLimit": 12000
  }
}
```

## Segurança

O painel administrativo exige token via:

- query string: `?token=...`;
- header `x-pictour-admin-token`;
- header `Authorization: Bearer ...`.

Para produção, recomenda-se:

- rodar atrás de HTTPS;
- usar token forte;
- restringir painel administrativo por login próprio ou VPN;
- migrar storage/banco para PostgreSQL/R2/S3;
- auditar todos os acessos administrativos.

## Comportamento no desktop

Quando a licença é validada:

- o app atualiza plano/status/limites;
- salva `serverLicenseId`;
- registra `lastValidatedAt`;
- mostra mensagem de validação;
- registra auditoria `LICENSE.VALIDATED` ou `LICENSE.VALIDATION_FAILED`.

Se o servidor estiver indisponível, a operação local ainda pode seguir dentro da tolerância offline configurada. A ideia é não travar uma operação turística no meio do dia só porque a internet virou turista também.
