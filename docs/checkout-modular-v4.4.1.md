# PicTour v4.4.1 — Checkout modular de itens e monitor horizontal

## Objetivo

Ajustar a Venda Rápida para permitir uma única venda com múltiplos produtos/pacotes independentes, cada um com seu próprio slot de foto.

Exemplo de uso:

- 1 Foto Impressa + Digital
- 1 Foto Digital
- 1 Porta-retrato

Todos entram na mesma venda, com preços somados, sem precisar criar várias vendas para a mesma sessão.

## Venda Rápida

### Antes

O operador escolhia um pacote único e selecionava várias fotos para aquele pacote.

### Agora

O operador usa o botão `+` ao lado de cada produto/pacote para criar slots independentes:

1. Clica no `+` de “1 Foto Impressa + Digital”
2. Seleciona uma foto para esse slot
3. Clica no `+` de “1 Foto Digital”
4. Seleciona outra foto
5. Clica no `+` de “Porta-retrato”
6. Seleciona a foto desejada
7. O total é a soma dos itens preenchidos

## Registro da venda

A venda agora pode salvar `saleLineItems`, contendo:

- pacote/produto usado
- foto vinculada ao slot
- código da foto
- preço do item
- moeda

As fotos únicas continuam sendo marcadas como compradas para entrega/download.

## Monitor do cliente

O grid do monitor foi corrigido para manter as fotos sempre em formato horizontal:

- 1 foto: preview grande
- 3 fotos: cards horizontais
- todas: grid horizontal com `aspect-ratio: 16/9`

Isso evita o efeito de cards altos tipo story/9:16 quando há muitas fotos.

## Versão

- App: 4.4.1
- Schema: mantido em 44, pois a alteração é compatível com dados existentes
