# PicTour Desktop v2.1 — Auditoria completa

Esta versão adiciona uma trilha de auditoria local para ações sensíveis do PicTour.

## O que fica registrado

- login aprovado e login recusado;
- troca de senha;
- atualização de configurações, usuários, permissões, pacotes e comissões;
- criação de sessão;
- importação, captura, seleção, favorito, renderização chroma e exportação de fotos compradas;
- abertura de caixa, sangria, fechamento de caixa e cancelamento de venda;
- registro de venda manual e venda online aprovada;
- criação/consulta de checkout Mercado Pago;
- publicação cloud e sincronização de vendas cloud;
- exportação de backup, restauração de backup, fechamento JSON e CSV;
- abertura/fechamento do monitor do cliente.

## Severidades

- `INFO`: operação normal, como importar foto ou abrir monitor.
- `WARNING`: tentativa de login falha ou sincronização com falhas.
- `CRITICAL`: ações que podem afetar dinheiro, segurança ou auditoria: senha, configurações, caixa, venda, cancelamento e backup.

## Tela Auditoria

A aba **Auditoria** permite filtrar por:

- período: 1h, 3h, dia todo, 1 semana, 1 mês ou tudo;
- categoria;
- severidade;
- usuário;
- busca textual.

Também possui exportação CSV dos logs filtrados.

## Proteção de dados sensíveis

Campos com nomes como senha, token, secret e API key são mascarados nos detalhes do log. O objetivo é registrar que a ação aconteceu sem vazar credenciais dentro da auditoria.

## Permissões

Foi criada a permissão granular `AUDIT_LOG`. Gestor/adm vê tudo. Fotógrafo/caixa só enxerga a aba Auditoria se o gestor liberar essa permissão.
