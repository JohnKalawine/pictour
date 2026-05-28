import type { AppSettings, LicenseSettings, LicenseStatus, SubscriptionPlan, LocalDatabase } from './types';

export const planLabels: Record<SubscriptionPlan, string> = {
  STARTER: 'Starter',
  PRO: 'Pro',
  ENTERPRISE: 'Enterprise'
};

export const licenseStatusLabels: Record<LicenseStatus, string> = {
  TRIAL: 'Teste',
  ACTIVE: 'Ativa',
  EXPIRED: 'Expirada',
  SUSPENDED: 'Suspensa',
  OFFLINE_GRACE: 'Tolerância offline'
};

export const planDescriptions: Record<SubscriptionPlan, string> = {
  STARTER: 'Operação enxuta: 1 local, até 5 usuários, sem cloud avançada e limite mensal de fotos.',
  PRO: 'Operação profissional: até 15 usuários, cloud, Mercado Pago e relatórios.',
  ENTERPRISE: 'Multi-local e alto volume: IA, suporte avançado e limites maiores.'
};

export const planLimits: Record<SubscriptionPlan, Pick<LicenseSettings, 'maxUsers' | 'maxLocations' | 'monthlyPhotoLimit' | 'features'>> = {
  STARTER: {
    maxUsers: 5,
    maxLocations: 1,
    monthlyPhotoLimit: 1500,
    features: {
      cloudGallery: false,
      mercadoPago: false,
      aiBackgroundRemoval: false,
      auditLogs: true,
      multiLocation: false,
      advancedReports: false
    }
  },
  PRO: {
    maxUsers: 15,
    maxLocations: 1,
    monthlyPhotoLimit: 15000,
    features: {
      cloudGallery: true,
      mercadoPago: true,
      aiBackgroundRemoval: false,
      auditLogs: true,
      multiLocation: false,
      advancedReports: true
    }
  },
  ENTERPRISE: {
    maxUsers: 100,
    maxLocations: 50,
    monthlyPhotoLimit: 150000,
    features: {
      cloudGallery: true,
      mercadoPago: true,
      aiBackgroundRemoval: true,
      auditLogs: true,
      multiLocation: true,
      advancedReports: true
    }
  }
};

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function isoDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function createDefaultLicense(): LicenseSettings {
  const now = new Date();
  const plan: SubscriptionPlan = 'PRO';
  return {
    companyId: '',
    licenseKey: '',
    licenseServerUrl: 'http://127.0.0.1:8787',
    serverLicenseId: '',
    lastValidationMessage: '',
    plan,
    status: 'TRIAL',
    activatedAt: now.toISOString(),
    expiresAt: isoDateOnly(addDays(now, 14)),
    lastValidatedAt: now.toISOString(),
    offlineGraceDays: 7,
    notes: 'Licença local de teste. Para produção, validar no painel cloud do PicTour.',
    ...planLimits[plan]
  };
}

export function normalizeLicense(input?: Partial<LicenseSettings>): LicenseSettings {
  const fallback = createDefaultLicense();
  const plan: SubscriptionPlan = input?.plan === 'STARTER' || input?.plan === 'ENTERPRISE' ? input.plan : input?.plan === 'PRO' ? 'PRO' : fallback.plan;
  const limits = planLimits[plan];
  const status: LicenseStatus = ['TRIAL', 'ACTIVE', 'EXPIRED', 'SUSPENDED', 'OFFLINE_GRACE'].includes(String(input?.status))
    ? input!.status as LicenseStatus
    : fallback.status;

  return {
    ...fallback,
    ...limits,
    ...(input || {}),
    plan,
    status,
    maxUsers: Number(input?.maxUsers || limits.maxUsers),
    maxLocations: Number(input?.maxLocations || limits.maxLocations),
    monthlyPhotoLimit: Number(input?.monthlyPhotoLimit || limits.monthlyPhotoLimit),
    offlineGraceDays: Math.max(0, Number(input?.offlineGraceDays ?? fallback.offlineGraceDays)),
    features: {
      ...limits.features,
      ...(input?.features || {})
    }
  };
}

export function daysUntil(dateValue?: string) {
  if (!dateValue) return null;
  const end = new Date(`${dateValue}T23:59:59`);
  if (Number.isNaN(end.getTime())) return null;
  return Math.ceil((end.getTime() - Date.now()) / 86400000);
}

export function getLicenseHealth(settings: AppSettings, database?: Pick<LocalDatabase, 'settings' | 'photos'>) {
  const license = normalizeLicense(settings.license);
  const daysLeft = daysUntil(license.expiresAt);
  const activeUsers = (settings.users || []).filter((user) => user.active !== false).length;
  const activeLocations = (settings.locations || []).filter((location) => location.active !== false).length;
  const currentMonth = new Date().toISOString().slice(0, 7);
  const photosThisMonth = (database?.photos || []).filter((photo) => String(photo.importedAt || '').slice(0, 7) === currentMonth).length;

  const expiredByDate = daysLeft !== null && daysLeft < 0;
  const statusExpired = license.status === 'EXPIRED' || license.status === 'SUSPENDED' || expiredByDate;
  const nearExpiration = daysLeft !== null && daysLeft >= 0 && daysLeft <= 7;
  const userLimitExceeded = activeUsers > license.maxUsers;
  const locationLimitExceeded = activeLocations > license.maxLocations;
  const photoLimitExceeded = photosThisMonth > license.monthlyPhotoLimit;

  const blockers = [statusExpired, userLimitExceeded, locationLimitExceeded, photoLimitExceeded].filter(Boolean).length;
  const warnings = [nearExpiration && !statusExpired].filter(Boolean).length;

  return {
    license,
    daysLeft,
    activeUsers,
    activeLocations,
    photosThisMonth,
    userLimitExceeded,
    locationLimitExceeded,
    photoLimitExceeded,
    nearExpiration,
    expired: statusExpired,
    blockers,
    warnings,
    ready: blockers === 0,
    label: statusExpired ? 'Licença bloqueada' : nearExpiration ? 'Licença perto de vencer' : 'Licença OK'
  };
}
