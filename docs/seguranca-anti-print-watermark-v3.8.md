# PicTour Desktop v3.8 — Segurança anti-print e watermark dinâmico avançado

## Objetivo

A v3.8 reforça a proteção dos previews exibidos no balcão, monitor do cliente e galeria pública. O foco é reduzir captura indevida de tela e aumentar rastreabilidade caso uma imagem de preview seja copiada.

> Observação honesta: nenhum software consegue impedir 100% uma pessoa de fotografar a tela com outro aparelho. A estratégia correta é dificultar o uso indevido, reduzir qualidade do preview e gravar dados identificáveis na imagem exibida.

## Principais recursos

- Configuração global de anti-print em `Configurações > Segurança visual`.
- Watermark dinâmica com texto base, código da sessão, código da foto, horário e nome da estação.
- Ajuste de opacidade, densidade, rotação, ruído visual e blur do preview.
- Bloqueio de clique direito e arrastar imagem.
- Escudo visual quando a janela perde foco ou em tentativa de PrintScreen/atalhos sensíveis.
- Guard de baixa resolução para previews.
- Galeria pública local passa a receber a configuração de watermark do banco local.
- Versão atualizada globalmente para `3.8.0`.

## Onde aparece

- Venda Rápida / grade de fotos.
- Monitor do cliente via componente `ProtectedPreview`.
- Galeria pública premium local `/g/:slug`.
- Configurações do gestor.

## Campos adicionados em `settings.antiPrint`

```json
{
  "enabled": true,
  "watermarkText": "PICTOUR PREVIEW",
  "includeSessionCode": true,
  "includePhotoCode": true,
  "includeTimestamp": true,
  "includeStationName": true,
  "opacity": 38,
  "density": 24,
  "rotationDeg": -24,
  "noiseIntensity": 18,
  "previewBlur": 0,
  "resolutionGuard": true,
  "blockContextMenu": true,
  "blockDrag": true,
  "shieldOnBlur": true,
  "shieldAfterInactivitySeconds": 0,
  "showSessionMeta": true
}
```

## Recomendação operacional

Para parques e atrações com alto risco de print, usar:

- Opacidade entre 35% e 50%.
- Densidade entre 20 e 32.
- Horário dinâmico ativado.
- Código da sessão e foto ativados.
- Escudo ao perder foco ativado.
- Entrega limpa somente pela Central de Entrega após pagamento confirmado.

## Validação técnica

Executado com sucesso:

```bash
npm run build
node --check electron/main.cjs
node --check electron/preload.cjs
node --check cloud-backend/server.mjs
```
