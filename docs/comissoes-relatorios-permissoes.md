# PicTour v1.9 — Comissões, relatórios e permissões

## Como o sistema de comissões funciona

O PicTour trabalha com três modos:

### 1. Sem comissão

Nenhuma comissão é calculada ou exibida no fechamento. É ideal para empresas que pagam salário fixo ou ainda não querem controlar comissão no sistema.

### 2. Comissão individual

Cada venda pertence ao vendedor selecionado na Venda Rápida. O sistema calcula:

```
comissão = valor base em BRL da venda × percentual do vendedor
```

Se o vendedor não tiver percentual próprio, o PicTour usa o percentual padrão da empresa.

Exemplo:

```
Venda: R$100,00
Vendedor: Marina
Comissão individual da Marina: 10%
Comissão: R$10,00
```

### 3. Comissão coletiva

O sistema calcula uma comissão total da venda e divide igualmente entre os membros marcados da equipe.

```
comissão total = valor base em BRL da venda × percentual padrão
comissão por membro = comissão total ÷ membros selecionados
```

Exemplo:

```
Venda: R$100,00
Comissão coletiva: 12%
Equipe: 3 pessoas
Comissão total: R$12,00
Cada pessoa recebe: R$4,00
```

Gestores/adm só entram na divisão coletiva se a opção “Incluir gestores/adm” estiver ligada.

## Histórico seguro

Vendas novas salvam um snapshot da comissão no momento do pagamento. Isso significa que mudar o percentual amanhã não altera a comissão das vendas antigas.

## Relatórios

Na aba Caixa, o gestor pode filtrar por:

- vendedor;
- sessão;
- forma de pagamento;
- período.

O relatório mostra:

- total vendido;
- total de comissão;
- resumo por vendedor;
- resumo por membro comissionado;
- comissão por venda.

A exportação CSV inclui colunas de comissão e o fechamento JSON inclui `commissionSummary`.

## Permissões

- Gestor/adm pode alterar usuários, permissões, comissões e configurações sensíveis.
- Fotógrafo/Caixa opera o dia a dia, mas não altera regras sensíveis.
- Fotógrafo/Caixa com permissão adm pode acessar configurações operacionais, mas não pode alterar gestor/adm nem regras de comissão.
