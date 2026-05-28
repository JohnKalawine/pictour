# PicTour Desktop v2.4 — Licenciamento e assinatura

A v2.4 adiciona a base comercial para empresas contratantes do PicTour.

## Objetivo

Permitir que o gestor configure a licença da empresa diretamente no app desktop, preparando o caminho para validação cloud em produção.

## Planos

### Starter
- Até 3 usuários.
- 1 local/parque.
- Até 1.500 fotos por mês.
- Auditoria básica ativa.
- Cloud, Mercado Pago e IA ficam como recursos bloqueados para upgrade.

### Pro
- Até 10 usuários.
- Até 3 locais/parques.
- Até 12.000 fotos por mês.
- Cloud, Mercado Pago, recorte IA, auditoria e relatórios avançados.
- Plano recomendado para a maioria das empresas de turismo.

### Enterprise
- Até 50 usuários.
- Até 20 locais/parques.
- Até 100.000 fotos por mês.
- Pensado para multiunidade, alto volume e operação com suporte/customização.

## Status da licença

- **Teste:** licença local temporária para implantação e demonstração.
- **Ativa:** empresa liberada para operação.
- **Tolerância offline:** operação pode continuar por alguns dias sem validação online.
- **Expirada:** a empresa precisa renovar/regularizar.
- **Suspensa:** bloqueio administrativo/manual.

## Como usar no MVP local

Em `Configurações → Licença / assinatura`, o gestor pode:

1. escolher o plano;
2. definir status;
3. lançar uma chave local;
4. definir validade;
5. configurar dias de tolerância offline;
6. ajustar limites máximos de usuários, locais e fotos/mês;
7. iniciar teste de 14 dias;
8. ativar licença por 30 dias ou 1 ano.

## Regras operacionais

A aba `Operação` passa a mostrar a licença como item de prontidão.

A operação fica em alerta/bloqueio quando:

- licença está expirada;
- licença está suspensa;
- número de usuários ativos excede o plano;
- número de locais ativos excede o plano;
- fotos do mês excedem o limite configurado.

## Próxima evolução sugerida

A v2.4 ainda faz validação local/manual. A evolução natural é um servidor de licenças com:

- painel interno da NoMercy Studio;
- empresas ativas/inativas;
- planos e cobrança;
- validação periódica online;
- tolerância offline;
- bloqueio leve com aviso;
- histórico de ativações;
- limite real por plano.
