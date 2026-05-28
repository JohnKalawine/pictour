# PicTour v2.3 — Fundo de troco e conferência de caixa

Esta versão profissionaliza o fluxo de caixa físico.

## Abertura de caixa

- O campo de abertura agora representa o **fundo de troco fixo**.
- O valor recomendado padrão é **R$500,00**.
- A abertura exige um valor maior que zero quando a opção “Exigir fundo de troco na abertura” estiver ativa.
- O gestor pode alterar o valor recomendado em **Configurações → Caixa**.

## Fechamento de caixa

No fechamento existem dois controles separados:

1. **Total contado em caixa**: todo dinheiro físico contado no fechamento, incluindo vendas em dinheiro e fundo de troco.
2. **Fundo de troco final**: valor que deve permanecer no caixa para o próximo turno.

O PicTour recomenda que o fundo final seja igual ao fundo informado na abertura. Exemplo:

- Abertura: R$500,00
- Vendas em dinheiro: R$800,00
- Sangrias: R$300,00
- Total esperado: R$1.000,00
- Fundo final recomendado: R$500,00

Se o fundo final for diferente da abertura, o fechamento mostra alerta e registra a diferença na auditoria.

## Auditoria

Abertura e fechamento registram:

- valor do fundo de troco inicial;
- valor recomendado;
- total contado;
- total esperado;
- fundo final contado;
- diferença do fundo;
- operador responsável.
