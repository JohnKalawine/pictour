# PicTour v3.2 — Galeria pública premium com upsell

## Objetivo

Transformar o pós-passeio em um canal de venda real: o cliente acessa a galeria por QR/link protegido, vê previews com watermark, seleciona fotos, recebe sugestão de pacote e conclui uma compra/reserva local.

## Entregas desta versão

- Galeria pública local em `/g/:slug` com código de acesso.
- Validação de expiração da sessão.
- Preview protegido com watermark dinâmico contendo PicTour, código da sessão e código da foto.
- Pacotes ativos carregados na galeria do cliente.
- Upsell inteligente: o pacote recomendado muda conforme a quantidade de fotos selecionadas.
- Carrinho público com contagem, pacote e total.
- Simulação de compra local registrando venda `POST_TOUR`, marcando fotos como compradas e liberando download.
- Venda registra `packageName` do pacote usado na galeria.

## Fluxo do operador

1. Abrir a sessão no Pós-passeio.
2. Compartilhar o QR Code/link protegido com o cliente.
3. O cliente abre no celular, informa o código e escolhe as fotos.
4. O sistema sugere o melhor pacote.
5. Ao confirmar, as fotos compradas são liberadas para download/exportação.

## Próximas melhorias naturais

- Checkout Mercado Pago direto na galeria pública.
- Link cloud externo com domínio do parque.
- Download ZIP pós-pagamento.
- Métricas de conversão por pacote e por cenário.
