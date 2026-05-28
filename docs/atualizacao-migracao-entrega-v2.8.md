# PicTour Desktop v2.8 — Atualização, migração e entrega profissional

Esta versão fortalece a operação para uso em empresas reais, com foco em atualização segura, migração de dados e rastreabilidade da entrega das fotos.

## 1. Migração segura de dados

Ao abrir o PicTour, o app agora verifica a versão do banco local (`schemaVersion`). Se o banco estiver em uma versão antiga, o sistema:

1. cria um backup automático antes da migração;
2. atualiza a estrutura do banco;
3. adiciona campos novos sem apagar dados antigos;
4. registra o evento na Auditoria;
5. exibe o schema atual no Diagnóstico.

A pasta de backups de migração fica dentro da pasta local do PicTour, em `migration-backups`.

## 2. Verificação de atualização

A aba Diagnóstico ganhou o botão **Verificar atualização**.

Por padrão, o app tenta consultar:

```txt
http://127.0.0.1:8787/api/updates/latest
```

Em produção, a empresa deve apontar para o backend cloud público do PicTour.

O backend retorna:

- versão mais recente;
- link de download, se configurado;
- notas da versão;
- data da verificação.

## 3. Recibos de venda

Na tabela do Caixa, cada venda ativa agora possui o botão **Recibo**.

O recibo exporta um `.txt` com:

- empresa;
- código do recibo;
- código da venda;
- data;
- sessão;
- cliente;
- local/parque;
- vendedor;
- pacote;
- forma de pagamento;
- valor recebido;
- fotos compradas;
- status de entrega.

## 4. Entrega profissional

Cada venda ativa possui:

- status de entrega pendente/entregue;
- botão **Entregar fotos**;
- botão **Marcar entregue**.

Ao clicar em **Entregar fotos**, o PicTour exporta as fotos da venda para uma pasta escolhida e marca a venda como entregue automaticamente.

Ao clicar em **Marcar entregue**, o sistema apenas registra a entrega, útil quando as fotos já foram entregues por outro meio.

## 5. Auditoria

A v2.8 registra logs para:

- migração automática;
- verificação de atualização;
- exportação de recibo;
- exportação/entrega de fotos;
- marcação manual de entrega.

## 6. Backend cloud

O backend ganhou o endpoint:

```txt
GET /api/updates/latest
```

Variáveis novas no `.env` do backend:

```txt
PICTOUR_LATEST_VERSION=2.8.0
PICTOUR_DOWNLOAD_URL=
PICTOUR_RELEASE_NOTES=Migração segura de dados|Recibos e entrega profissional|Verificação de atualização
```

## 7. Recomendação operacional

No piloto real, a sequência recomendada é:

1. abrir o caixa;
2. vender fotos normalmente;
3. exportar recibo da venda quando necessário;
4. entregar fotos pelo botão **Entregar fotos**;
5. conferir pendências de entrega no Caixa;
6. fechar caixa;
7. exportar relatório.
