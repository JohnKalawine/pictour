# PicTour v4.4.2 — Correções comerciais

## Objetivo

Corrigir pontos críticos do fluxo comercial após a v4.4.1:

- entrega profissional sem carregar/atualizar fotos;
- galeria pública premium ainda limitada ao checkout de pacote único;
- monitor do cliente sem atualizar quantidade e preço após vendas/seleções modulares.

## Entrega profissional

A Central de Entrega agora é mais resiliente:

- reconstrói os `photoIds` da venda a partir de `saleLineItems` quando necessário;
- lista fotos vinculadas mesmo quando algum arquivo ainda não existe na estação atual;
- informa ao cliente/operador quando o arquivo precisa ser sincronizado/importado naquela estação;
- mantém o download individual e ZIP somente para arquivos realmente disponíveis;
- atualização/reload da página de entrega reflete o estado atual da venda.

## Premium Gallery modular

A galeria pública `/g/:slug` agora usa o mesmo conceito do caixa modular:

- cada produto/pacote tem botão `+`;
- cada clique cria um slot independente;
- cada slot recebe uma foto própria;
- é possível misturar foto digital, impressa + digital, porta-retrato e outros itens na mesma compra;
- o total soma os preços de todos os slots preenchidos;
- a venda grava `saleLineItems` com pacote, foto, preço e moeda.

## Meio de pagamento na galeria

Adicionado seletor de pagamento no checkout público:

- Pix;
- Cartão.

No modo local, a venda continua sendo aprovada/local para operação offline. No modo cloud/Mercado Pago, esses campos já deixam o fluxo preparado para encaminhar Pix/cartão ao checkout real.

## Monitor do cliente

A sincronização do monitor agora considera o checkout modular em montagem na Venda Rápida:

- total atualizado em tempo real;
- quantidade de itens/fotos atualizada em tempo real;
- resumo dos produtos/pacotes atualizado em tempo real;
- fotos exibidas no monitor refletem os slots preenchidos;
- ao trocar sessão, o preview modular é limpo para evitar valor antigo ou `R$ 0,00` preso.

## Versão

- App: `4.4.2`
- Schema local: `442`
- Cloud backend: `4.4.2`
