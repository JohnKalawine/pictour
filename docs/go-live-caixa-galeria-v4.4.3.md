# PicTour v4.4.3 — Go-live real, caixa assinado e galeria digital

## Objetivo

Preparar o PicTour para um teste real controlado, corrigindo pontos comerciais antes de vender/implantar:

- Premium Gallery vendendo apenas produtos digitais online.
- Caixa com comprovantes automáticos de abertura, sangria e fechamento.
- Fechamento com indicação de troca de turno/caixa.
- Fallback seguro em `.txt` quando não houver impressora térmica configurada.

## Premium Gallery

A galeria pública agora filtra os pacotes exibidos para o cliente final. Produtos com nomes que indiquem venda presencial, como impressão, porta-retrato, moldura/frame ou item físico, não aparecem no checkout online.

A regra protege a operação:

- Digital: pode vender online.
- Impresso, porta-retrato e moldura: apenas presencialmente no parque.

## Caixa e comprovantes

Em Configurações > Caixa, agora existem campos para:

- Nome do caixa/PDV.
- Impressora térmica.
- Largura da bobina em caracteres.
- Emissão automática de comprovantes.

Eventos que emitem comprovante:

1. Abertura de caixa.
2. Sangria.
3. Fechamento de caixa.

Todos os comprovantes incluem:

- Empresa.
- Caixa/PDV.
- Código do turno.
- Atendente.
- Horário.
- Estação.
- Valores do movimento.
- Área para assinatura do atendente.

## Fechamento e troca de turno

Na aba Caixa, abaixo do fechamento, existe a opção:

> Troca de turno/caixa após este fechamento

Quando marcada, o comprovante de fechamento registra:

- Troca de turno: SIM.
- Movimento do caixa fechado.
- Movimento total do PDV no dia.
- Total de turnos do dia.
- Total por método de pagamento.
- Sangrias do dia.
- Cancelamentos do dia.

## Fallback `.txt`

Se nenhuma impressora estiver configurada, ou se a impressão falhar, o PicTour mantém uma cópia em:

```txt
pictour-local/cash-receipts
```

Isso evita perder comprovante em operação real.

## Checklist de piloto real

Antes de vender para um parque:

1. Configurar empresa, local, caixa e impressora.
2. Abrir caixa com fundo de troco real.
3. Registrar uma sangria de teste.
4. Fazer venda modular no balcão.
5. Testar Premium Gallery com produto digital.
6. Fechar caixa com e sem troca de turno.
7. Conferir comprovantes impressos ou `.txt`.
8. Validar entrega profissional.
9. Validar BI/funil.
10. Testar Mercado Pago produção com Pix e cartão.

## Versão

- App: `4.4.3`
- Schema local: `443`
- Cloud backend: `4.4.3`
