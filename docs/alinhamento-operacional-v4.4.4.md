# PicTour v4.4.4 — Alinhamento operacional, auditoria e histórico de caixa

## Objetivo

A v4.4.4 é um patch de maturidade operacional para deixar o PicTour mais alinhado com o uso real em parque/ponto de venda antes da landing page e do piloto comercial.

## Abas revisadas

Foram revisadas e atualizadas as mensagens e orientações das áreas:

- Operação
- Implantação
- SaaS/Licença
- Fotógrafo Web
- Auditoria

Essas telas agora refletem melhor o estado atual do produto:

- venda modular no balcão;
- galeria premium focada em produtos digitais;
- caixa com comprovantes assináveis;
- troca de turno/caixa;
- mobile app do fotógrafo com fila offline;
- cloud, storage, assinatura e Mercado Pago como preparação de piloto real.

## Caixa — histórico dos últimos 30 dias

A aba Caixa agora exibe um histórico operacional focado nos últimos 30 dias.

Para cada turno são mostrados:

- código do caixa/turno;
- status aberto/fechado;
- caixa/PDV;
- abertura;
- fechamento;
- atendente de abertura;
- atendente de fechamento;
- marcação de troca de turno/caixa;
- movimentos de abertura, sangria, cancelamento e fechamento;
- total de vendas do turno;
- total de sangrias;
- valor esperado;
- valor contado;
- diferença de fechamento.

## Exportações do histórico

Foram adicionadas duas exportações no histórico de caixa:

- `Salvar TXT`
- `Salvar CSV`

O TXT é voltado para conferência/arquivo operacional, com estrutura legível e área de assinatura por turno.

O CSV é voltado para planilha/contabilidade/auditoria, com linhas separadas para:

- `TURNO`
- `MOVIMENTO`

Campos principais do CSV:

- tipo da linha;
- turno;
- status;
- caixa/PDV;
- abertura;
- fechamento;
- troca de turno;
- tipo de movimento;
- operador;
- valor;
- observação;
- vendas ativas;
- total de vendas;
- sangrias;
- esperado;
- contado;
- diferença.

## Correção incluída

A opção `Troca de turno/caixa após este fechamento` agora é enviada corretamente ao backend no fechamento do caixa.

Antes, o checkbox existia na interface, mas podia não ser repassado ao fechamento. A v4.4.4 corrige esse ponto.

## Auditoria

A exportação de histórico registra evento de auditoria:

- `CASHIER.HISTORY_EXPORT_TXT`
- `CASHIER.HISTORY_EXPORT_CSV`

Com detalhes de:

- período exportado;
- arquivo salvo;
- quantidade de turnos;
- quantidade de movimentos;
- quantidade de vendas relacionadas.

## Versões

- App: `4.4.4`
- Schema local: `444`
- Cloud backend: `4.4.4`
