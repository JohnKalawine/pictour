# PicTour v4.6 — Demo comercial guiada + dados fictícios bonitos

A v4.6 adiciona uma camada de apresentação comercial ao PicTour, pensada para demonstrações rápidas com parques, atrações turísticas, fotógrafos de turismo e operadores de foto lembrança.

## Objetivo

Transformar o PicTour em uma demo vendável, com dados realistas e fluxo guiado de 8 a 10 minutos:

1. Visão executiva do produto
2. Fotógrafo mobile
3. Sessões/captura
4. Checkout modular no balcão
5. Galeria premium pós-passeio
6. Entrega profissional
7. Caixa assinado e auditoria
8. BI/funil comercial

## O que foi adicionado

- Nova aba **Demo Guiada**.
- Roteiro de apresentação com fala sugerida, o que mostrar e resultado percebido.
- Botão **Carregar demo premium**.
- Dados fictícios mais bonitos e comerciais:
  - clientes com nomes realistas;
  - sessões abertas e vendidas;
  - fotos horizontais 16:9 em SVG/data URL;
  - venda presencial modular;
  - venda pós-passeio aprovada;
  - checkout pendente;
  - caixa aberto e históricos de turno;
  - sangria demo;
  - logs de entrega/download;
  - BI com funil populado.
- Atalhos na tela para abrir:
  - Dashboard;
  - Fotógrafo Web;
  - Captura;
  - Venda Rápida;
  - Pós-passeio;
  - Caixa;
  - BI/Funil;
  - Galeria local;
  - Monitor do cliente.

## Como usar em reunião

1. Abra o PicTour Desktop.
2. Entre como gestor/admin.
3. Vá para **Demo Guiada**.
4. Clique em **Carregar demo premium**.
5. Siga as etapas na sequência.
6. Use o botão **Abrir etapa atual** em cada parte.
7. Abra o monitor do cliente na etapa de venda rápida.
8. Finalize no BI/Funil mostrando gargalos, receita, entrega e checkout.

## Dados fictícios

Os dados foram feitos para parecer operação real sem depender de fotos pessoais ou arquivos externos.

As imagens são geradas como SVGs locais com visual horizontal 16:9. Isso evita quebrar a demo em computadores sem biblioteca de fotos.

## Estratégia comercial

A demo deve vender a ideia de que o PicTour não é apenas um editor de fotos. Ele resolve o ciclo completo:

```txt
captura → venda → pagamento → entrega → caixa → BI → gestão SaaS
```

A fala principal deve sempre voltar para aumento de receita, controle de operação e redução de improviso.

## Validação

Validado com:

```bash
npm run build
node --check electron/main.cjs
node --check electron/preload.cjs
node --check cloud-backend/server.mjs
```
