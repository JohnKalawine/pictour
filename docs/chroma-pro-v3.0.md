# PicTour v3.0 — Chroma Studio Pro

## Objetivo

A versão 3.0 transforma o Chroma Studio em uma área de produção mais profissional, com foco em fotos vendáveis para turismo: recorte IA, templates, cenários avançados, formatos finais e acabamento visual.

## Recorte IA profissional

O botão **IA profissional** tenta executar a remoção de fundo local usando o motor opcional `@imgly/background-removal` e depois aplica uma etapa de polimento:

- limpeza de alpha/bordas;
- redução de vazamento verde;
- feather para cabelo/bordas suaves;
- preservação de sombra e ajustes de pessoa;
- fallback automático para chroma verde quando a IA não estiver disponível.

A IA continua bloqueada por plano: somente **Enterprise** libera o botão de IA.

## Templates avançados

Foram adicionados templates prontos:

- Postal Cataratas;
- Noite Premium;
- Aventura Selva;
- Pôster Pôr do Sol;
- Capa Clean.

Cada template aplica automaticamente:

- cenário recomendado;
- formato final;
- overlay visual;
- enquadramento inicial;
- contraste/saturação/temperatura;
- sombra e intensidade visual.

O operador ainda pode ajustar tudo manualmente antes de renderizar.

## Cenários avançados

Além dos cenários internos, agora existe upload temporário de cenário personalizado em JPG/PNG/WebP.

O cenário personalizado é incorporado no render final. Nesta versão ele não vira biblioteca permanente ainda; o objetivo é permitir operação rápida para teste e produção pontual.

## Formatos finais

Formatos disponíveis:

- Digital 3:2 — 1440x960;
- Story 9:16 — 1080x1920;
- Feed quadrado — 1200x1200;
- Impressão 10x15 — 1800x1200.

## Antes/depois

O botão **Antes/depois** mostra uma comparação visual no canvas, útil para validar recorte e vender o resultado ao operador/gestor. Ao renderizar final, a comparação é removida automaticamente.

## Próximas melhorias sugeridas

- biblioteca persistente de cenários por parque/unidade;
- salvar templates personalizados;
- processamento em lote;
- sombra automática baseada no chão;
- IA com modelo alternativo/licença comercial;
- fila de renderização para alto volume.
