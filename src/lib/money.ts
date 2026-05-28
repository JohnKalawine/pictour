import type { CurrencyCode, ExchangeRates, PackageOption } from './types';

const locales: Record<CurrencyCode, string> = {
  BRL: 'pt-BR',
  USD: 'en-US',
  EUR: 'de-DE',
  PYG: 'es-PY',
  ARS: 'es-AR'
};

export const currencyLabels: Record<CurrencyCode, string> = {
  BRL: 'Real brasileiro',
  USD: 'Dólar',
  EUR: 'Euro',
  PYG: 'Guarani',
  ARS: 'Peso argentino'
};

export const defaultExchangeRates: ExchangeRates = {
  BRL: 1,
  USD: 5,
  EUR: 5.5,
  PYG: 0.0007,
  ARS: 0.006
};

export const suggestedExchangeRates: ExchangeRates = {
  BRL: 1,
  USD: 5,
  EUR: 5.5,
  PYG: 0.0007,
  ARS: 0.006
};

export function normalizeExchangeRates(exchangeRates?: Partial<ExchangeRates>): ExchangeRates {
  return {
    BRL: 1,
    USD: Number(exchangeRates?.USD || defaultExchangeRates.USD),
    EUR: Number(exchangeRates?.EUR || defaultExchangeRates.EUR),
    PYG: Number(exchangeRates?.PYG || defaultExchangeRates.PYG),
    ARS: Number(exchangeRates?.ARS || defaultExchangeRates.ARS)
  };
}

export function formatMoney(cents: number, currency: CurrencyCode = 'BRL') {
  return new Intl.NumberFormat(locales[currency], {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'PYG' ? 0 : 2
  }).format(cents / 100);
}

export function convertBrlCentsToCurrencyCents(amountBrlCents: number, currency: CurrencyCode, exchangeRates?: Partial<ExchangeRates>) {
  if (currency === 'BRL') return Math.round(amountBrlCents);
  const rates = normalizeExchangeRates(exchangeRates);
  const rate = rates[currency] || defaultExchangeRates[currency] || 1;
  if (!rate || rate <= 0) return Math.round(amountBrlCents);
  return Math.round(amountBrlCents / rate);
}

export function calculatePackageTotalCents(packageOption: PackageOption, selectedPhotoCount: number) {
  const count = Math.max(0, selectedPhotoCount);
  if (!count) return 0;
  if (packageOption.includesAllPhotos || packageOption.pricingMode === 'FIXED') return packageOption.priceCents;
  return packageOption.priceCents * count;
}

export function getPackageUnitLabel(packageOption: PackageOption) {
  if (packageOption.includesAllPhotos || packageOption.pricingMode === 'FIXED') return 'valor fechado';
  return 'por foto selecionada';
}
