# PicTour v4.4 — App mobile mais completo

A v4.4 evolui o antigo Fotógrafo Web para um app mobile operacional, acessado por QR Code na rede local.

## Recursos

- Portal mobile em `/photo` com layout otimizado para celular.
- Abas: Captura, Sessão, Fotos e Fila.
- Upload múltiplo com câmera ou galeria do celular.
- Fila local no navegador para momentos de Wi‑Fi instável.
- Acompanhamento de métricas da sessão: fotos, selecionadas, vendidas e fila.
- Grade das fotos da sessão no celular.
- Pré-seleção e favoritos pelo fotógrafo, sincronizando no Desktop.
- Endpoints locais novos:
  - `GET /api/photographer/session/:code`
  - `GET /api/photographer/photo/:photoId/preview`
  - `POST /api/photographer/photo-action`
- Configurações novas do app mobile em Configurações.

## Uso operacional

1. Abra uma sessão no Desktop.
2. Vá para Fotógrafo Web.
3. Escaneie o QR Code no celular.
4. Informe/valide o código da sessão.
5. Envie fotos, marque favoritas e pré-selecione as melhores.

## Observação

O app mobile continua funcionando pela rede local. Para acesso externo fora do Wi‑Fi do parque, use a estratégia cloud/storage das versões 4.0–4.2.
