# PicTour Desktop v3.3 — App mobile/web para fotógrafo externo

## Objetivo

A v3.3 adiciona um portal mobile/web para fotógrafos externos enviarem fotos diretamente para sessões abertas do PicTour Desktop, sem precisar importar arquivos manualmente no balcão.

## Fluxo operacional

1. O operador abre a aba **Fotógrafo Web** no PicTour Desktop.
2. O sistema mostra um QR Code para o portal local `/photo`.
3. O fotógrafo escaneia o QR no celular conectado na mesma rede Wi‑Fi do desktop.
4. O fotógrafo escolhe a sessão aberta, confirma o código de acesso e seleciona fotos.
5. As fotos entram automaticamente na sessão e passam a aparecer em Captura, Chroma Studio, Venda Rápida e Pós-passeio.

## Segurança operacional

- O upload só aceita sessões com status `OPEN`.
- O fotógrafo precisa informar o código de acesso da sessão.
- O servidor limita a quantidade de fotos por envio.
- Cada upload gera auditoria como `PHOTO.PHOTOGRAPHER_WEB_UPLOAD`.
- As fotos são armazenadas na biblioteca local do PicTour, com identificação `photographer-web` no nome original.

## Rotas locais

- `GET /photo` — portal mobile/web do fotógrafo.
- `GET /api/photographer/sessions` — lista sessões abertas.
- `POST /api/photographer/upload` — envia fotos em base64 para a sessão.

## Observações

Este portal funciona na rede local. Para fotógrafos fora do Wi‑Fi do parque, a próxima evolução recomendada é a publicação cloud do portal de captura, com autenticação de fotógrafo e fila offline.
