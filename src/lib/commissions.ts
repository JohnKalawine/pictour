import type { AppSettings, AppUser, CashierSale, CommissionMode, CommissionSettings, CommissionSplit } from './types';

export const defaultCommissionSettings: CommissionSettings = {
  mode: 'NONE',
  defaultRatePercent: 10,
  individualRates: {},
  collectiveUsernames: [],
  includeManagers: false
};

export function normalizeCommissionSettings(settings?: Partial<CommissionSettings>): CommissionSettings {
  const mode = settings?.mode === 'INDIVIDUAL' || settings?.mode === 'COLLECTIVE' ? settings.mode : 'NONE';
  const rate = Number(settings?.defaultRatePercent ?? defaultCommissionSettings.defaultRatePercent);
  const individualRates: Record<string, number> = {};
  for (const [username, value] of Object.entries(settings?.individualRates || {})) {
    const key = String(username || '').trim().toLowerCase();
    const numeric = Number(value);
    if (key && Number.isFinite(numeric) && numeric >= 0) individualRates[key] = Math.min(100, numeric);
  }

  return {
    mode,
    defaultRatePercent: Number.isFinite(rate) ? Math.min(100, Math.max(0, rate)) : defaultCommissionSettings.defaultRatePercent,
    individualRates,
    collectiveUsernames: Array.from(new Set((settings?.collectiveUsernames || []).map((item) => String(item).trim().toLowerCase()).filter(Boolean))),
    includeManagers: Boolean(settings?.includeManagers)
  };
}

function findUserBySellerName(users: AppUser[], sellerName?: string) {
  const target = String(sellerName || '').trim().toLowerCase();
  if (!target) return undefined;
  return users.find((user) => user.active !== false && (user.name.toLowerCase() === target || user.username.toLowerCase() === target));
}

function buildEmpty(mode: CommissionMode = 'NONE') {
  return {
    commissionMode: mode,
    commissionBaseCents: 0,
    commissionRatePercent: 0,
    commissionTotalCents: 0,
    commissionSplits: [] as CommissionSplit[]
  };
}

export function calculateCommissionForSale(sale: Partial<CashierSale>, settings: AppSettings) {
  const commission = normalizeCommissionSettings(settings.commission);
  const amountBaseCents = Math.max(0, Number(sale.amountBaseCents || 0));
  const users = (settings.users || []).filter((user) => user.active !== false);

  if (commission.mode === 'NONE' || amountBaseCents <= 0) return buildEmpty(commission.mode);

  if (commission.mode === 'INDIVIDUAL') {
    const seller = findUserBySellerName(users, sale.sellerName);
    const username = seller?.username?.toLowerCase() || String(sale.sellerName || 'operador').trim().toLowerCase() || 'operador';
    const rate = Number(commission.individualRates?.[username] ?? commission.defaultRatePercent ?? 0);
    const total = Math.round(amountBaseCents * Math.max(0, rate) / 100);
    return {
      commissionMode: 'INDIVIDUAL' as const,
      commissionBaseCents: amountBaseCents,
      commissionRatePercent: rate,
      commissionTotalCents: total,
      commissionSplits: total > 0 ? [{
        username,
        name: seller?.name || sale.sellerName || 'Operador',
        role: seller?.role || 'STAFF',
        amountBaseCents: total,
        ratePercent: rate,
        sharePercent: 100
      }] : []
    };
  }

  const configuredNames = new Set((commission.collectiveUsernames || []).map((item) => item.toLowerCase()));
  let team = users.filter((user) => {
    if (user.role === 'MANAGER' && !commission.includeManagers) return false;
    return configuredNames.size ? configuredNames.has(user.username.toLowerCase()) : user.role === 'STAFF';
  });

  if (!team.length) {
    const seller = findUserBySellerName(users, sale.sellerName);
    team = seller ? [seller] : users.filter((user) => user.role === 'STAFF');
  }

  if (!team.length) return buildEmpty('COLLECTIVE');

  const rate = Number(commission.defaultRatePercent || 0);
  const total = Math.round(amountBaseCents * Math.max(0, rate) / 100);
  const baseShare = Math.floor(total / team.length);
  let remainder = total - baseShare * team.length;
  const splits: CommissionSplit[] = team.map((user) => {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;
    return {
      username: user.username,
      name: user.name,
      role: user.role,
      amountBaseCents: baseShare + extra,
      ratePercent: rate,
      sharePercent: Number((100 / team.length).toFixed(2))
    };
  });

  return {
    commissionMode: 'COLLECTIVE' as const,
    commissionBaseCents: amountBaseCents,
    commissionRatePercent: rate,
    commissionTotalCents: total,
    commissionSplits: splits
  };
}

export function getSaleCommissionSnapshot(sale: CashierSale, settings: AppSettings) {
  if (sale.commissionMode) {
    return {
      commissionMode: sale.commissionMode,
      commissionBaseCents: sale.commissionBaseCents || sale.amountBaseCents || 0,
      commissionRatePercent: sale.commissionRatePercent || 0,
      commissionTotalCents: sale.commissionTotalCents || 0,
      commissionSplits: sale.commissionSplits || []
    };
  }
  return calculateCommissionForSale(sale, settings);
}

export function summarizeCommissionByMember(sales: CashierSale[], settings: AppSettings) {
  const byMember = new Map<string, { username: string; name: string; amountBaseCents: number; saleCount: number }>();
  let totalCommissionCents = 0;

  for (const sale of sales) {
    const snapshot = getSaleCommissionSnapshot(sale, settings);
    totalCommissionCents += snapshot.commissionTotalCents || 0;
    for (const split of snapshot.commissionSplits || []) {
      const key = split.username || split.name;
      const current = byMember.get(key) || { username: split.username, name: split.name, amountBaseCents: 0, saleCount: 0 };
      current.amountBaseCents += split.amountBaseCents || 0;
      current.saleCount += 1;
      byMember.set(key, current);
    }
  }

  return {
    totalCommissionCents,
    members: Array.from(byMember.values()).sort((a, b) => b.amountBaseCents - a.amountBaseCents)
  };
}
