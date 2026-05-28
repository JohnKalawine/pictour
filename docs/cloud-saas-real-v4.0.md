# PicTour v4.0 — Cloud SaaS real e licenciamento

A v4.0 marca a primeira versão orientada a SaaS real do PicTour. O foco deixa de ser apenas operação local e passa a incluir controle comercial centralizado: empresa/tenant, plano contratado, licença, check-in de estação, limites de uso e caminho para cobrança recorrente.

## Principais entregas

- Nova aba **SaaS/Licença** no desktop.
- Fonte de versão atualizada para **4.0.0**.
- Schema local atualizado para **40**.
- Cloud backend atualizado para **v4.0**.
- Check-in de licença com:
  - versão do app;
  - nome do dispositivo;
  - nome da estação;
  - fingerprint local do dispositivo;
  - métricas de uso mensal.
- Painel SaaS cloud passa a registrar dispositivos vistos no check-in.
- Configurações SaaS locais:
  - slug do tenant;
  - URL do painel admin;
  - status de cobrança;
  - limite de dispositivos;
  - exigência de licença online para produção.
- Validação manual de licença pela nova aba.
- Leitura executiva de saúde da assinatura.
- Lista de bloqueadores comerciais: licença ausente, expirada, suspensa, limite de usuários, locais ou fotos.

## Fluxo de implantação SaaS

1. Subir o `cloud-backend` em um servidor/Netlify/Render/VPS.
2. Configurar variáveis:
   - `PUBLIC_BASE_URL`
   - `PICTOUR_LICENSE_ADMIN_TOKEN`
   - `PICTOUR_CLOUD_API_KEY`
   - `PICTOUR_LATEST_VERSION=4.0.0`
3. Abrir o painel:
   - `/admin/licenses?token=SEU_TOKEN`
4. Criar empresa/tenant.
5. Criar licença e plano.
6. No Desktop, preencher:
   - Company ID;
   - chave de licença;
   - URL do servidor cloud/licença.
7. Validar pela aba **SaaS/Licença**.

## Planos previstos

- **Starter**: operação pequena, limite de usuários e fotos menor.
- **Pro**: operação profissional com cloud, Mercado Pago e relatórios.
- **Enterprise**: alto volume, multi-local, IA e suporte avançado.

## Próximas versões

- v4.1 — Painel administrativo web mais completo.
- v4.2 — Storage cloud das fotos.
- v4.3 — Assinaturas/planos.
- v4.4 — App mobile mais completo.
