# PicTour v2.6 — Caixa obrigatório e sessões encerradas

## Caixa obrigatório para venda presencial

A partir da v2.6, a Venda Rápida bloqueia o registro de pagamento presencial quando não existe caixa aberto.

Fluxo recomendado:

1. Caixa → Abrir caixa.
2. Venda Rápida → selecionar sessão aberta.
3. Selecionar fotos pelo botão Selecionar.
4. Registrar pagamento.
5. Caixa → sangria/cancelamento/fechamento no fim do turno.

Toda venda presencial registrada recebe vínculo com o caixa aberto (`cashShiftId`). Isso melhora fechamento, auditoria e relatórios por turno.

## Tentativa de venda com caixa fechado

A tela mostra um aviso “Caixa fechado” e um botão para ir direto para a aba Caixa.

O processo principal também valida a regra para evitar bypass via IPC. Se uma venda presencial for tentada com caixa fechado, ela é bloqueada e registrada na auditoria como `SALE.BLOCKED_CASH_CLOSED`.

## Sessões encerradas

A aba Sessões agora possui filtros:

- Abertas;
- Encerradas;
- Todas.

Sessões encerradas saem da lista operacional padrão para reduzir acúmulo no balcão. Elas continuam salvas para histórico, auditoria, pós-passeio e consulta.

Ao encerrar uma sessão, as seleções pendentes das fotos da sessão são limpas para evitar venda acidental.

## Reabertura

Uma sessão encerrada pode ser reaberta pela aba Sessões. Ao reabrir, ela volta para o fluxo operacional normal.

## Observação sobre avisos do npm

Os avisos de `deprecated` vistos no `npm install` vêm de dependências transitivas de ferramentas de build, principalmente empacotamento Electron. Eles não impediram instalação, build nem execução, e o `npm audit` retornou 0 vulnerabilidades nesta versão.
