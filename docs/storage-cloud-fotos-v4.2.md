# PicTour v4.2 — Storage cloud das fotos

A v4.2 transforma a publicação cloud em um fluxo mais próximo de produção: previews continuam públicos/protegidos pela galeria, mas os arquivos finais ficam privados e são liberados por download assinado após a compra.

## O que entrou

- Drivers de storage no backend cloud: `local`, `s3` e `r2`.
- Upload cloud continua pelo Desktop em `POST /api/publish-photo`.
- Separação de objetos:
  - `preview-*` e `thumb-*` para visualização protegida;
  - `private/download-*` para arquivo final.
- Downloads assinados com TTL configurável.
- Endpoint de saúde: `GET /api/storage-info`.
- Configuração visual em **Configurações > Storage cloud**.
- Health do backend exibe driver, bucket, TTL e modo de assinatura.
- Galeria pública passa a receber `downloadUrl` assinado quando a foto está comprada.
- Auditoria local ao validar storage pelo Desktop.

## Variáveis de ambiente recomendadas

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

Para AWS S3:

```env
STORAGE_DRIVER=s3
S3_BUCKET=pictour-photos-prod
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
PICTOUR_STORAGE_SIGNING_SECRET=troque-por-um-segredo-grande
```

## Regra de segurança

- Preview é feito para vender, não para entregar.
- Arquivo limpo/final fica no caminho privado.
- Download limpo só aparece quando a foto está `PURCHASED`.
- Link assinado expira, reduzindo vazamento permanente.

## Como testar

1. Rodar o backend cloud.
2. Ativar cloud no Desktop.
3. Publicar uma sessão no Pós-passeio.
4. Abrir a galeria pública.
5. Fazer checkout/aprovação ou simulação local se liberada no `.env`.
6. Confirmar que a foto comprada exibe botão de download assinado.

## Observação de produção

O modo `local` é útil para desenvolvimento. Para cliente real, use R2/S3 com HTTPS, segredo forte e bucket separado por ambiente.
