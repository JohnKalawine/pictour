# PicTour Desktop v2.7 — Sessões abertas nas telas operacionais

## Objetivo

A partir desta versão, telas de operação diária exibem e usam apenas sessões abertas. Sessões encerradas continuam existindo para histórico, auditoria e filtros de caixa, mas não aparecem nas telas onde o operador captura, edita ou vende fotos.

## Telas afetadas

- Operação
- Captura
- Chroma Studio
- Venda Rápida
- Pós-passeio

## Regra principal

Sessões com status `CLOSED` não entram no seletor das telas operacionais.

Isso evita que sessões antigas se acumulem na operação do dia e reduz o risco de:

- importar foto na sessão errada;
- vender foto de sessão encerrada;
- publicar galeria antiga por engano;
- editar uma foto de passeio antigo no Chroma Studio.

## Onde sessões encerradas ainda aparecem

- Aba Sessões, usando o filtro `Encerradas` ou `Todas`;
- Caixa, para relatórios e filtros históricos;
- Auditoria, quando alguma ação antiga precisar ser rastreada.

## Comportamento quando uma sessão é encerrada

Ao encerrar a sessão ativa, o PicTour seleciona automaticamente a próxima sessão aberta disponível. Se não existir sessão aberta, as telas operacionais mostram aviso orientando o operador a criar ou reabrir uma sessão.

