# PicTour Desktop v2.0 — Caixa e permissões

## Controle de caixa

A v2.0 adiciona um fluxo operacional para empresas que trabalham com balcão/caixa físico.

### Abertura de caixa

Antes de iniciar o turno, o operador com permissão de caixa pode abrir um caixa informando o valor inicial em BRL e uma observação opcional.

O sistema cria um turno de caixa com status `OPEN`, código próprio, operador, horário e movimento de abertura.

### Vendas durante o caixa aberto

Quando existe um caixa aberto, as vendas registradas na Venda Rápida são vinculadas automaticamente ao caixa atual.

Isso permite saber quais vendas entraram em qual turno e calcular o previsto do caixa.

### Sangria

A sangria registra retirada de dinheiro do caixa durante o turno.

Ela reduz o valor previsto para o fechamento e fica registrada no histórico de movimentações do caixa.

### Cancelamento de venda

Vendas podem ser canceladas por usuários com permissão específica.

Ao cancelar, o sistema:

- marca a venda como `CANCELLED`;
- salva operador, horário e motivo;
- zera comissão daquela venda;
- registra movimento de cancelamento;
- tenta devolver as fotos para `READY` quando elas não foram compradas por outra venda ativa.

### Fechamento de caixa

No fechamento, o operador informa o valor contado fisicamente.

O sistema calcula:

- valor inicial;
- vendas ativas do caixa;
- sangrias;
- valor previsto;
- valor contado;
- diferença/sobra/falta.

Também continua existindo o relatório JSON de fechamento e exportação CSV.

## Permissões

Gestor/adm continua tendo acesso total.

Fotógrafo/Caixa pode receber permissões individuais:

- Dashboard;
- Sessões;
- Captura;
- Chroma;
- Venda rápida;
- Pós-passeio;
- Caixa;
- Relatórios;
- Abrir/sangria/fechar caixa;
- Cancelar venda;
- Publicar cloud;
- Backup/restauração;
- Configurações.

Usuário `MANAGER` sempre tem todas as permissões. Usuário `STAFF` só recebe o que for marcado pelo gestor.

A permissão antiga de “Adm” continua como atalho para dar acesso administrativo amplo ao fotógrafo/caixa, mas a v2.0 agora permite granular melhor por tela/ação.
