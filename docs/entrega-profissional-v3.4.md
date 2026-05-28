# PicTour Desktop v3.4 — Central de entrega profissional

## Objetivo
Fechar o ciclo de venda com uma entrega premium para o cliente final. Após uma venda aprovada, o operador pode gerar um link/QR de entrega com as fotos compradas sem marca d’água.

## O que entrou

- Link público de entrega por venda em `/d/:slug`.
- API local de entrega em `/api/delivery/:slug`.
- Download individual de cada foto comprada.
- Download de todas as fotos em `.zip`.
- Expiração padrão do link em 7 dias.
- Geração/abertura do link direto no Caixa.
- Painel de links de entrega no Pós-passeio.
- Logs locais de acesso/download.
- Atualização automática de status de entrega quando o cliente baixa arquivos.
- Topbar atualizada para `PicTour Desktop v3.4.0`.

## Fluxo operacional

1. Fotógrafo envia fotos pela captura ou portal web.
2. Operador vende no balcão ou pós-passeio.
3. A venda cria/metadados de entrega automaticamente.
4. Operador abre o link/QR de entrega.
5. Cliente acessa no celular e baixa fotos finais.
6. Sistema registra acesso/download.

## Rotas locais

- `/d/:slug` — página pública de entrega.
- `/api/delivery/:slug` — dados da entrega.
- `/api/delivery/:slug/photo/:photoId/preview` — preview sem watermark da foto comprada.
- `/api/delivery/:slug/photo/:photoId/download` — download individual.
- `/api/delivery/:slug/download-all` — ZIP de todas as fotos.

## Observações

A v3.4 usa o servidor local já existente da galeria/portal fotógrafo. Para entrega fora da rede local, o próximo passo é conectar esse fluxo ao backend cloud/Mercado Pago real.
