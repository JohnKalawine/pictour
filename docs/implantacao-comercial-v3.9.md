# PicTour Desktop v3.9 — Instalador, onboarding, demo, diagnóstico e backup

A v3.9 é uma versão de hardening comercial. O objetivo não é adicionar mais uma aba operacional, e sim deixar o PicTour mais pronto para demonstração, implantação e venda para parques, atrações e operações turísticas.

## Principais entregas

- Nova tela **Implantação**.
- Checklist de onboarding da primeira implantação.
- Modo demonstração comercial com sessões, fotos, venda e BI populados.
- Diagnóstico com leitura de backup, demo, empacotamento, estação, cloud, Mercado Pago, galeria e segurança visual.
- Backup com metadados comerciais (`lastBackupAt`, `lastBackupPath`).
- Restauração registrando `lastRestoreAt`.
- Preparação explícita para instalador Windows via `npm run build:app`.
- Schema local atualizado para `39`.
- `package.json` atualizado para `3.9.0`.
- Cloud backend atualizado para `v3.9`.

## Nova tela: Implantação

A tela reúne o que um gestor precisa antes de colocar o PicTour em produção:

1. Empresa e estação.
2. Locais/atrações.
3. Pacotes e preços.
4. Mercado Pago.
5. Segurança visual.
6. Backup.
7. Modo demonstração.

Cada etapa pode ser marcada como concluída. O sistema também calcula um score comercial simples para mostrar se a operação está pronta para apresentação/implantação.

## Modo demonstração

O botão **Carregar demo** gera dados suficientes para apresentar o sistema sem depender de uma operação real:

- Sessões demo.
- Fotos demo.
- Venda demo.
- Status e BI preenchíveis.
- Checklist comercial parcialmente concluído.

Observação: as fotos demo são registros operacionais sem arquivo de imagem real, pensadas para demonstrar fluxo, BI e vendas. Para demo visual completa, importe imagens reais depois.

## Backup e restauração

A exportação de backup continua usando arquivo `.pictour-backup.json`, agora registrando metadados em `settings.commercialSetup`:

- `lastBackupAt`
- `lastBackupPath`
- `lastRestoreAt`

Isso ajuda no diagnóstico e na confiança durante implantação.

## Instalador profissional

O projeto mantém `electron-builder` com target NSIS no Windows. Para gerar o instalador:

```bash
npm install
npm run build:app
```

A saída esperada fica em:

```txt
release/
```

Com:

- Setup Windows.
- Ícone PicTour.
- Atalho na área de trabalho.
- Atalho no menu iniciar.

## Diagnóstico comercial

O diagnóstico passou a considerar:

- versão instalada;
- modo empacotado/dev;
- banco local;
- biblioteca de fotos;
- backup;
- modo demo;
- Mercado Pago;
- cloud;
- multi-estação;
- fotógrafo web;
- segurança visual;
- status da licença;
- senha padrão admin.

## Roadmap preservado

A v3.9 prepara o caminho para:

- v4.0 — Cloud SaaS real e licenciamento.
- v4.1 — Painel administrativo web.
- v4.2 — Storage cloud das fotos.
- v4.3 — Assinaturas/planos.
- v4.4 — App mobile mais completo.
