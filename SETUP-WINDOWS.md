# PicTour Desktop v4.6.2 — Setup Windows

Se o npm tentar baixar de `packages.applied-caas...`, apague `package-lock.json` e use este pacote corrigido.

## Instalação limpa

Abra o CMD/PowerShell na pasta raiz do PicTour, onde existe `package.json`:

```bat
npm config set registry https://registry.npmjs.org/
npm cache clean --force
rmdir /s /q node_modules
if exist package-lock.json del package-lock.json
npm install
npm run dev
```

## Build

```bat
npm run build
```

## Instalador Windows

```bat
npm run build:app
```

## Observação

Não execute `npx tsc` quando ele pedir para instalar `tsc@2.0.4`. O compilador correto vem do pacote `typescript` instalado por `npm install`.
