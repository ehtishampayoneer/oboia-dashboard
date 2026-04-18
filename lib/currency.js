export const DEFAULT_EXCHANGE_RATE = 12500;

export function formatUZS(amount) {
  if (amount === null || amount === undefined || isNaN(amount)) return '0 UZS';
  return new Intl.NumberFormat('uz-UZ', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(amount)) + ' UZS';
}

export function formatUSD(amount) {
  if (amount === null || amount === undefined || isNaN(amount)) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function convertToUSD(amountUZS, exchangeRate = DEFAULT_EXCHANGE_RATE) {
  if (!amountUZS || !exchangeRate) return 0;
  return amountUZS / exchangeRate;
}

export function convertToUZS(amountUSD, exchangeRate = DEFAULT_EXCHANGE_RATE) {
  if (!amountUSD || !exchangeRate) return 0;
  return amountUSD * exchangeRate;
}

export function formatCurrency(amountUZS, currency = 'UZS', exchangeRate = DEFAULT_EXCHANGE_RATE) {
  if (currency === 'USD') {
    return formatUSD(convertToUSD(amountUZS, exchangeRate));
  }
  return formatUZS(amountUZS);
}

export function formatCompact(amount, currency = 'UZS', exchangeRate = DEFAULT_EXCHANGE_RATE) {
  let value = currency === 'USD' ? convertToUSD(amount, exchangeRate) : amount;
  if (currency === 'USD') {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`;
    return formatUSD(value);
  }
  if (value >= 1000000000) return `${(value / 1000000000).toFixed(1)}B UZS`;
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M UZS`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K UZS`;
  return formatUZS(value);
}
