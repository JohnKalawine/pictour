# PicTour Desktop v3.1 — Biblioteca Chroma persistente

## Objetivo

A v3.1 adiciona uma biblioteca persistente de cenários/templates por parque. O gestor cadastra os cenários oficiais uma vez em Configurações e o operador escolhe diretamente no Chroma Studio, sem importar o fundo toda hora.

## O que entrou

- Novo cadastro de **Biblioteca Chroma v3.1** em Configurações.
- Suporte a tipos: `SCENARIO`, `TEMPLATE` e `OVERLAY`.
- Cenários globais para todos os locais ou específicos por parque/unidade.
- Upload local de imagem com persistência no banco local.
- Ativar/desativar cenário oficial.
- Marcar cenário padrão por tipo/local.
- Chroma Studio Pro v3.1 exibindo a biblioteca oficial filtrada pela sessão/local atual.
- Render salva metadados do cenário oficial usado na composição:
  - `chromaAssetId`
  - `chromaAssetName`
  - `chromaAssetType`

## Fluxo operacional

1. Gestor abre **Configurações**.
2. Vai até **Biblioteca Chroma v3.1**.
3. Cadastra nome, tipo, local e imagem oficial.
4. Salva as configurações.
5. Operador abre o **Chroma Studio Pro v3.1**.
6. Escolhe o cenário oficial do parque.
7. Renderiza a foto final.

## Observação técnica

A persistência foi implementada dentro de `settings.chromaAssets`, mantendo compatibilidade com o banco JSON local atual. Isso evita criar uma camada de API separada antes da hora e entrega o valor da v3.1 com menos risco.

No futuro, quando a versão cloud/SaaS estiver mais madura, essa estrutura pode virar uma entidade própria no backend:

```ts
ChromaAsset {
  companyId
  locationId?
  name
  type
  imageUrl
  thumbnailUrl
  isActive
  isDefault
  sortOrder
}
```

## Versão

- App: `3.1.0`
- Schema local: `31`
