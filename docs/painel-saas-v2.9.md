# PicTour Desktop v2.9 — Painel SaaS/admin comercial

A v2.9 transforma o servidor de licenças em um painel SaaS para controlar empresas contratantes do PicTour.

## Planos atualizados

### Starter
- 1 local/parque ativo.
- Até 5 usuários ativos.
- Sem cloud avançada.
- Sem Mercado Pago cloud.
- Sem recorte IA.
- Limite mensal de fotos configurado no painel.

### Pro
- Até 15 usuários ativos.
- Cloud liberada.
- Mercado Pago liberado.
- Relatórios liberados.
- Sem recorte IA.
- Sem multi-local avançado.

### Enterprise
- Multi-local.
- Recorte IA.
- Suporte avançado.
- Limites maiores de usuários, locais e fotos/mês.

## Painel admin cloud

Acesse:

```txt
http://127.0.0.1:8787/admin/licenses?token=pictour_admin_secret
```

Em produção, troque `PICTOUR_LICENSE_ADMIN_TOKEN` no `.env`.

O painel mostra:

- empresas cadastradas;
- plano de cada empresa;
- status da licença;
- validade;
- chave de licença;
- último check-in do desktop;
- versão instalada;
- dispositivo usado;
- uso mensal reportado;
- alertas comerciais.

## Alertas comerciais

O painel destaca:

- licença expirada;
- licença suspensa;
- licença perto de vencer;
- empresa sem check-in há mais de 7 dias;
- app usando versão antiga;
- uso de fotos acima de 85% do limite mensal;
- usuários ativos acima do plano;
- locais ativos acima do plano.

## Check-in automático do desktop

Depois do login, quando a empresa tem `companyId`, `licenseKey` e `licenseServerUrl`, o PicTour faz check-in automático uma vez por dia.

O check-in envia:

- versão instalada;
- nome do dispositivo;
- usuários ativos;
- locais ativos;
- fotos do mês;
- fotos sincronizadas na cloud;
- vendas do mês;
- sessões abertas/encerradas;
- status do caixa.

## Limites aplicados no desktop

A v2.9 começa a aplicar limites do plano localmente:

- usuários acima do limite são desativados automaticamente ao salvar configurações;
- locais acima do limite são desativados automaticamente ao salvar configurações;
- cloud é desligada se o plano não permitir;
- Mercado Pago é desligado se o plano não permitir;
- importação/captura/render de novas fotos respeita o limite mensal de fotos;
- recorte IA fica bloqueado fora do Enterprise.

## Endpoint JSON do painel

```txt
GET /api/licenses/admin/list?token=SEU_TOKEN
```

Retorna empresas, licenças, dashboard, uso, check-ins e alertas.

## Endpoint de validação/check-in

```txt
POST /api/licenses/validate
```

O mesmo endpoint valida a licença e registra o check-in do desktop.
