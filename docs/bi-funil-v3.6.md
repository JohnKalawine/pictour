# PicTour Desktop v3.6 — Relatórios/BI avançado por funil

## Objetivo

A v3.6 adiciona uma tela dedicada de BI para enxergar o funil completo da operação:

1. Sessões criadas
2. Fotos capturadas/importadas
3. Fotos selecionadas
4. Checkouts online criados
5. Vendas aprovadas
6. Entregas/downloads confirmados

A ideia é mostrar onde a operação está convertendo e onde o cliente está escapando, para ajudar o gestor a decidir preço, pacote, oferta e rotina de balcão.

## Tela nova

Menu lateral:

- **BI/Funil**

Permissão usada:

- `REPORTS`

Gestores acessam automaticamente. Usuários de equipe precisam da permissão de relatórios habilitada.

## Filtros

A tela possui filtros por:

- Hoje
- 7 dias
- 30 dias
- Tudo
- Todos os locais ou local específico

## Métricas principais

Cards principais:

- Receita no período
- Ticket médio
- Conversão foto → compra
- Percentual de vendas pós-passeio

## Funil visual

A seção principal mostra barras de conversão com:

- quantidade absoluta por etapa
- conversão em relação à etapa anterior
- observação operacional da etapa
- gargalo principal calculado automaticamente

## Rankings

A v3.6 adiciona:

- ranking de pacotes por receita
- vendas por método de pagamento
- saúde dos checkouts online: aprovados, pendentes e perdidos

## Entrega/download

A tela cruza vendas com entrega profissional da v3.4/v3.5:

- vendas com link de entrega
- vendas baixadas pelo cliente
- eventos de download registrados

## Exportação CSV

A tela permite exportar:

- funil em CSV
- vendas do BI em CSV

Esses CSVs são gerados no navegador/Electron, sem depender de backend.

## Alterações técnicas

Arquivos principais:

- `src/screens/FunnelBI.tsx`
- `src/components/Sidebar.tsx`
- `src/components/Topbar.tsx`
- `src/App.tsx`
- `src/lib/types.ts`
- `src/styles.css`

Schema local:

- `DB_SCHEMA_VERSION = 36`

Migração adiciona apenas log/normalização. Não há quebra de dados.

## Observação de produto

A v3.6 não é só “relatório bonito”. Ela prepara a operação para decisões mais lucrativas:

- qual pacote vender mais agressivamente
- onde treinar o operador
- se o pós-passeio está recuperando venda
- se o checkout está ficando pendente demais
- se a entrega final está sendo realmente baixada
