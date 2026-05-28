# PicTour v4.3 — Assinaturas/planos + monitor do cliente em grid

## Objetivo

A v4.3 consolida o PicTour como produto SaaS vendável por plano, com controle comercial de assinatura e uma melhoria direta no balcão: o monitor do cliente agora pode exibir 1 foto, 3 fotos ou todas as fotos em grid.

## Assinaturas e planos

A aba **SaaS/Licença** recebeu um bloco de assinatura com:

- plano Starter, Pro ou Enterprise;
- status da assinatura: teste, ativa, atrasada, cancelada ou suspensa;
- ciclo mensal ou anual;
- gateway previsto: manual/contrato, Mercado Pago, Stripe ou Pix;
- mensalidade e anualidade;
- próxima cobrança;
- e-mail financeiro;
- dias de tolerância;
- suspensão automática após atraso.

A tela calcula o MRR equivalente para facilitar leitura comercial mesmo quando o cliente está em ciclo anual.

## Cloud Admin

O backend cloud agora mantém uma coleção local de `subscriptions` no estado cloud e expõe:

- `GET /api/admin/subscriptions`
- resumo de assinaturas dentro de `/api/admin/overview`
- criação/atualização de assinatura junto com `/api/licenses/admin/upsert`

A licença passa a carregar metadados de billing como `billingStatus`, `billingCycle` e `subscriptionId`.

## Monitor do cliente em grid

Na **Venda Rápida**, foi adicionada a opção de controlar como as fotos aparecem no monitor do cliente:

- **1 foto**: foco total no detalhe da foto atual;
- **3 fotos**: comparação rápida de opções;
- **Todas**: grid organizado para escolha rápida no balcão.

O monitor continua usando preview protegido com watermark dinâmico.

## Observação operacional

O modo grid ajuda muito quando o cliente está escolhendo várias fotos em família/grupo. O operador pode alternar rapidamente entre foco individual e visão geral, reduzindo indecisão e aumentando chance de pacote maior.
