# PicTour Desktop v3.5 — Mercado Pago real + webhooks + liberação automática

## Objetivo

A v3.5 transforma o pós-passeio em um fluxo real de pagamento online:

1. Cliente escolhe fotos/pacote na galeria pública.
2. Backend cloud cria uma preferência real no Mercado Pago.
3. Mercado Pago notifica `/webhooks/mercado-pago`.
4. Backend consulta o pagamento na API oficial do Mercado Pago.
5. Se aprovado, fotos são liberadas automaticamente na galeria.
6. Desktop sincroniza vendas cloud e registra venda no Caixa com entrega pronta.

## O que mudou

- Checkout cloud real via Mercado Pago.
- Webhook cloud `/webhooks/mercado-pago` com suporte a POST e GET.
- Token opcional para proteger webhook: `PICTOUR_MP_WEBHOOK_TOKEN`.
- Consulta automática de pagamento por webhook.
- Fallback de refresh na volta do checkout: `/checkout/:id?refresh=1`.
- Compra simulada desativada por padrão em produção.
- Sync Desktop agora importa vendas aprovadas já com link de entrega profissional.
- Venda aprovada localmente pelo botão “Consultar pagamento” também gera entrega automaticamente.
- Configurações do Desktop atualizadas para Mercado Pago real v3.5.

## Variáveis cloud principais

```env
PORT=8787
PUBLIC_BASE_URL=https://api.seudominio.com
PICTOUR_CLOUD_API_KEY=troque-essa-chave

MERCADO_PAGO_ACCESS_TOKEN=APP_USR-...
MERCADO_PAGO_PUBLIC_BASE_URL=https://api.seudominio.com
PICTOUR_MP_WEBHOOK_TOKEN=token-grande-opcional

# Só para demo interna. Em produção, deixe ausente ou false.
PICTOUR_ALLOW_SIMULATED_PURCHASES=false
```

## URL de webhook no Mercado Pago

Configure no Mercado Pago:

```txt
https://api.seudominio.com/webhooks/mercado-pago
```

Se usar `PICTOUR_MP_WEBHOOK_TOKEN`, o checkout criado pelo PicTour já envia a URL com `?token=...` automaticamente.

## Fluxo operacional recomendado

1. Publicar backend cloud com HTTPS.
2. Configurar `MERCADO_PAGO_ACCESS_TOKEN` de sandbox ou produção.
3. No Desktop, configurar:
   - Mercado Pago ativo;
   - ambiente correto;
   - token correto;
   - cloud API URL;
   - cloud API key.
4. Publicar sessão para cloud.
5. Cliente acessa a galeria e paga.
6. Webhook libera fotos automaticamente.
7. Operador clica em “Sincronizar vendas” no Pós-passeio para puxar venda ao Caixa.

## Observações de segurança

- Não coloque Access Token no frontend.
- Use HTTPS público para webhooks reais.
- Em produção, use token `APP_USR-...`, nunca `TEST-...`.
- Em sandbox, use token `TEST-...`.
- Deixe compra simulada desligada em produção.
- Faça backup do banco local antes de migrar operação real.
