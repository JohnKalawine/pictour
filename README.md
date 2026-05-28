# PicTour Desktop v4.1 — Painel administrativo web SaaS

## Destaques da v4.1

- Cloud backend com painel web em `/admin?token=SEU_TOKEN`.
- KPIs executivos: MRR estimado, empresas, alertas, uso mensal e dispositivos.
- Cadastro/edição de empresas e licenças diretamente no navegador.
- Ações rápidas: ativar, suspender e renovar +30 dias.
- Filtros por busca, status e plano.
- Aba de dispositivos com check-ins das estações.
- Área comercial cloud com checkouts, vendas, galerias e receita aprovada.
- API `/api/admin/overview` e exportação CSV de licenças.
- Desktop atualizado para `4.1.0`, schema local 41 e painel SaaS apontando para `/admin`.

Teste rápido:

```bash
cd cloud-backend
npm install
npm run dev
```

Abra:

```txt
http://127.0.0.1:8787/admin?token=pictour_admin_secret
```

Documentação: `docs/painel-admin-web-v4.1.md`.

# PicTour Desktop v3.7 — Multi-estação / sincronização em rede local

## Destaques da v3.7

- Estação principal/secundária em rede local.
- Snapshot protegido por token local.
- Pull manual ou automático da estação principal.
- Download dos arquivos de foto para a estação secundária.
- Versão global no frontend via `src/lib/appVersion.ts`.
- `package.json` atualizado para `3.7.0`, usado pelo Electron/auditoria.

# PicTour Desktop v3.2.1 — Premium Gallery + Chroma/Captura Fixes

Esta versão adiciona recorte IA profissional, templates/cenários avançados, formatos finais e acabamento visual no Chroma Studio.

## Destaques da v3.0

- Chroma Studio Pro com templates prontos para turismo.
- Recorte IA profissional com polimento de bordas.
- Upload temporário de cenário personalizado.
- Formatos finais: digital 3:2, story 9:16, feed quadrado e impressão 10x15.
- Overlays visuais: postal, pôster, aventura e capa luxury.
- Comparação antes/depois no canvas.
- Composição salva com metadados de template, formato, overlay e cenário.
- IA permanece limitada ao plano Enterprise.
- Documentação: `docs/chroma-pro-v3.0.md`.

# PicTour Desktop v2.6

Versão com caixa obrigatório para venda presencial e encerramento/reabertura de sessões.




## Novidades da v2.5

- Backend cloud agora possui **painel administrativo de licenças**.
- Nova URL local: `http://127.0.0.1:8787/admin?token=pictour_admin_secret`.
- Criação/renovação/suspensão de empresas contratantes.
- Endpoint `POST /api/licenses/validate` para o desktop validar licença.
- Configurações → Licença agora tem botão **Validar no servidor**.
- Desktop recebe plano, status, validade, limites e recursos direto da cloud.
- Auditoria registra validação aprovada ou recusada.
- Documentação em `docs/licenciamento-servidor-v2.5.md`.

### Teste rápido de licenciamento v2.5

1. Rode o backend: `cd cloud-backend && npm run dev`.
2. Abra `http://127.0.0.1:8787/admin?token=pictour_admin_secret`.
3. Cadastre uma empresa e copie o ID + chave.
4. No desktop, configure a URL `http://127.0.0.1:8787`.
5. Clique em **Validar no servidor**.


## Novidades da v2.3

- Fundo de troco obrigatório na abertura do caixa.
- Valor recomendado padrão de R$500,00.
- Configuração do fundo de troco em Configurações → Caixa.
- Fechamento com conferência separada do total contado e do fundo de troco final.
- Auditoria registra diferença do fundo de troco.

# PicTour Desktop v2.2

Versão focada em estabilização operacional, onboarding de primeiro uso, status da operação e checklist de piloto real.


Versão com auditoria completa e logs de ações sensíveis.

## Destaques da v2.1

- nova aba **Auditoria**;
- logs de login, senha, configurações, caixa, vendas, backup, fotos, cloud e monitor do cliente;
- filtro por usuário, categoria, severidade, período e busca;
- exportação CSV dos logs filtrados;
- permissão granular `AUDIT_LOG`;
- mascaramento de senhas, tokens e chaves nos detalhes da auditoria;
- limite local de 5.000 eventos recentes para manter o app leve.

# PicTour Desktop v1.9 — Commissions Reports Permissions

Versão desktop do PicTour para operação de turismo/fotos: sessões, captura, chroma, venda rápida, pós-passeio, cloud, Mercado Pago e caixa local.

## O que entrou na v1.9

- Sincronização de vendas aprovadas na cloud de volta para o desktop.
- Botão **Sincronizar vendas** na aba **Pós-passeio**.
- Fotos compradas pelo celular/galeria cloud passam a ficar como `PURCHASED` no desktop.
- Caixa local recebe as vendas feitas pela galeria cloud.
- Evita duplicar venda usando `cloudSaleId`, `externalReference` e `checkoutId`.
- Histórico online local recebe checkouts cloud sincronizados.
- Backend cloud ganhou endpoint interno `/api/sync/sales`.
- Backend cloud retorna sessões, fotos compradas, vendas aprovadas e checkouts.

## Rodar desktop

```bash
npm install
npm run dev
```

## Rodar backend cloud local

```bash
cd cloud-backend
npm install
npm run dev
```

Health check:

```txt
http://127.0.0.1:8787/health
```

## Configuração cloud no desktop

Na aba **Configurações**, use para teste local:

```txt
Ativar backend cloud: ligado
URL da API cloud: http://127.0.0.1:8787
Chave interna da API: pictour_dev_secret
URL pública da galeria: http://127.0.0.1:8787
```

## Fluxo de teste v1.9

1. Configurações → criar local/parque e pacotes.
2. Sessões → criar sessão.
3. Captura → importar/tirar fotos.
4. Pós-passeio → Publicar sessão.
5. Abrir cloud.
6. Na galeria cloud → selecionar fotos → simular compra ou pagar online.
7. Voltar ao desktop → Pós-passeio → Sincronizar vendas.
8. Caixa → conferir venda importada da cloud.

## Build

```bash
npm run build
```

## Instalador Windows

```bash
npm run build:app
```

O instalador sai em `release/`.

## v1.9 — Comissões, relatórios e permissões

### Comissões

A v1.9 adiciona configuração de comissão em `Configurações → Comissões`:

- **Sem comissão**: nenhuma comissão é calculada.
- **Comissão individual**: cada venda gera comissão para o vendedor selecionado na Venda Rápida. O percentual pode ser padrão ou individual por usuário.
- **Comissão coletiva/equipe**: cada venda gera uma comissão total e o valor é dividido igualmente entre os membros marcados da equipe. Opcionalmente gestores podem entrar na divisão.

O cálculo usa o valor base em BRL da venda (`amountBaseCents`). As vendas novas recebem um snapshot da comissão no momento do registro, evitando que alterações futuras de percentual mudem o histórico antigo.

### Relatórios

A tela de Caixa agora mostra:

- total vendido no filtro atual;
- total de comissões;
- resumo por vendedor;
- resumo por membro comissionado;
- coluna de comissão por venda;
- CSV com colunas de comissão;
- fechamento de caixa em JSON com `commissionSummary`.

### Permissões

As regras de permissão continuam assim:

- **Gestor/adm**: acessa configurações, usuários, permissões, comissões, backup e relatórios.
- **Fotógrafo/Caixa**: opera sessão, captura, venda rápida, pós-passeio e caixa.
- **Fotógrafo/Caixa com acesso adm**: acessa configurações operacionais, mas não pode alterar gestores/permissões. Regras de comissão continuam restritas ao gestor/adm.



## v2.0 — Caixa e permissões

Esta versão adiciona abertura de caixa, sangria, cancelamento de venda, fechamento de caixa com diferença, permissões granulares por tela/ação e relatório atualizado.

Leia também: `docs/caixa-permissoes-v2.md`.


## v2.2 — Estabilização operacional

- Nova aba **Operação** com prontidão do sistema.
- Checklist de primeiro uso para empresa nova.
- Checklist de piloto real com metas de teste.
- Atalhos guiados para configurar empresa, abrir caixa, criar sessão, capturar, vender, publicar pós-passeio e conferir auditoria.
- Indicadores de caixa, sessão ativa, monitor do cliente, vendas, cloud e Mercado Pago.
- Permissão granular `OPERATION_STATUS`.


## Novidades da v2.4

- Aba de licença/assinatura em Configurações.
- Planos Starter, Pro e Enterprise.
- Status: teste, ativa, tolerância offline, expirada e suspensa.
- Limites configuráveis de usuários, locais/parques e fotos por mês.
- Recursos por plano: cloud, Mercado Pago, recorte IA, auditoria, multi-local e relatórios avançados.
- Aba Operação agora valida a licença como item de prontidão.
- Diagnóstico mostra plano/status/dias restantes.
- Documentação em `docs/licenciamento-v2.4.md`.


## v2.8 — Sessões abertas nas telas operacionais

- Captura, Chroma Studio, Venda Rápida, Pós-passeio e Operação agora trabalham apenas com sessões abertas.
- Sessões encerradas continuam disponíveis em Sessões, Caixa e Auditoria para histórico.
- Quando não existir sessão aberta, as telas operacionais mostram aviso e bloqueiam ações de captura/publicação/venda.


## Novidades da v2.8

- Migração segura do banco local com backup automático antes de atualizar o schema.
- Diagnóstico mostra schema local, última migração e status de atualização.
- Botão **Verificar atualização** usando o endpoint `/api/updates/latest` do backend cloud.
- Recibo por venda no Caixa.
- Exportação das fotos de uma venda específica.
- Status de entrega pendente/entregue por venda.
- Auditoria para atualização, migração, recibo e entrega.

Documentação detalhada: `docs/atualizacao-migracao-entrega-v2.8.md`.

## v3.9 — Comercial / implantação

A v3.9 adiciona a tela **Implantação**, com onboarding guiado, modo demonstração, diagnóstico comercial, metadados de backup/restauração e instruções para gerar instalador Windows com `npm run build:app`.

Roadmap seguinte:

- v4.0 — Cloud SaaS real e licenciamento
- v4.1 — Painel administrativo web
- v4.2 — Storage cloud das fotos
- v4.3 — Assinaturas/planos
- v4.4 — App mobile mais completo
