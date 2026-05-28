# PicTour v3.7 — Multi-estação / sincronização em rede local

## Objetivo

Permitir que uma operação use uma estação principal como servidor local e outras máquinas como estações secundárias, todas na mesma rede Wi‑Fi/cabeada.

Fluxo recomendado:

1. A máquina principal fica com as sessões, fotos, vendas, entregas e configurações completas.
2. A máquina secundária configura a URL da principal e o mesmo token local.
3. A secundária puxa o snapshot da principal manualmente ou em intervalo automático.
4. As fotos são baixadas para a biblioteca local da secundária, evitando depender de caminhos absolutos da principal.

## Configuração

Em **Configurações > Rede local > Multi-estação v3.7**:

### Estação principal

- Ativar sincronização em rede local.
- Modo: `Principal / servidor da operação`.
- Definir um token local forte.
- Usar uma das URLs de rede exibidas, por exemplo: `http://192.168.0.10:3888`.

### Estação secundária

- Ativar sincronização em rede local.
- Modo: `Secundária / balcão adicional`.
- Informar a URL da estação principal.
- Usar o mesmo token local.
- Clicar em **Puxar da principal agora**.

## Endpoints locais

A estação principal expõe endpoints protegidos por token:

- `GET /api/station/status`
- `GET /api/station/snapshot?token=...`
- `GET /api/station/photo/:photoId?token=...`

## Segurança

- O snapshot completo exige o token local.
- Fotos também exigem token.
- O sistema foi pensado para rede local confiável, não para internet aberta.
- Para internet pública, use o backend cloud/Mercado Pago/galeria pública.

## Versão global

A versão do frontend agora fica centralizada em:

```ts
src/lib/appVersion.ts
```

O Electron/auditoria usa a versão do `package.json`.

Isso evita esquecer versão antiga em telas internas como Chroma, Configurações, BI e Login.
