# PicTour Desktop v4.6.2 — Pagamento dividido e troco no caixa

## Objetivo

Permitir que uma mesma venda presencial seja paga com múltiplas formas de pagamento, sem precisar criar várias vendas para a mesma sessão.

Exemplos suportados:

- Total R$ 100,00: R$ 60,00 no Pix + R$ 40,00 em dinheiro.
- Total R$ 100,00: cliente entrega R$ 200,00 em dinheiro e o sistema calcula R$ 100,00 de troco.
- Venda modular com produtos diferentes e recebimentos separados.

## Venda Rápida

A área de pagamento agora permite adicionar linhas de recebimento:

- Pix manual
- Cartão externo
- Dinheiro BRL
- Dinheiro USD
- Dinheiro EUR
- Dinheiro PYG
- Dinheiro ARS

Cada linha registra o valor informado pelo operador.

## Regras de fechamento

- A venda só pode ser finalizada quando o total pago cobre o total da venda.
- Troco só é permitido quando existe ao menos um pagamento em dinheiro.
- O sistema salva:
  - total da venda
  - total pago em base BRL
  - troco em base BRL
  - lista detalhada de pagamentos/tenders
  - moeda original de cada pagamento

## Caixa

O dinheiro esperado na gaveta considera apenas:

```txt
fundo de troco inicial
+ dinheiro recebido
- troco devolvido
- sangrias
```

Pix e cartão aparecem nos relatórios e comprovantes, mas não aumentam o dinheiro físico esperado no caixa.

## Recibos e relatórios

Recibos de venda, comprovantes de fechamento e exportações agora mostram o detalhamento por forma de pagamento/moeda.
