# PicTour Desktop v3.2.1 — Correções operacionais Chroma/Captura

## Objetivo

Patch de estabilidade e acabamento em cima da v3.2, focado nos pontos observados em operação real após deploy da galeria premium.

## Ajustes entregues

- Atualização do topo para `PicTour Desktop v3.2.1`.
- Correção visual dos cenários rápidos na aba Captura: agora o botão selecionado muda estado e exibe feedback.
- Proteção de seleção de sessão ativa no App: quando a sessão selecionada deixa de existir, é fechada ou fica inválida após uma venda, o sistema seleciona automaticamente a sessão aberta mais recente.
- Ao criar nova sessão, a sessão recém-criada passa a ser selecionada imediatamente, evitando a sensação de travamento na Captura.
- Chroma Studio limpo: removida a faixa de templates promocionais pré-prontos do canvas principal.
- Formato final `15x20` adicionado com resolução 2400x1800.
- Biblioteca Chroma agora separa cenários oficiais de overlays/templates oficiais.
- Overlays e templates cadastrados em Configurações aparecem no Chroma Studio para seleção.
- Adicionados controles de overlay: X, Y, escala, rotação e opacidade.
- Render final passa a aplicar overlay/template oficial carregado da biblioteca.
- Metadados do overlay oficial usado são salvos na composição.

## Observação técnica

A captura continua salvando a foto original, por segurança operacional. O cenário rápido agora serve como seleção/feedback de referência no fluxo, enquanto a aplicação final profissional continua concentrada no Chroma Studio.
