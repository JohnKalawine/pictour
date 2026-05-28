import { useEffect, useMemo, useState } from 'react';
import type { AntiPrintSettings, AppLocation, AppPermission, AppSettings, AppUser, AuthUser, CashSettings, ChangePasswordResult, ChromaAsset, ChromaAssetType, CommissionMode, CloudStorageInfo, CloudStorageSettings, CommissionSettings, CurrencyCode, ExchangeRates, LicenseSettings, LicenseStatus, LicenseValidationInput, LicenseValidationResult, MultiStationInfo, MultiStationSettings, MultiStationSyncResult, PackageOption, PackagePricingMode, PermissionMap, PhotographerPortalSettings, QuickScenario, SubscriptionPlan, UpdateSettingsInput } from '../lib/types';
import { currencyLabels, defaultExchangeRates, formatMoney, getPackageUnitLabel, suggestedExchangeRates } from '../lib/money';
import { defaultCommissionSettings, normalizeCommissionSettings } from '../lib/commissions';
import { APP_VERSION } from '../lib/appVersion';
import { createDefaultLicense, getLicenseHealth, isoDateOnly, addDays, licenseStatusLabels, planDescriptions, planLabels, planLimits } from '../lib/license';

type SettingsProps = {
  settings: AppSettings;
  currentUser: AuthUser;
  onOpenDataFolder: () => void;
  onExportBackup: () => Promise<void>;
  onRestoreBackup: () => Promise<void>;
  onChangePassword: (username: string, currentPassword: string, newPassword: string) => Promise<ChangePasswordResult>;
  onValidateLicense: (input?: LicenseValidationInput) => Promise<LicenseValidationResult>;
  onGetMultiStationInfo: () => Promise<MultiStationInfo | null>;
  onPullFromPrimaryStation: () => Promise<MultiStationSyncResult>;
  onUpdateSettings: (input: UpdateSettingsInput) => Promise<void>;
};

const defaultMercadoPago = {
  enabled: false,
  environment: 'sandbox' as const,
  publicKey: '',
  accessToken: '',
  webhookUrl: '',
  webhookSecret: '',
  autoReleaseDelivery: true,
  successUrl: 'https://pictour.app/pagamento/aprovado',
  failureUrl: 'https://pictour.app/pagamento/recusado',
  pendingUrl: 'https://pictour.app/pagamento/pendente'
};

const defaultCloudStorage: CloudStorageSettings = {
  driver: 'local',
  bucket: '',
  endpoint: '',
  publicBaseUrl: 'http://127.0.0.1:8787/media',
  signedDownloadTtlSeconds: 900,
  keepOriginalsPrivate: true
};

const defaultCloud = {
  enabled: false,
  apiBaseUrl: 'http://127.0.0.1:8787',
  apiKey: '',
  publicGalleryBaseUrl: 'http://127.0.0.1:8787',
  storage: defaultCloudStorage
};

const defaultMultiStation: MultiStationSettings = {
  enabled: false,
  mode: 'PRIMARY',
  stationName: 'Estação principal',
  syncToken: 'pictour-local-sync',
  primaryUrl: 'http://127.0.0.1:3888',
  autoPullSeconds: 0
};

const defaultPhotographerPortal: PhotographerPortalSettings = {
  enabled: true,
  requireSessionAccessCode: true,
  maxFilesPerUpload: 12,
  defaultLabelPrefix: 'Fotógrafo externo',
  mobileMode: 'FULL_OPERATION',
  allowMobileSelection: true,
  allowMobileFavorite: true,
  showPurchasedOnMobile: true,
  enableUploadQueue: true
};

const defaultAntiPrint: AntiPrintSettings = {
  enabled: true,
  watermarkText: 'PICTOUR PREVIEW',
  includeSessionCode: true,
  includePhotoCode: true,
  includeTimestamp: true,
  includeStationName: true,
  opacity: 38,
  density: 24,
  rotationDeg: -24,
  noiseIntensity: 18,
  previewBlur: 0,
  resolutionGuard: true,
  blockContextMenu: true,
  blockDrag: true,
  shieldOnBlur: true,
  shieldAfterInactivitySeconds: 0,
  showSessionMeta: true
};

const defaultCashSettings: CashSettings = {
  recommendedChangeFundCents: 50000,
  requireOpeningChangeFund: true,
  warnIfClosingChangeFundDifferent: true,
  cashRegisterName: 'Caixa 01',
  receiptPrinterName: '',
  receiptPaperWidthChars: 42,
  autoPrintCashReceipts: true
};


const defaultQuickScenarios: QuickScenario[] = [
  { id: 'quick_default_cataratas', name: 'Cataratas cinematic', isDefault: true, isActive: true, sortOrder: 1 },
  { id: 'quick_default_selva', name: 'Selva premium', isDefault: true, isActive: true, sortOrder: 2 },
  { id: 'quick_default_barco', name: 'Barco pôr do sol', isDefault: true, isActive: true, sortOrder: 3 },
  { id: 'quick_default_inspector', name: 'Inspector profissional', isDefault: true, isActive: true, sortOrder: 4 }
];

const makeLocalId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
const currencyOrder: CurrencyCode[] = ['USD', 'EUR', 'PYG', 'ARS'];
const planOrder: SubscriptionPlan[] = ['STARTER', 'PRO', 'ENTERPRISE'];
const statusOrder: LicenseStatus[] = ['TRIAL', 'ACTIVE', 'OFFLINE_GRACE', 'EXPIRED', 'SUSPENDED'];

const permissionLabels: Array<{ key: AppPermission; label: string }> = [
  { key: 'DASHBOARD', label: 'Dashboard' },
  { key: 'OPERATION_STATUS', label: 'Status da operação' },
  { key: 'COMMERCIAL_READINESS', label: 'Implantação comercial' },
  { key: 'SESSIONS', label: 'Sessões' },
  { key: 'CAPTURE', label: 'Captura' },
  { key: 'CHROMA', label: 'Chroma' },
  { key: 'QUICK_SALE', label: 'Venda rápida' },
  { key: 'POST_TOUR', label: 'Pós-passeio' },
  { key: 'CASHIER', label: 'Caixa' },
  { key: 'REPORTS', label: 'Relatórios' },
  { key: 'CASH_CONTROL', label: 'Abrir/sangria/fechar caixa' },
  { key: 'CANCEL_SALE', label: 'Cancelar venda' },
  { key: 'CLOUD_PUBLISH', label: 'Publicar cloud' },
  { key: 'BACKUP', label: 'Backup/restauração' },
  { key: 'AUDIT_LOG', label: 'Auditoria e logs' },
  { key: 'SETTINGS', label: 'Configurações' },
  { key: 'SAAS_ADMIN', label: 'SaaS/licenças' }
];

function defaultStaffPermissions(): PermissionMap {
  return {
    DASHBOARD: true,
    OPERATION_STATUS: true,
    COMMERCIAL_READINESS: false,
    SESSIONS: true,
    CAPTURE: true,
    CHROMA: true,
    QUICK_SALE: true,
    POST_TOUR: true,
    CASHIER: true,
    REPORTS: false,
    CASH_CONTROL: false,
    CANCEL_SALE: false,
    CLOUD_PUBLISH: false,
    BACKUP: false,
    AUDIT_LOG: false,
    SETTINGS: false
  };
}

function managerPermissions(): PermissionMap {
  return Object.fromEntries(permissionLabels.map((item) => [item.key, true])) as PermissionMap;
}

function resolveUserPermissions(user: AppUser): PermissionMap {
  if (user.role === 'MANAGER') return managerPermissions();
  return { ...defaultStaffPermissions(), ...(user.permissions || {}) };
}

function cleanUsers(users: AppUser[]) {
  return users.map((user) => {
    if (user.password) return user;
    const { password, ...safeUser } = user;
    return safeUser;
  });
}

function parseMoneyToCents(value: string) {
  const normalized = value.replace(/\./g, '').replace(',', '.').replace(/[^0-9.]/g, '');
  return Math.max(0, Math.round(Number(normalized || 0) * 100));
}

function centsToInput(cents: number) {
  return String((cents || 0) / 100).replace('.', ',');
}

function parseRate(value: string) {
  return Number(value.replace(',', '.').replace(/[^0-9.]/g, '')) || 0;
}

function formatRate(rate: number) {
  if (rate < 0.01) return `R$ ${rate.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
  return `R$ ${rate.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function Settings({ settings, currentUser, onOpenDataFolder, onExportBackup, onRestoreBackup, onChangePassword, onValidateLicense, onGetMultiStationInfo, onPullFromPrimaryStation, onUpdateSettings }: SettingsProps) {
  const [companyName, setCompanyName] = useState(settings.companyName);
  const [locationName, setLocationName] = useState(settings.locationName);
  const [defaultPostTourDays, setDefaultPostTourDays] = useState(String(settings.defaultPostTourDays));
  const [locations, setLocations] = useState<AppLocation[]>(settings.locations || []);
  const [newLocationName, setNewLocationName] = useState('');
  const [users, setUsers] = useState<AppUser[]>(settings.users || []);
  const [newUser, setNewUser] = useState<{ name: string; username: string; password: string; role: 'MANAGER' | 'STAFF'; adminPermissions: boolean }>({ name: '', username: '', password: '', role: 'STAFF', adminPermissions: false });
  const [packages, setPackages] = useState<PackageOption[]>(settings.packages || []);
  const [chromaAssets, setChromaAssets] = useState<ChromaAsset[]>(settings.chromaAssets || []);
  const [quickScenarios, setQuickScenarios] = useState<QuickScenario[]>(settings.quickScenarios?.length ? settings.quickScenarios : defaultQuickScenarios);
  const [newQuickScenario, setNewQuickScenario] = useState<{ name: string; imageUrl: string; thumbnailUrl: string; fileName: string }>({ name: '', imageUrl: '', thumbnailUrl: '', fileName: '' });
  const [newChromaAsset, setNewChromaAsset] = useState<{ name: string; description: string; locationName: string; type: ChromaAssetType; imageUrl: string; thumbnailUrl: string; fileName: string }>({ name: '', description: '', locationName: '', type: 'SCENARIO', imageUrl: '', thumbnailUrl: '', fileName: '' });
  const [newPackage, setNewPackage] = useState<{ name: string; locationName: string; price: string; pricingMode: PackagePricingMode; includesAllPhotos: boolean }>({ name: '1 Foto Digital', locationName: settings.locationName || '', price: '40,00', pricingMode: 'PER_PHOTO', includesAllPhotos: false });
  const [exchangeRates, setExchangeRates] = useState<ExchangeRates>({ ...defaultExchangeRates, ...(settings.exchangeRates || {}) });
  const [mercadoPago, setMercadoPago] = useState({ ...defaultMercadoPago, ...(settings.mercadoPago || {}) });
  const [cloud, setCloud] = useState({ ...defaultCloud, ...(settings.cloud || {}), storage: { ...defaultCloudStorage, ...(settings.cloudStorage || settings.cloud?.storage || {}) } });
  const [cloudStorageInfo, setCloudStorageInfo] = useState<CloudStorageInfo | null>(null);
  const [multiStation, setMultiStation] = useState<MultiStationSettings>({ ...defaultMultiStation, ...(settings.multiStation || {}) });
  const [antiPrint, setAntiPrint] = useState<AntiPrintSettings>({ ...defaultAntiPrint, ...(settings.antiPrint || {}) });
  const [photographerPortal, setPhotographerPortal] = useState<PhotographerPortalSettings>({ ...defaultPhotographerPortal, ...(settings.photographerPortal || {}) });
  const [multiStationInfo, setMultiStationInfo] = useState<MultiStationInfo | null>(null);
  const [commission, setCommission] = useState<CommissionSettings>(normalizeCommissionSettings(settings.commission || defaultCommissionSettings));
  const [cashSettings, setCashSettings] = useState<CashSettings>({ ...defaultCashSettings, ...(settings.cash || {}) });
  const [availablePrinters, setAvailablePrinters] = useState<Array<{ name: string; displayName?: string }>>([]);
  const [license, setLicense] = useState<LicenseSettings>(createDefaultLicense());
  const [message, setMessage] = useState('Configurações prontas para edição local.');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPasswordValue, setNewPasswordValue] = useState('');
  const [confirmPasswordValue, setConfirmPasswordValue] = useState('');

  const canManagePermissions = currentUser.role === 'MANAGER';
  const canAccessSettings = currentUser.role === 'MANAGER' || Boolean(currentUser.adminPermissions);
  const activeLocations = useMemo(() => locations.filter((item) => item.active !== false), [locations]);

  useEffect(() => {
    setCompanyName(settings.companyName);
    setLocationName(settings.locationName);
    setDefaultPostTourDays(String(settings.defaultPostTourDays));
    setLocations(settings.locations || []);
    setUsers(settings.users || []);
    setPackages(settings.packages || []);
    setChromaAssets(settings.chromaAssets || []);
    setQuickScenarios(settings.quickScenarios?.length ? settings.quickScenarios : defaultQuickScenarios);
    setExchangeRates({ ...defaultExchangeRates, ...(settings.exchangeRates || {}) });
    setMercadoPago({ ...defaultMercadoPago, ...(settings.mercadoPago || {}) });
    setCloud({ ...defaultCloud, ...(settings.cloud || {}), storage: { ...defaultCloudStorage, ...(settings.cloudStorage || settings.cloud?.storage || {}) } });
    setMultiStation({ ...defaultMultiStation, ...(settings.multiStation || {}) });
    setAntiPrint({ ...defaultAntiPrint, ...(settings.antiPrint || {}) });
    setPhotographerPortal({ ...defaultPhotographerPortal, ...(settings.photographerPortal || {}) });
    setCommission(normalizeCommissionSettings(settings.commission || defaultCommissionSettings));
    setCashSettings({ ...defaultCashSettings, ...(settings.cash || {}) });
    setLicense(createDefaultLicense());
    setLicense((current) => ({ ...current, ...(settings.license || {}) }));
    setNewPackage((current) => ({ ...current, locationName: settings.locationName || current.locationName }));
  }, [settings]);

  useEffect(() => {
    window.pictourDesktop?.listCashPrinters?.().then((printers) => {
      setAvailablePrinters(Array.isArray(printers) ? printers : []);
    }).catch(() => setAvailablePrinters([]));
  }, []);

  async function saveSettings() {
    if (!canAccessSettings) {
      setMessage('Seu usuário não tem acesso às configurações.');
      return;
    }

    const payload: UpdateSettingsInput = {
      actorUsername: currentUser.username,
      companyName,
      locationName,
      defaultPostTourDays: Number(defaultPostTourDays || 7),
      defaultCurrency: 'BRL',
      locations,
      packages,
      chromaAssets,
      quickScenarios,
      exchangeRates: { ...exchangeRates, BRL: 1 },
      mercadoPago,
      cloud: { ...cloud, storage: { ...defaultCloudStorage, ...(cloud.storage || {}) } },
      cloudStorage: { ...defaultCloudStorage, ...(cloud.storage || {}) },
      multiStation,
      antiPrint,
      photographerPortal: {
        ...defaultPhotographerPortal,
        ...photographerPortal,
        maxFilesPerUpload: Math.max(1, Math.min(30, Number(photographerPortal.maxFilesPerUpload || 12)))
      },
      commission: normalizeCommissionSettings(commission),
      cash: {
        ...defaultCashSettings,
        ...cashSettings,
        recommendedChangeFundCents: Math.max(1, Number(cashSettings.recommendedChangeFundCents || defaultCashSettings.recommendedChangeFundCents))
      },
      license: {
        ...license,
        ...planLimits[license.plan],
        maxUsers: Math.max(1, Number(license.maxUsers || planLimits[license.plan].maxUsers)),
        maxLocations: Math.max(1, Number(license.maxLocations || planLimits[license.plan].maxLocations)),
        monthlyPhotoLimit: Math.max(1, Number(license.monthlyPhotoLimit || planLimits[license.plan].monthlyPhotoLimit)),
        offlineGraceDays: Math.max(0, Number(license.offlineGraceDays || 0)),
        lastValidatedAt: new Date().toISOString()
      }
    };

    if (canManagePermissions) {
      payload.users = cleanUsers(users);
    }

    await onUpdateSettings(payload);
    setMessage(canManagePermissions
      ? 'Configurações, licença, locais, pacotes, biblioteca Chroma, cenários rápidos, anti-print, app mobile, multi-estação, cotações, comissões e usuários salvos no banco local.'
      : 'Configurações salvas. Gestão de usuários continua exclusiva do gestor/adm.');
  }


  async function checkCloudStorage() {
    try {
      const result = await window.pictourDesktop?.getCloudStorageInfo?.();
      if (result) {
        setCloudStorageInfo(result);
        setCloud((current) => ({
          ...current,
          storage: {
            ...defaultCloudStorage,
            ...(current.storage || {}),
            ...(result.storage || {}),
            lastHealthCheckAt: result.checkedAt || new Date().toISOString(),
            lastHealthMessage: result.message || (result.ok ? 'Storage cloud respondeu corretamente.' : 'Storage cloud retornou alerta.')
          }
        }));
        setMessage(result.message || (result.ok ? 'Storage cloud respondeu corretamente.' : 'Não foi possível validar o storage.'));
      } else {
        setMessage('Validação do storage funciona no app Electron.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao validar storage cloud.');
    }
  }


  async function refreshMultiStationInfo() {
    const info = await onGetMultiStationInfo();
    setMultiStationInfo(info);
    if (info?.lastSyncMessage) setMessage(info.lastSyncMessage);
  }

  async function pullPrimaryNow() {
    const result = await onPullFromPrimaryStation();
    setMessage(result.message);
    if (result.ok) await refreshMultiStationInfo();
  }

  function addLocation() {
    const name = newLocationName.trim();
    if (!name) return;
    if (locations.some((location) => location.name.toLowerCase() === name.toLowerCase())) {
      setMessage('Esse local/parque já está cadastrado.');
      return;
    }
    setLocations((current) => [...current, { id: makeLocalId('loc'), name, active: true, createdAt: new Date().toISOString() }]);
    if (!locationName) setLocationName(name);
    setNewPackage((current) => ({ ...current, locationName: current.locationName || name }));
    setNewLocationName('');
  }

  function toggleLocation(locationId: string) {
    setLocations((current) => current.map((location) => location.id === locationId ? { ...location, active: location.active === false } : location));
  }

  function deleteLocation(locationId: string) {
    const target = locations.find((location) => location.id === locationId);
    if (!target) return;
    const remaining = locations.filter((location) => location.id !== locationId);
    setLocations(remaining);
    setPackages((current) => current.filter((packageOption) => packageOption.locationName !== target.name));
    if (locationName === target.name) setLocationName(remaining.find((location) => location.active !== false)?.name || remaining[0]?.name || '');
    setMessage(`Local “${target.name}” deletado da configuração local. Pacotes desse local também foram removidos.`);
  }

  function addPackage() {
    const name = newPackage.name.trim();
    const location = newPackage.locationName || activeLocations[0]?.name || locationName;
    const priceCents = parseMoneyToCents(newPackage.price);
    if (!name || !location || !priceCents) {
      setMessage('Preencha nome, local e valor do pacote.');
      return;
    }

    setPackages((current) => [...current, {
      id: makeLocalId('pkg'),
      name,
      locationName: location,
      photoQuantity: newPackage.includesAllPhotos ? null : 1,
      includesAllPhotos: newPackage.includesAllPhotos,
      priceCents,
      currency: 'BRL',
      pricingMode: newPackage.includesAllPhotos ? 'FIXED' : newPackage.pricingMode,
      active: true,
      createdAt: new Date().toISOString()
    }]);
    setNewPackage((current) => ({ ...current, name: '', price: '40,00', includesAllPhotos: false, pricingMode: 'PER_PHOTO' }));
  }

  function updatePackage(packageId: string, patch: Partial<PackageOption>) {
    setPackages((current) => current.map((packageOption) => (
      packageOption.id === packageId ? { ...packageOption, ...patch } : packageOption
    )));
  }

  function deletePackage(packageId: string) {
    setPackages((current) => current.filter((packageOption) => packageOption.id !== packageId));
  }

  function handleQuickScenarioFile(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      setNewQuickScenario((current) => ({
        ...current,
        imageUrl: dataUrl,
        thumbnailUrl: dataUrl,
        fileName: file.name,
        name: current.name || file.name.replace(/\.[^.]+$/, '')
      }));
    };
    reader.readAsDataURL(file);
  }

  function addQuickScenario() {
    const name = newQuickScenario.name.trim();
    if (!name) {
      setMessage('Informe um nome para o cenário rápido.');
      return;
    }
    const now = new Date().toISOString();
    setQuickScenarios((current) => [{
      id: makeLocalId('quick'),
      name,
      imageUrl: newQuickScenario.imageUrl || undefined,
      thumbnailUrl: newQuickScenario.thumbnailUrl || newQuickScenario.imageUrl || undefined,
      isDefault: false,
      isActive: true,
      sortOrder: current.length + 1,
      createdAt: now,
      updatedAt: now
    }, ...current]);
    setNewQuickScenario({ name: '', imageUrl: '', thumbnailUrl: '', fileName: '' });
    setMessage(`Cenário rápido “${name}” adicionado. Clique em Salvar configurações para persistir.`);
  }

  function updateQuickScenario(scenarioId: string, patch: Partial<QuickScenario>) {
    setQuickScenarios((current) => current.map((scenario) => scenario.id === scenarioId ? { ...scenario, ...patch, updatedAt: new Date().toISOString() } : scenario));
  }

  function deleteQuickScenario(scenarioId: string) {
    setQuickScenarios((current) => current.filter((scenario) => scenario.id !== scenarioId));
  }

  function handleChromaAssetFile(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      setNewChromaAsset((current) => ({
        ...current,
        imageUrl: dataUrl,
        thumbnailUrl: dataUrl,
        fileName: file.name,
        name: current.name || file.name.replace(/\.[^.]+$/, '')
      }));
    };
    reader.readAsDataURL(file);
  }

  function addChromaAsset() {
    const name = newChromaAsset.name.trim();
    if (!name || !newChromaAsset.imageUrl) {
      setMessage('Informe nome e imagem para cadastrar o cenário/template oficial.');
      return;
    }
    const location = newChromaAsset.locationName || '';
    const asset: ChromaAsset = {
      id: makeLocalId('chroma'),
      name,
      description: newChromaAsset.description.trim() || undefined,
      type: newChromaAsset.type,
      locationName: location || undefined,
      imageUrl: newChromaAsset.imageUrl,
      thumbnailUrl: newChromaAsset.thumbnailUrl || newChromaAsset.imageUrl,
      isActive: true,
      isDefault: false,
      sortOrder: chromaAssets.length + 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: currentUser.username
    };
    setChromaAssets((current) => [asset, ...current]);
    setNewChromaAsset({ name: '', description: '', locationName: '', type: 'SCENARIO', imageUrl: '', thumbnailUrl: '', fileName: '' });
    setMessage(`Cenário/template “${name}” adicionado à biblioteca. Clique em Salvar configurações para persistir.`);
  }

  function updateChromaAsset(assetId: string, patch: Partial<ChromaAsset>) {
    setChromaAssets((current) => current.map((asset) => {
      if (asset.id !== assetId) return asset;
      const next = { ...asset, ...patch, updatedAt: new Date().toISOString() };
      return next;
    }));
  }

  function setDefaultChromaAsset(assetId: string) {
    const target = chromaAssets.find((asset) => asset.id === assetId);
    if (!target) return;
    setChromaAssets((current) => current.map((asset) => (
      asset.type === target.type && (asset.locationName || '') === (target.locationName || '')
        ? { ...asset, isDefault: asset.id === assetId, updatedAt: new Date().toISOString() }
        : asset
    )));
  }

  function deleteChromaAsset(assetId: string) {
    setChromaAssets((current) => current.filter((asset) => asset.id !== assetId));
  }

  function updateExchangeRate(currency: CurrencyCode, value: string) {
    setExchangeRates((current) => ({ ...current, [currency]: parseRate(value) }));
  }


  function updateCommissionRate(username: string, value: string) {
    const key = username.trim().toLowerCase();
    const rate = Math.min(100, Math.max(0, parseRate(value)));
    setCommission((current) => ({
      ...current,
      individualRates: {
        ...(current.individualRates || {}),
        [key]: rate
      }
    }));
  }

  function toggleCollectiveUser(username: string) {
    const key = username.trim().toLowerCase();
    setCommission((current) => {
      const currentSet = new Set(current.collectiveUsernames || []);
      if (currentSet.has(key)) currentSet.delete(key);
      else currentSet.add(key);
      return { ...current, collectiveUsernames: Array.from(currentSet) };
    });
  }

  function updateCommissionMode(mode: CommissionMode) {
    setCommission((current) => ({ ...current, mode }));
  }


  function applyPlan(plan: SubscriptionPlan) {
    setLicense((current) => ({
      ...current,
      plan,
      ...planLimits[plan],
      features: { ...planLimits[plan].features }
    }));
  }

  function activateLocalLicense(days = 30) {
    const now = new Date();
    setLicense((current) => ({
      ...current,
      status: 'ACTIVE',
      licenseKey: current.licenseKey || `LOCAL-${current.plan}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      activatedAt: now.toISOString(),
      lastValidatedAt: now.toISOString(),
      expiresAt: isoDateOnly(addDays(now, days)),
      notes: 'Ativação local MVP. Na produção, essa validação será feita pelo servidor de licenças do PicTour.'
    }));
  }

  function startTrial(days = 14) {
    const now = new Date();
    setLicense((current) => ({
      ...current,
      status: 'TRIAL',
      activatedAt: now.toISOString(),
      lastValidatedAt: now.toISOString(),
      expiresAt: isoDateOnly(addDays(now, days)),
      notes: 'Teste local iniciado pelo gestor.'
    }));
  }

  async function validateRemoteLicense() {
    if (!canManagePermissions) return;
    setMessage('Validando licença no servidor PicTour...');
    const result = await onValidateLicense({
      companyId: license.companyId,
      licenseKey: license.licenseKey,
      licenseServerUrl: license.licenseServerUrl || cloud.apiBaseUrl,
      actorUsername: currentUser.username
    });

    if (result.license) setLicense(result.license);
    setMessage(result.message);
  }

  function addUser() {
    if (!canManagePermissions) return;
    const name = newUser.name.trim();
    const username = newUser.username.trim().toLowerCase();
    const password = newUser.password.trim();
    if (!name || !username || !password) {
      setMessage('Preencha nome, login e senha para cadastrar o vendedor/usuário.');
      return;
    }
    if (users.some((user) => user.username.toLowerCase() === username)) {
      setMessage('Esse login já existe. Use outro.');
      return;
    }
    setUsers((current) => [...current, {
      id: makeLocalId('user'),
      name,
      username,
      password,
      role: newUser.role,
      adminPermissions: newUser.role === 'MANAGER' ? true : newUser.adminPermissions,
      permissions: newUser.role === 'MANAGER' ? managerPermissions() : { ...defaultStaffPermissions(), SETTINGS: newUser.adminPermissions, REPORTS: newUser.adminPermissions, CASH_CONTROL: newUser.adminPermissions, CANCEL_SALE: newUser.adminPermissions, CLOUD_PUBLISH: newUser.adminPermissions, BACKUP: newUser.adminPermissions, AUDIT_LOG: newUser.adminPermissions },
      active: true,
      createdAt: new Date().toISOString()
    }]);
    setNewUser({ name: '', username: '', password: '', role: 'STAFF', adminPermissions: false });
  }

  function updateUser(userId: string, patch: Partial<AppUser>) {
    if (!canManagePermissions) return;
    setUsers((current) => current.map((user) => {
      if (user.id !== userId) return user;
      const nextRole = patch.role || user.role;
      const adminPermissions = nextRole === 'MANAGER' ? true : Boolean(patch.adminPermissions ?? user.adminPermissions);
      return {
        ...user,
        ...patch,
        role: nextRole,
        adminPermissions,
        permissions: nextRole === 'MANAGER' ? managerPermissions() : { ...defaultStaffPermissions(), ...(user.permissions || {}), ...(patch.permissions || {}), SETTINGS: adminPermissions ? true : Boolean((patch.permissions || user.permissions || {}).SETTINGS), REPORTS: adminPermissions ? true : Boolean((patch.permissions || user.permissions || {}).REPORTS), CASH_CONTROL: adminPermissions ? true : Boolean((patch.permissions || user.permissions || {}).CASH_CONTROL), CANCEL_SALE: adminPermissions ? true : Boolean((patch.permissions || user.permissions || {}).CANCEL_SALE), CLOUD_PUBLISH: adminPermissions ? true : Boolean((patch.permissions || user.permissions || {}).CLOUD_PUBLISH), BACKUP: adminPermissions ? true : Boolean((patch.permissions || user.permissions || {}).BACKUP), AUDIT_LOG: adminPermissions ? true : Boolean((patch.permissions || user.permissions || {}).AUDIT_LOG) }
      };
    }));
  }

  function toggleUserPermission(userId: string, permission: AppPermission) {
    if (!canManagePermissions) return;
    setUsers((current) => current.map((user) => {
      if (user.id !== userId || user.role === 'MANAGER') return user;
      const permissions = resolveUserPermissions(user);
      return {
        ...user,
        permissions: {
          ...permissions,
          [permission]: !permissions[permission]
        },
        adminPermissions: permission === 'SETTINGS' ? !permissions[permission] : user.adminPermissions
      };
    }));
  }

  async function handleChangePassword() {
    if (!newPasswordValue || newPasswordValue !== confirmPasswordValue) {
      setMessage('Confirme a nova senha corretamente.');
      return;
    }

    const result = await onChangePassword(currentUser.username, currentPassword, newPasswordValue);
    setMessage(result.message);
    if (result.ok) {
      setCurrentPassword('');
      setNewPasswordValue('');
      setConfirmPasswordValue('');
    }
  }

  const licenseHealth = getLicenseHealth({ ...settings, users, locations, license });
  const tokenLooksSandbox = mercadoPago.accessToken?.startsWith('TEST-');
  const tokenWarning = mercadoPago.environment === 'sandbox' && mercadoPago.accessToken && !tokenLooksSandbox
    ? 'Atenção: token sandbox normalmente começa com TEST-.'
    : 'Use credenciais de teste enquanto estivermos na fase sandbox.';

  return (
    <div className="settingsGrid settingsGridV7">
      <section className="panel">
        <p className="eyebrow">Marca</p>
        <h2>Identidade visual</h2>
        <label>Nome da empresa</label>
        <input value={companyName} onChange={(event) => setCompanyName(event.target.value)} />
        <label>Local padrão</label>
        <select value={locationName} onChange={(event) => setLocationName(event.target.value)}>
          {activeLocations.map((location) => <option key={location.id} value={location.name}>{location.name}</option>)}
          {!activeLocations.length && <option value={locationName}>{locationName || 'Operação PicTour'}</option>}
        </select>
        <label>Cor primária</label>
        <input defaultValue="#0B74FF" />
        <label>Texto da watermark</label>
        <input defaultValue={`${companyName.toUpperCase()} • PICTOUR`} />
        <button className="primaryButton fullWidth" type="button" onClick={saveSettings}>Salvar configurações</button>
        <div className="infoBox successBox">{message}</div>
      </section>



      <section className="panel licensePanel">
        <p className="eyebrow">Licença / assinatura</p>
        <h2>Contrato da empresa</h2>
        <p className="mutedParagraph">Controle local da assinatura do PicTour. Na versão atual, a licença pode ser validada no servidor cloud do PicTour e ainda mantém tolerância offline para operação em campo.</p>
        <div className="licenseStatusGrid">
          <div className={`licenseStatusCard ${licenseHealth.ready ? 'ok' : 'warn'}`}>
            <span>Status</span>
            <strong>{licenseStatusLabels[license.status]}</strong>
            <small>{licenseHealth.daysLeft === null ? 'Sem data de vencimento' : licenseHealth.daysLeft >= 0 ? `${licenseHealth.daysLeft} dia(s) restantes` : `Vencida há ${Math.abs(licenseHealth.daysLeft)} dia(s)`}</small>
          </div>
          <div className="licenseStatusCard">
            <span>Plano</span>
            <strong>{planLabels[license.plan]}</strong>
            <small>{planDescriptions[license.plan]}</small>
          </div>
        </div>

        <label>Plano contratado</label>
        <select value={license.plan} disabled={!canManagePermissions} onChange={(event) => applyPlan(event.target.value as SubscriptionPlan)}>
          {planOrder.map((plan) => <option key={plan} value={plan}>{planLabels[plan]}</option>)}
        </select>

        <label>Status da licença</label>
        <select value={license.status} disabled={!canManagePermissions} onChange={(event) => setLicense((current) => ({ ...current, status: event.target.value as LicenseStatus }))}>
          {statusOrder.map((status) => <option key={status} value={status}>{licenseStatusLabels[status]}</option>)}
        </select>

        <label>Chave da licença</label>
        <input value={license.licenseKey || ''} disabled={!canManagePermissions} placeholder="LOCAL-PRO-ABC123" onChange={(event) => setLicense((current) => ({ ...current, licenseKey: event.target.value }))} />
        <label>ID da empresa no painel PicTour</label>
        <input value={license.companyId || ''} disabled={!canManagePermissions} placeholder="empresa_..." onChange={(event) => setLicense((current) => ({ ...current, companyId: event.target.value }))} />
        <label>Servidor de licenças</label>
        <input value={license.licenseServerUrl || cloud.apiBaseUrl || 'http://127.0.0.1:8787'} disabled={!canManagePermissions} placeholder="https://cloud.seudominio.com" onChange={(event) => setLicense((current) => ({ ...current, licenseServerUrl: event.target.value }))} />
        <label>ID da licença no servidor</label>
        <input value={license.serverLicenseId || ''} disabled placeholder="Preenchido após validação cloud" />
        <label>Última validação</label>
        <input value={license.lastValidatedAt ? new Date(license.lastValidatedAt).toLocaleString('pt-BR') : 'Nunca validada'} disabled />
        <label>Último check-in SaaS</label>
        <input value={license.lastCheckInAt ? new Date(license.lastCheckInAt).toLocaleString('pt-BR') : 'Ainda não sincronizado'} disabled />
        <label>Validade</label>
        <input type="date" value={license.expiresAt || ''} disabled={!canManagePermissions} onChange={(event) => setLicense((current) => ({ ...current, expiresAt: event.target.value }))} />
        <label>Dias de tolerância offline</label>
        <input value={String(license.offlineGraceDays)} disabled={!canManagePermissions} onChange={(event) => setLicense((current) => ({ ...current, offlineGraceDays: Math.max(0, Number(event.target.value.replace(/\D/g, '') || 0)) }))} />

        <div className="licenseLimitGrid">
          <label>Usuários máximos<input value={String(license.maxUsers)} disabled={!canManagePermissions} onChange={(event) => setLicense((current) => ({ ...current, maxUsers: Number(event.target.value.replace(/\D/g, '') || 1) }))} /></label>
          <label>Locais máximos<input value={String(license.maxLocations)} disabled={!canManagePermissions} onChange={(event) => setLicense((current) => ({ ...current, maxLocations: Number(event.target.value.replace(/\D/g, '') || 1) }))} /></label>
          <label>Fotos/mês<input value={String(license.monthlyPhotoLimit)} disabled={!canManagePermissions} onChange={(event) => setLicense((current) => ({ ...current, monthlyPhotoLimit: Number(event.target.value.replace(/\D/g, '') || 1) }))} /></label>
        </div>

        <div className="licenseUsageBox">
          <span>Uso atual</span>
          <strong>{licenseHealth.activeUsers}/{license.maxUsers} usuários • {licenseHealth.activeLocations}/{license.maxLocations} locais • {licenseHealth.photosThisMonth}/{license.monthlyPhotoLimit} fotos/mês</strong>
          {!licenseHealth.ready && <em>Existem limites vencidos/excedidos. Revise o plano antes de operar em produção.</em>}
        </div>

        <div className="featureGridMini">
          <span className={license.features.cloudGallery ? 'featureOn' : 'featureOff'}>Cloud</span>
          <span className={license.features.mercadoPago ? 'featureOn' : 'featureOff'}>Mercado Pago</span>
          <span className={license.features.aiBackgroundRemoval ? 'featureOn' : 'featureOff'}>Recorte IA</span>
          <span className={license.features.auditLogs ? 'featureOn' : 'featureOff'}>Auditoria</span>
          <span className={license.features.multiLocation ? 'featureOn' : 'featureOff'}>Multi-local</span>
          <span className={license.features.advancedReports ? 'featureOn' : 'featureOff'}>Relatórios+</span>
        </div>

        <label>Observações internas</label>
        <textarea value={license.notes || ''} disabled={!canManagePermissions} onChange={(event) => setLicense((current) => ({ ...current, notes: event.target.value }))} />
        <div className="actionRow wrapRow">
          <button className="ghostButton" type="button" disabled={!canManagePermissions} onClick={() => startTrial(14)}>Iniciar teste 14 dias</button>
          <button className="ghostButton" type="button" disabled={!canManagePermissions} onClick={() => activateLocalLicense(30)}>Ativar 30 dias</button>
          <button className="ghostButton" type="button" disabled={!canManagePermissions} onClick={() => activateLocalLicense(365)}>Ativar 1 ano</button>
          <button className="primaryButton" type="button" disabled={!canManagePermissions} onClick={validateRemoteLicense}>Validar no servidor</button>
        </div>
        <div className="infoBox">{license.lastValidationMessage || 'Sugestão comercial atual: Starter para 1 local/5 usuários sem cloud avançada; Pro para até 15 usuários com cloud, Mercado Pago e relatórios; Enterprise para multi-local, IA, suporte avançado e limites maiores.'}</div>
      </section>

      <section className="panel">
        <p className="eyebrow">Locais / parques</p>
        <h2>Cadastro rápido</h2>
        <p className="mutedParagraph">As sessões passam a usar lista pronta. Nada de digitar o parque em toda venda — o caixa agradece, o tempo também.</p>
        <div className="inlineFormRow">
          <input value={newLocationName} placeholder="Ex: Parque Aventura" onChange={(event) => setNewLocationName(event.target.value)} />
          <button className="ghostButton" type="button" onClick={addLocation}>Adicionar</button>
        </div>
        <div className="compactList">
          {locations.map((location) => (
            <div key={location.id} className="listRow listRowStackable">
              <div>
                <strong>{location.name}</strong>
                <span>{location.active === false ? 'Inativo' : 'Ativo'}</span>
              </div>
              <div className="rowActions">
                <button className="miniButton" type="button" onClick={() => toggleLocation(location.id)}>{location.active === false ? 'Reativar' : 'Desativar'}</button>
                <button className="dangerMiniButton" type="button" onClick={() => deleteLocation(location.id)}>Deletar</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel packageConfigPanel">
        <p className="eyebrow">Pacotes por local</p>
        <h2>Valores de venda</h2>
        <p className="mutedParagraph">Crie pacotes específicos por parque/unidade. Na Venda Rápida, o sistema mostra só os pacotes do local da sessão.</p>
        <div className="packageCreateGrid">
          <input value={newPackage.name} placeholder="Ex: 1 Foto Digital" onChange={(event) => setNewPackage((current) => ({ ...current, name: event.target.value }))} />
          <select value={newPackage.locationName} onChange={(event) => setNewPackage((current) => ({ ...current, locationName: event.target.value }))}>
            {activeLocations.map((location) => <option key={location.id} value={location.name}>{location.name}</option>)}
            {!activeLocations.length && <option value={locationName}>{locationName || 'Operação PicTour'}</option>}
          </select>
          <input value={newPackage.price} placeholder="40,00" onChange={(event) => setNewPackage((current) => ({ ...current, price: event.target.value }))} />
          <select value={newPackage.pricingMode} onChange={(event) => setNewPackage((current) => ({ ...current, pricingMode: event.target.value as PackagePricingMode, includesAllPhotos: event.target.value === 'FIXED' ? current.includesAllPhotos : false }))}>
            <option value="PER_PHOTO">Multiplicar por foto selecionada</option>
            <option value="FIXED">Valor fechado</option>
          </select>
          <label className="toggleLine noMargin"><input type="checkbox" checked={newPackage.includesAllPhotos} onChange={(event) => setNewPackage((current) => ({ ...current, includesAllPhotos: event.target.checked, pricingMode: event.target.checked ? 'FIXED' : current.pricingMode }))} /> Pacote “todas as fotos”</label>
          <button className="ghostButton" type="button" onClick={addPackage}>Adicionar pacote</button>
        </div>
        <div className="compactList packageList">
          {packages.map((packageOption) => (
            <div key={packageOption.id} className="packageRow">
              <div>
                <strong>{packageOption.name}</strong>
                <span>{packageOption.locationName || 'Todos os locais'} • {formatMoney(packageOption.priceCents, 'BRL')} • {getPackageUnitLabel(packageOption)}</span>
              </div>
              <div className="rowActions">
                <input value={centsToInput(packageOption.priceCents)} onChange={(event) => updatePackage(packageOption.id, { priceCents: parseMoneyToCents(event.target.value) })} />
                <button className="miniButton" type="button" onClick={() => updatePackage(packageOption.id, { active: packageOption.active === false })}>{packageOption.active === false ? 'Reativar' : 'Desativar'}</button>
                <button className="dangerMiniButton" type="button" onClick={() => deletePackage(packageOption.id)}>Deletar</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel chromaLibraryPanel">
        <p className="eyebrow">Biblioteca Chroma • v{APP_VERSION}</p>
        <h2>Cenários/templates oficiais por parque</h2>
        <p className="mutedParagraph">Cadastre uma vez aqui e o operador escolhe no Chroma Studio sem importar fundo toda hora. Menos improviso, mais padrão de franquia.</p>

        <div className="packageCreateGrid chromaAssetCreateGrid">
          <input value={newChromaAsset.name} placeholder="Nome do cenário/template" onChange={(event) => setNewChromaAsset((current) => ({ ...current, name: event.target.value }))} />
          <select value={newChromaAsset.type} onChange={(event) => setNewChromaAsset((current) => ({ ...current, type: event.target.value as ChromaAssetType }))}>
            <option value="SCENARIO">Cenário</option>
            <option value="TEMPLATE">Template</option>
            <option value="OVERLAY">Overlay</option>
          </select>
          <select value={newChromaAsset.locationName} onChange={(event) => setNewChromaAsset((current) => ({ ...current, locationName: event.target.value }))}>
            <option value="">Todos os locais</option>
            {activeLocations.map((location) => <option key={location.id} value={location.name}>{location.name}</option>)}
          </select>
          <input value={newChromaAsset.description} placeholder="Descrição opcional" onChange={(event) => setNewChromaAsset((current) => ({ ...current, description: event.target.value }))} />
          <label className="fileLikeInput">
            Selecionar imagem
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => handleChromaAssetFile(event.target.files?.[0])} />
          </label>
          <button className="ghostButton" type="button" onClick={addChromaAsset}>Adicionar à biblioteca</button>
        </div>

        {newChromaAsset.imageUrl && (
          <div className="chromaAssetPreview">
            <span style={{ backgroundImage: `url(${newChromaAsset.thumbnailUrl || newChromaAsset.imageUrl})` }} />
            <div>
              <strong>{newChromaAsset.name || 'Prévia do cenário'}</strong>
              <em>{newChromaAsset.fileName}</em>
            </div>
          </div>
        )}

        <div className="compactList chromaAssetListSettings">
          {chromaAssets.map((asset) => (
            <div key={asset.id} className="chromaAssetSettingsRow">
              <span className="chromaAssetSettingsThumb" style={{ backgroundImage: `url(${asset.thumbnailUrl || asset.imageUrl})` }} />
              <div>
                <input value={asset.name} onChange={(event) => updateChromaAsset(asset.id, { name: event.target.value })} />
                <span>{asset.type} • {asset.locationName || 'Todos os locais'} • {asset.isActive === false ? 'Inativo' : 'Ativo'}{asset.isDefault ? ' • Padrão' : ''}</span>
              </div>
              <div className="rowActions">
                <button className="miniButton" type="button" onClick={() => updateChromaAsset(asset.id, { isActive: asset.isActive === false })}>{asset.isActive === false ? 'Reativar' : 'Desativar'}</button>
                <button className="miniButton" type="button" onClick={() => setDefaultChromaAsset(asset.id)}>Padrão</button>
                <button className="dangerMiniButton" type="button" onClick={() => deleteChromaAsset(asset.id)}>Remover</button>
              </div>
            </div>
          ))}
          {!chromaAssets.length && <div className="infoBox">Nenhum cenário oficial cadastrado ainda. Comece com 3 a 5 fundos campeões de venda por parque.</div>}
        </div>
      </section>


      <section className="panel quickScenarioPanel">
        <p className="eyebrow">Captura</p>
        <h2>Cenários rápidos da aba Captura</h2>
        <p className="mutedParagraph">Controle os cenários rápidos que aparecem para o operador na captura. Você pode desativar os padrões, remover itens que não usa e adicionar atalhos com imagem personalizada.</p>
        <div className="packageCreateGrid chromaAssetCreateGrid">
          <input value={newQuickScenario.name} placeholder="Nome do cenário rápido" onChange={(event) => setNewQuickScenario((current) => ({ ...current, name: event.target.value }))} />
          <label className="fileLikeInput">
            Selecionar imagem opcional
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => handleQuickScenarioFile(event.target.files?.[0])} />
          </label>
          <button className="ghostButton" type="button" onClick={addQuickScenario}>Adicionar cenário rápido</button>
        </div>
        {newQuickScenario.imageUrl && (
          <div className="chromaAssetPreview">
            <span style={{ backgroundImage: `url(${newQuickScenario.thumbnailUrl || newQuickScenario.imageUrl})` }} />
            <div><strong>{newQuickScenario.name || 'Prévia do cenário rápido'}</strong><em>{newQuickScenario.fileName}</em></div>
          </div>
        )}
        <div className="compactList chromaAssetListSettings">
          {quickScenarios.map((scenario) => (
            <div key={scenario.id} className="chromaAssetSettingsRow">
              {scenario.thumbnailUrl || scenario.imageUrl ? <span className="chromaAssetSettingsThumb" style={{ backgroundImage: `url(${scenario.thumbnailUrl || scenario.imageUrl})` }} /> : <span className="chromaAssetSettingsThumb scenarioPlaceholderThumb">QR</span>}
              <div>
                <input value={scenario.name} onChange={(event) => updateQuickScenario(scenario.id, { name: event.target.value })} />
                <span>{scenario.isDefault ? 'Padrão do PicTour' : 'Personalizado'} • {scenario.isActive === false ? 'Inativo' : 'Ativo'} • Ordem {scenario.sortOrder || 0}</span>
              </div>
              <div className="rowActions">
                <button className="miniButton" type="button" onClick={() => updateQuickScenario(scenario.id, { isActive: scenario.isActive === false })}>{scenario.isActive === false ? 'Reativar' : 'Desativar'}</button>
                <button className="dangerMiniButton" type="button" onClick={() => deleteQuickScenario(scenario.id)}>{scenario.isDefault ? 'Excluir padrão' : 'Remover'}</button>
              </div>
            </div>
          ))}
          {!quickScenarios.length && <div className="infoBox">Nenhum cenário rápido cadastrado. Adicione pelo formulário acima ou recarregue os padrões depois.</div>}
        </div>
      </section>

      <section className="panel cashSettingsPanel">
        <p className="eyebrow">Caixa</p>
        <h2>Fundo de troco e comprovantes térmicos</h2>
        <p className="mutedParagraph">Defina o valor recomendado e a impressora térmica para emissão automática de comprovantes de abertura, sangria e fechamento. Se nenhuma impressora estiver configurada, o PicTour salva um .txt na pasta de dados.</p>
        <div className="settingsGrid">
          <label>Nome do caixa/PDV
            <input
              value={cashSettings.cashRegisterName || 'Caixa 01'}
              onChange={(event) => setCashSettings((current) => ({ ...current, cashRegisterName: event.target.value }))}
              placeholder="Caixa 01"
            />
          </label>
          <label>Fundo de troco recomendado
            <div className="inlineFormRow">
              <input
                value={centsToInput(cashSettings.recommendedChangeFundCents || defaultCashSettings.recommendedChangeFundCents)}
                onChange={(event) => setCashSettings((current) => ({ ...current, recommendedChangeFundCents: parseMoneyToCents(event.target.value) }))}
                placeholder="500,00"
              />
              <button className="miniButton" type="button" onClick={() => setCashSettings((current) => ({ ...current, recommendedChangeFundCents: 50000 }))}>Usar R$500</button>
            </div>
          </label>
          <label>Impressora térmica
            <select
              value={cashSettings.receiptPrinterName || ''}
              onChange={(event) => setCashSettings((current) => ({ ...current, receiptPrinterName: event.target.value }))}
            >
              <option value="">Sem impressora — salvar .txt</option>
              {availablePrinters.map((printer) => <option key={printer.name} value={printer.name}>{printer.displayName || printer.name}</option>)}
            </select>
          </label>
          <label>Largura da bobina em caracteres
            <input
              type="number"
              min={32}
              max={56}
              value={cashSettings.receiptPaperWidthChars || 42}
              onChange={(event) => setCashSettings((current) => ({ ...current, receiptPaperWidthChars: Number(event.target.value || 42) }))}
            />
          </label>
        </div>
        <label className="toggleLine noMargin"><input type="checkbox" checked={cashSettings.requireOpeningChangeFund !== false} onChange={(event) => setCashSettings((current) => ({ ...current, requireOpeningChangeFund: event.target.checked }))} /> Exigir fundo de troco na abertura</label>
        <label className="toggleLine noMargin"><input type="checkbox" checked={cashSettings.warnIfClosingChangeFundDifferent !== false} onChange={(event) => setCashSettings((current) => ({ ...current, warnIfClosingChangeFundDifferent: event.target.checked }))} /> Alertar se o fundo final for diferente da abertura</label>
        <label className="toggleLine noMargin"><input type="checkbox" checked={cashSettings.autoPrintCashReceipts !== false} onChange={(event) => setCashSettings((current) => ({ ...current, autoPrintCashReceipts: event.target.checked }))} /> Emitir comprovantes automaticamente</label>
        <div className="infoBox">Na abertura o PicTour sugere {formatMoney(cashSettings.recommendedChangeFundCents || 50000, 'BRL')}. Comprovantes incluem horário, atendente, caixa/PDV, fundo de troco e área para assinatura.</div>
      </section>

      <section className="panel exchangePanel">
        <p className="eyebrow">Conversão</p>
        <h2>Cotação manual do caixa</h2>
        <p className="mutedParagraph">Informe quantos reais valem 1 unidade da moeda. Exemplo: dólar = R$5,00.</p>
        <div className="exchangeList">
          {currencyOrder.map((currency) => (
            <label key={currency} className="exchangeRow">
              <span>{currency} — {currencyLabels[currency]}</span>
              <input value={String(exchangeRates[currency]).replace('.', ',')} onChange={(event) => updateExchangeRate(currency, event.target.value)} />
              <button className="miniButton" type="button" onClick={() => setExchangeRates((current) => ({ ...current, [currency]: suggestedExchangeRates[currency] }))}>Usar sugestão</button>
              <em>Sugestão: {formatRate(suggestedExchangeRates[currency])}</em>
            </label>
          ))}
        </div>
      </section>

      <section className="panel commissionPanel">
        <p className="eyebrow">Comissões</p>
        <h2>Regras de comissão</h2>
        <p className="mutedParagraph">Configure a comissão como desligada, individual por vendedor ou coletiva dividida igualmente pela equipe.</p>
        <label>Modo de comissão</label>
        <select value={commission.mode} disabled={!canManagePermissions} onChange={(event) => updateCommissionMode(event.target.value as CommissionMode)}>
          <option value="NONE">Sem comissão</option>
          <option value="INDIVIDUAL">Comissão individual</option>
          <option value="COLLECTIVE">Comissão coletiva / equipe</option>
        </select>
        <label>Percentual padrão</label>
        <input
          value={String(commission.defaultRatePercent).replace('.', ',')}
          disabled={!canManagePermissions || commission.mode === 'NONE'}
          onChange={(event) => setCommission((current) => ({ ...current, defaultRatePercent: Math.min(100, Math.max(0, parseRate(event.target.value))) }))}
        />
        <div className="infoBox">
          {commission.mode === 'NONE' && 'Nenhuma comissão é calculada nas vendas.'}
          {commission.mode === 'INDIVIDUAL' && 'Cada venda gera comissão para o vendedor escolhido na Venda Rápida. Se o vendedor não tiver percentual próprio, usa o percentual padrão.'}
          {commission.mode === 'COLLECTIVE' && 'Cada venda gera uma comissão total e divide igualmente entre os membros marcados da equipe.'}
        </div>

        {commission.mode === 'INDIVIDUAL' && (
          <div className="commissionList">
            {users.filter((user) => user.active !== false).map((user) => (
              <label key={user.id} className="commissionRow">
                <span>{user.name}<em>@{user.username}</em></span>
                <input
                  disabled={!canManagePermissions}
                  value={String((commission.individualRates || {})[user.username.toLowerCase()] ?? commission.defaultRatePercent).replace('.', ',')}
                  onChange={(event) => updateCommissionRate(user.username, event.target.value)}
                />
                <strong>%</strong>
              </label>
            ))}
          </div>
        )}

        {commission.mode === 'COLLECTIVE' && (
          <div className="commissionList">
            <label className="toggleLine noMargin">
              <input
                type="checkbox"
                disabled={!canManagePermissions}
                checked={Boolean(commission.includeManagers)}
                onChange={(event) => setCommission((current) => ({ ...current, includeManagers: event.target.checked }))}
              />
              Incluir gestores/adm na divisão coletiva
            </label>
            {users.filter((user) => user.active !== false && (commission.includeManagers || user.role !== 'MANAGER')).map((user) => {
              const username = user.username.toLowerCase();
              const checked = (commission.collectiveUsernames || []).includes(username) || (!(commission.collectiveUsernames || []).length && user.role === 'STAFF');
              return (
                <label key={user.id} className="toggleLine commissionMemberLine">
                  <input type="checkbox" disabled={!canManagePermissions} checked={checked} onChange={() => toggleCollectiveUser(username)} />
                  {user.name} <span>@{user.username}</span>
                </label>
              );
            })}
          </div>
        )}

        {!canManagePermissions && <div className="infoBox">Somente gestor/adm pode alterar regras de comissão.</div>}
      </section>

      <section className="panel userManagementPanel">
        <p className="eyebrow">Acesso</p>
        <h2>Usuários, vendedores e permissões</h2>
        <div className="infoBox">
          Login inicial padrão: <strong>admin</strong> / <strong>admin12345</strong>. Apenas gestor/adm pode criar usuários ou alterar permissões.
        </div>

        {canManagePermissions ? (
          <div className="userCreateBox">
            <input value={newUser.name} placeholder="Nome do vendedor/usuário" onChange={(event) => setNewUser((current) => ({ ...current, name: event.target.value }))} />
            <input value={newUser.username} placeholder="Login" onChange={(event) => setNewUser((current) => ({ ...current, username: event.target.value }))} />
            <input value={newUser.password} type="password" placeholder="Senha" onChange={(event) => setNewUser((current) => ({ ...current, password: event.target.value }))} />
            <select value={newUser.role} onChange={(event) => setNewUser((current) => ({ ...current, role: event.target.value as 'MANAGER' | 'STAFF' }))}>
              <option value="STAFF">Fotógrafo/Caixa</option>
              <option value="MANAGER">Gestor/adm</option>
            </select>
            {newUser.role === 'STAFF' && (
              <label className="toggleLine noMargin"><input type="checkbox" checked={newUser.adminPermissions} onChange={(event) => setNewUser((current) => ({ ...current, adminPermissions: event.target.checked }))} /> Dar acesso às configurações</label>
            )}
            <button className="ghostButton fullWidth" type="button" onClick={addUser}>Cadastrar usuário</button>
          </div>
        ) : (
          <div className="infoBox">Seu usuário tem acesso administrativo limitado, mas não pode alterar gestores nem permissões.</div>
        )}

        <div className="compactList userList">
          {users.map((user) => (
            <div key={user.id} className="userRow">
              <div>
                <strong>{user.name}</strong>
                <span>@{user.username} • {user.role === 'MANAGER' ? 'Gestor/adm' : user.adminPermissions ? 'Fotógrafo/Caixa + adm' : 'Fotógrafo/Caixa'}</span>
              </div>
              {canManagePermissions && (
                <div className="userActions">
                  <select value={user.role} onChange={(event) => updateUser(user.id, { role: event.target.value as 'MANAGER' | 'STAFF' })} disabled={user.username === 'admin'}>
                    <option value="STAFF">Fotógrafo/Caixa</option>
                    <option value="MANAGER">Gestor/adm</option>
                  </select>
                  <label className="toggleLine tiny"><input type="checkbox" checked={user.role === 'MANAGER' || Boolean(user.adminPermissions)} disabled={user.role === 'MANAGER'} onChange={(event) => updateUser(user.id, { adminPermissions: event.target.checked })} /> Adm</label>
                  <label className="toggleLine tiny"><input type="checkbox" checked={user.active !== false} disabled={user.username === 'admin'} onChange={(event) => updateUser(user.id, { active: event.target.checked })} /> Ativo</label>
                </div>
              )}
              {canManagePermissions && user.role !== 'MANAGER' && (
                <div className="permissionGrid">
                  {permissionLabels.map((permission) => {
                    const permissions = resolveUserPermissions(user);
                    return (
                      <label key={permission.key} className="permissionChip">
                        <input type="checkbox" checked={Boolean(permissions[permission.key])} onChange={() => toggleUserPermission(user.id, permission.key)} />
                        {permission.label}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="panel mercadoPagoPanel">
        <p className="eyebrow">Gateway online</p>
        <h2>Mercado Pago • v{APP_VERSION}</h2>

        <label className="toggleLine">
          <input
            type="checkbox"
            checked={mercadoPago.enabled}
            onChange={(event) => setMercadoPago((current) => ({ ...current, enabled: event.target.checked }))}
          />
          Ativar Mercado Pago no pós-passeio/galeria
        </label>

        <label>Ambiente</label>
        <select
          value={mercadoPago.environment}
          onChange={(event) => setMercadoPago((current) => ({ ...current, environment: event.target.value as 'sandbox' | 'production' }))}
        >
          <option value="sandbox">Sandbox / teste</option>
          <option value="production">Produção</option>
        </select>

        <label>Public Key</label>
        <input
          value={mercadoPago.publicKey || ''}
          placeholder="TEST-... ou APP_USR-..."
          onChange={(event) => setMercadoPago((current) => ({ ...current, publicKey: event.target.value }))}
        />
        <small className="fieldHint">Cole a chave pública da sua aplicação no Mercado Pago. Use TEST no sandbox e APP_USR em produção.</small>

        <label>Access Token</label>
        <input
          value={mercadoPago.accessToken || ''}
          placeholder="TEST-... ou APP_USR-..."
          type="password"
          onChange={(event) => setMercadoPago((current) => ({ ...current, accessToken: event.target.value }))}
        />
        <small className="fieldHint">Token privado usado pelo backend cloud para criar checkout e consultar pagamentos. Nunca compartilhe com operador.</small>

        <label className="toggleLine"><input type="checkbox" checked={mercadoPago.autoReleaseDelivery !== false} onChange={(event) => setMercadoPago((current) => ({ ...current, autoReleaseDelivery: event.target.checked }))} /> Liberar entrega automaticamente quando pagamento for aprovado</label>
        <div className="infoBox">{tokenWarning}</div>
      </section>

      <section className="panel">
        <p className="eyebrow">Pós-passeio</p>
        <h2>Links e expiração</h2>
        <label>Expiração pós-passeio</label>
        <select value={defaultPostTourDays} onChange={(event) => setDefaultPostTourDays(event.target.value)}>
          <option value="3">3 dias</option>
          <option value="7">7 dias</option>
          <option value="15">15 dias</option>
          <option value="30">30 dias</option>
        </select>
        <small className="fieldHint">Tempo padrão em que o cliente poderá abrir a galeria/entrega pós-passeio antes de expirar.</small>
        <label>URL de sucesso</label>
        <input value={mercadoPago.successUrl || ''} onChange={(event) => setMercadoPago((current) => ({ ...current, successUrl: event.target.value }))} />
        <small className="fieldHint">Página para onde o cliente volta quando o Mercado Pago aprova o checkout.</small>
        <label>URL de falha</label>
        <input value={mercadoPago.failureUrl || ''} onChange={(event) => setMercadoPago((current) => ({ ...current, failureUrl: event.target.value }))} />
        <small className="fieldHint">Página exibida quando o pagamento é recusado/cancelado.</small>
        <label>URL pendente</label>
        <input value={mercadoPago.pendingUrl || ''} onChange={(event) => setMercadoPago((current) => ({ ...current, pendingUrl: event.target.value }))} />
        <small className="fieldHint">Página usada quando Pix/cartão ainda está aguardando confirmação.</small>
        <label>Webhook HTTPS público</label>
        <input value={mercadoPago.webhookUrl || ''} placeholder="https://api.seudominio.com/webhooks/mercado-pago" onChange={(event) => setMercadoPago((current) => ({ ...current, webhookUrl: event.target.value }))} />
        <small className="fieldHint">URL pública HTTPS do backend cloud que recebe notificações do Mercado Pago. Deve ser acessível pela internet.</small>
        <label>Token secreto opcional do webhook</label>
        <input value={mercadoPago.webhookSecret || ''} placeholder="use o mesmo valor em PICTOUR_MP_WEBHOOK_TOKEN" type="password" onChange={(event) => setMercadoPago((current) => ({ ...current, webhookSecret: event.target.value }))} />
        <small className="fieldHint">Segredo opcional para aceitar webhooks só quando o token recebido bater com o configurado no backend.</small>
        <div className="infoBox successBox">Na versão atual, o backend cloud recebe webhook real do Mercado Pago, consulta o pagamento, libera as fotos automaticamente e o Desktop importa a venda no sync de cloud.</div>
      </section>


      <section className="panel syncPanel">
        <p className="eyebrow">App mobile • v{APP_VERSION}</p>
        <h2>Fotógrafo externo completo</h2>
        <p className="mutedParagraph">Controle o comportamento do portal mobile acessado por QR Code. Na versão atual ele serve para captura, fila local, acompanhamento da sessão, favoritos e pré-seleção.</p>
        <label className="toggleLine"><input type="checkbox" checked={photographerPortal.enabled !== false} onChange={(event) => setPhotographerPortal((current) => ({ ...current, enabled: event.target.checked }))} /> Ativar app mobile do fotógrafo</label>
        <label>Modo do app mobile</label>
        <select value={photographerPortal.mobileMode || 'FULL_OPERATION'} onChange={(event) => setPhotographerPortal((current) => ({ ...current, mobileMode: event.target.value as 'CAPTURE_ONLY' | 'FULL_OPERATION' }))}>
          <option value="FULL_OPERATION">Operação completa: captura + sessão + favoritos + pré-seleção</option>
          <option value="CAPTURE_ONLY">Somente captura/envio</option>
        </select>
        <div className="permissionGrid securityFlags">
          <label><input type="checkbox" checked={photographerPortal.requireSessionAccessCode !== false} onChange={(event) => setPhotographerPortal((current) => ({ ...current, requireSessionAccessCode: event.target.checked }))} /> Exigir código da sessão</label>
          <label><input type="checkbox" checked={photographerPortal.allowMobileSelection !== false} onChange={(event) => setPhotographerPortal((current) => ({ ...current, allowMobileSelection: event.target.checked }))} /> Permitir pré-seleção no celular</label>
          <label><input type="checkbox" checked={photographerPortal.allowMobileFavorite !== false} onChange={(event) => setPhotographerPortal((current) => ({ ...current, allowMobileFavorite: event.target.checked }))} /> Permitir favoritos no celular</label>
          <label><input type="checkbox" checked={photographerPortal.showPurchasedOnMobile !== false} onChange={(event) => setPhotographerPortal((current) => ({ ...current, showPurchasedOnMobile: event.target.checked }))} /> Mostrar vendidas no app</label>
          <label><input type="checkbox" checked={photographerPortal.enableUploadQueue !== false} onChange={(event) => setPhotographerPortal((current) => ({ ...current, enableUploadQueue: event.target.checked }))} /> Exibir fila offline local</label>
        </div>
        <label>Máximo de fotos por envio: {photographerPortal.maxFilesPerUpload || 12}</label>
        <input type="range" min="1" max="30" value={photographerPortal.maxFilesPerUpload || 12} onChange={(event) => setPhotographerPortal((current) => ({ ...current, maxFilesPerUpload: Number(event.target.value) }))} />
        <label>Prefixo padrão do rótulo</label>
        <input value={photographerPortal.defaultLabelPrefix || ''} placeholder="Fotógrafo externo" onChange={(event) => setPhotographerPortal((current) => ({ ...current, defaultLabelPrefix: event.target.value }))} />
        <div className="infoBox successBox">Dica de campo: mantenha o código da sessão ativo para impedir upload no cliente errado. O app mobile usa a mesma rede local do Desktop; para internet externa, combine com cloud/storage.</div>
      </section>


      <section className="panel securityPanel">
        <p className="eyebrow">Segurança visual</p>
        <h2>Anti-print e watermark dinâmico • v{APP_VERSION}</h2>
        <p className="mutedParagraph">Proteção focada em preview: marca d’água variável, bloqueio de arrastar/clique direito, ruído visual e escudo quando o cliente troca de janela. Não existe anti-print 100% perfeito, mas isso aumenta muito o custo de roubo da foto.</p>

        <label className="toggleLine"><input type="checkbox" checked={antiPrint.enabled !== false} onChange={(event) => setAntiPrint((current) => ({ ...current, enabled: event.target.checked }))} /> Ativar proteção anti-print nos previews</label>
        <label>Texto base da watermark</label>
        <input value={antiPrint.watermarkText || ''} placeholder="PICTOUR PREVIEW" onChange={(event) => setAntiPrint((current) => ({ ...current, watermarkText: event.target.value }))} />

        <div className="permissionGrid securityFlags">
          <label><input type="checkbox" checked={antiPrint.includeSessionCode !== false} onChange={(event) => setAntiPrint((current) => ({ ...current, includeSessionCode: event.target.checked }))} /> Incluir código da sessão</label>
          <label><input type="checkbox" checked={antiPrint.includePhotoCode !== false} onChange={(event) => setAntiPrint((current) => ({ ...current, includePhotoCode: event.target.checked }))} /> Incluir código da foto</label>
          <label><input type="checkbox" checked={antiPrint.includeTimestamp !== false} onChange={(event) => setAntiPrint((current) => ({ ...current, includeTimestamp: event.target.checked }))} /> Incluir horário dinâmico</label>
          <label><input type="checkbox" checked={antiPrint.includeStationName !== false} onChange={(event) => setAntiPrint((current) => ({ ...current, includeStationName: event.target.checked }))} /> Incluir nome da estação</label>
          <label><input type="checkbox" checked={antiPrint.resolutionGuard !== false} onChange={(event) => setAntiPrint((current) => ({ ...current, resolutionGuard: event.target.checked }))} /> Guard de baixa resolução</label>
          <label><input type="checkbox" checked={antiPrint.blockContextMenu !== false} onChange={(event) => setAntiPrint((current) => ({ ...current, blockContextMenu: event.target.checked }))} /> Bloquear clique direito</label>
          <label><input type="checkbox" checked={antiPrint.blockDrag !== false} onChange={(event) => setAntiPrint((current) => ({ ...current, blockDrag: event.target.checked }))} /> Bloquear arrastar imagem</label>
          <label><input type="checkbox" checked={antiPrint.shieldOnBlur !== false} onChange={(event) => setAntiPrint((current) => ({ ...current, shieldOnBlur: event.target.checked }))} /> Escudo ao perder foco</label>
          <label><input type="checkbox" checked={antiPrint.showSessionMeta !== false} onChange={(event) => setAntiPrint((current) => ({ ...current, showSessionMeta: event.target.checked }))} /> Mostrar etiqueta da foto</label>
        </div>

        <div className="securitySliderGrid">
          <label>Opacidade {antiPrint.opacity ?? 38}%<input type="range" min="8" max="75" value={antiPrint.opacity ?? 38} onChange={(event) => setAntiPrint((current) => ({ ...current, opacity: Number(event.target.value) }))} /></label>
          <label>Densidade {antiPrint.density ?? 24}<input type="range" min="8" max="48" value={antiPrint.density ?? 24} onChange={(event) => setAntiPrint((current) => ({ ...current, density: Number(event.target.value) }))} /></label>
          <label>Rotação {antiPrint.rotationDeg ?? -24}°<input type="range" min="-45" max="45" value={antiPrint.rotationDeg ?? -24} onChange={(event) => setAntiPrint((current) => ({ ...current, rotationDeg: Number(event.target.value) }))} /></label>
          <label>Ruído {antiPrint.noiseIntensity ?? 18}%<input type="range" min="0" max="50" value={antiPrint.noiseIntensity ?? 18} onChange={(event) => setAntiPrint((current) => ({ ...current, noiseIntensity: Number(event.target.value) }))} /></label>
          <label>Blur {antiPrint.previewBlur ?? 0}px<input type="range" min="0" max="4" value={antiPrint.previewBlur ?? 0} onChange={(event) => setAntiPrint((current) => ({ ...current, previewBlur: Number(event.target.value) }))} /></label>
          <label>Escudo inativo {antiPrint.shieldAfterInactivitySeconds ?? 0}s<input type="range" min="0" max="30" step="5" value={antiPrint.shieldAfterInactivitySeconds ?? 0} onChange={(event) => setAntiPrint((current) => ({ ...current, shieldAfterInactivitySeconds: Number(event.target.value) }))} /></label>
        </div>

        <div className="infoBox successBox">Dica de operação: use watermark forte nos previews e só entregue arquivos limpos pela Central de Entrega após pagamento confirmado. O cliente vê valor, não arquivo grátis — exatamente o jogo que queremos ganhar.</div>
      </section>


      <section className="panel syncPanel">
        <p className="eyebrow">Rede local</p>
        <h2>Multi-estação • v{APP_VERSION}</h2>
        <p className="mutedParagraph">Use uma estação principal como servidor local e outras estações como secundárias para puxar sessões, fotos, vendas, entregas e configurações pela mesma rede Wi‑Fi/cabeada.</p>

        <label className="toggleLine"><input type="checkbox" checked={multiStation.enabled} onChange={(event) => setMultiStation((current) => ({ ...current, enabled: event.target.checked }))} /> Ativar sincronização em rede local</label>

        <label>Modo desta máquina</label>
        <select value={multiStation.mode} onChange={(event) => setMultiStation((current) => ({ ...current, mode: event.target.value as 'PRIMARY' | 'SECONDARY' }))}>
          <option value="PRIMARY">Principal / servidor da operação</option>
          <option value="SECONDARY">Secundária / balcão adicional</option>
        </select>

        <label>Nome da estação</label>
        <input value={multiStation.stationName || ''} placeholder="Caixa 01, Captura 02..." onChange={(event) => setMultiStation((current) => ({ ...current, stationName: event.target.value }))} />
        <small className="fieldHint">Nome visível nos comprovantes, watermark e diagnóstico da estação.</small>

        <label>Token local de sincronização</label>
        <input value={multiStation.syncToken || ''} type="password" placeholder="use o mesmo token em todas as estações" onChange={(event) => setMultiStation((current) => ({ ...current, syncToken: event.target.value }))} />
        <small className="fieldHint">Senha local usada pelas secundárias para puxar snapshot e fotos da estação principal.</small>

        <label>URL da estação principal</label>
        <input value={multiStation.primaryUrl || ''} placeholder="http://192.168.0.10:3888" onChange={(event) => setMultiStation((current) => ({ ...current, primaryUrl: event.target.value }))} />
        <small className="fieldHint">Endereço da estação principal na rede local. Use o IP mostrado em Fotógrafo Web/Diagnóstico.</small>

        <label>Auto-pull na estação secundária</label>
        <select value={String(multiStation.autoPullSeconds || 0)} onChange={(event) => setMultiStation((current) => ({ ...current, autoPullSeconds: Number(event.target.value) }))}>
          <option value="0">Manual</option>
          <option value="30">A cada 30 segundos</option>
          <option value="60">A cada 1 minuto</option>
          <option value="120">A cada 2 minutos</option>
        </select>

        <div className="actionRow">
          <button className="ghostButton" type="button" onClick={refreshMultiStationInfo}>Ver status local</button>
          <button className="primaryButton" type="button" onClick={pullPrimaryNow}>Puxar da principal agora</button>
        </div>

        {multiStationInfo && (
          <div className="infoBox successBox">
            <strong>{multiStationInfo.stationName}</strong> • {multiStationInfo.mode === 'PRIMARY' ? 'Principal' : 'Secundária'} • {multiStationInfo.appVersion}<br />
            Sessões: {multiStationInfo.sessionCount ?? 0} • Fotos: {multiStationInfo.photoCount ?? 0} • Vendas: {multiStationInfo.saleCount ?? 0}<br />
            URL local: {multiStationInfo.localUrl || 'inativa'}<br />
            Rede: {(multiStationInfo.networkUrls || []).join(' • ') || 'nenhum IP detectado'}
          </div>
        )}
        <div className="infoBox">Regra segura da versão atual: configure uma estação como principal. As secundárias puxam o banco e baixam arquivos de foto da principal por token local. Evite editar configurações em duas máquinas ao mesmo tempo para não criar conflito operacional.</div>
      </section>

      <section className="panel cloudPanel">
        <p className="eyebrow">Storage cloud • v{APP_VERSION}</p>
        <h2>Fotos na nuvem, previews e downloads assinados</h2>
        <p className="mutedParagraph">A v4.2 separa preview público de arquivo final privado. Use local para testes, S3/R2 para produção e downloads assinados para entregar fotos sem expor o bucket inteiro.</p>
        <div className="licenseStatusGrid">
          <div className={`licenseStatusCard ${cloud.storage?.driver === 'local' ? 'warn' : 'ok'}`}>
            <span>Driver</span>
            <strong>{(cloud.storage?.driver || 'local').toUpperCase()}</strong>
            <small>{cloud.storage?.driver === 'local' ? 'Bom para teste/dev' : 'Pronto para produção cloud'}</small>
          </div>
          <div className="licenseStatusCard">
            <span>Objetos</span>
            <strong>{cloudStorageInfo?.storage?.objectCount ?? '—'}</strong>
            <small>{cloudStorageInfo?.storage?.byteSize ? `${Math.round((cloudStorageInfo.storage.byteSize || 0) / 1024 / 1024)} MB` : 'Verifique a API cloud'}</small>
          </div>
        </div>
        <label>Driver do storage</label>
        <select value={cloud.storage?.driver || 'local'} onChange={(event) => setCloud((current) => ({ ...current, storage: { ...defaultCloudStorage, ...(current.storage || {}), driver: event.target.value as 'local' | 's3' | 'r2' } }))}>
          <option value="local">Local / dev</option>
          <option value="s3">Amazon S3 compatível</option>
          <option value="r2">Cloudflare R2</option>
        </select>
        <label>Bucket</label>
        <input value={cloud.storage?.bucket || ''} placeholder="pictour-fotos-prod" onChange={(event) => setCloud((current) => ({ ...current, storage: { ...defaultCloudStorage, ...(current.storage || {}), bucket: event.target.value } }))} />
        <small className="fieldHint">Nome do bucket onde a cloud vai salvar previews e arquivos finais.</small>
        <label>Endpoint S3/R2</label>
        <input value={cloud.storage?.endpoint || ''} placeholder="https://<account>.r2.cloudflarestorage.com" onChange={(event) => setCloud((current) => ({ ...current, storage: { ...defaultCloudStorage, ...(current.storage || {}), endpoint: event.target.value } }))} />
        <small className="fieldHint">Endpoint S3/R2 compatível. No R2, use o endpoint da conta Cloudflare.</small>
        <label>Base pública de mídia</label>
        <input value={cloud.storage?.publicBaseUrl || ''} placeholder="https://cdn.seudominio.com/media" onChange={(event) => setCloud((current) => ({ ...current, storage: { ...defaultCloudStorage, ...(current.storage || {}), publicBaseUrl: event.target.value } }))} />
        <small className="fieldHint">URL pública/CDN para previews. Arquivos finais continuam privados e usam links assinados.</small>
        <label>Validade dos links assinados: {cloud.storage?.signedDownloadTtlSeconds || 900}s</label>
        <input type="range" min="300" max="86400" step="300" value={cloud.storage?.signedDownloadTtlSeconds || 900} onChange={(event) => setCloud((current) => ({ ...current, storage: { ...defaultCloudStorage, ...(current.storage || {}), signedDownloadTtlSeconds: Number(event.target.value) } }))} />
        <label className="toggleLine"><input type="checkbox" checked={cloud.storage?.keepOriginalsPrivate !== false} onChange={(event) => setCloud((current) => ({ ...current, storage: { ...defaultCloudStorage, ...(current.storage || {}), keepOriginalsPrivate: event.target.checked } }))} /> Manter originais privados e liberar apenas após venda</label>
        <div className="actionRow">
          <button className="ghostButton" type="button" onClick={checkCloudStorage}>Verificar storage cloud</button>
        </div>
        <div className="infoBox">{cloud.storage?.lastHealthMessage || cloudStorageInfo?.message || 'Configure as variáveis do backend cloud: STORAGE_DRIVER, S3_BUCKET/R2_BUCKET, S3_ENDPOINT/R2_ENDPOINT e credenciais. O Desktop salva a intenção; a cloud aplica as credenciais no servidor.'}</div>
      </section>

      <section className="panel cloudPanel">
        <p className="eyebrow">Backend / Cloud</p>
        <h2>Galeria pública fora do Wi‑Fi</h2>
        <label className="toggleLine"><input type="checkbox" checked={cloud.enabled} onChange={(event) => setCloud((current) => ({ ...current, enabled: event.target.checked }))} /> Ativar backend cloud quando publicado</label>
        <label>URL da API cloud</label>
        <input value={cloud.apiBaseUrl || ''} placeholder="https://api.seudominio.com" onChange={(event) => setCloud((current) => ({ ...current, apiBaseUrl: event.target.value }))} />
        <small className="fieldHint">URL base do backend cloud do PicTour, sem barra no final. Ex: https://api.pictour.com.br.</small>
        <label>Chave interna da API</label>
        <input value={cloud.apiKey || ''} placeholder="pictour_dev_secret" type="password" onChange={(event) => setCloud((current) => ({ ...current, apiKey: event.target.value }))} />
        <small className="fieldHint">Chave interna para publicar sessões, sincronizar vendas e validar licença. Deve bater com a variável da cloud.</small>
        <label>URL pública da galeria</label>
        <input value={cloud.publicGalleryBaseUrl || ''} placeholder="https://galeria.seudominio.com" onChange={(event) => setCloud((current) => ({ ...current, publicGalleryBaseUrl: event.target.value }))} />
        <small className="fieldHint">Domínio público usado nos QR Codes e links da Premium Gallery fora da rede local.</small>
        <div className="infoBox">A versão atual mantém a operação comercial com licença local, limites por plano e caminho para validação cloud.</div>
      </section>

      <section className="panel">
        <p className="eyebrow">Segurança</p>
        <h2>Trocar minha senha</h2>
        <p className="mutedParagraph">Use isso para trocar a senha do usuário logado sem mexer no cadastro completo de usuários.</p>
        <label>Senha atual</label>
        <input value={currentPassword} type="password" onChange={(event) => setCurrentPassword(event.target.value)} />
        <label>Nova senha</label>
        <input value={newPasswordValue} type="password" onChange={(event) => setNewPasswordValue(event.target.value)} />
        <label>Confirmar nova senha</label>
        <input value={confirmPasswordValue} type="password" onChange={(event) => setConfirmPasswordValue(event.target.value)} />
        <button className="ghostButton fullWidth" type="button" onClick={handleChangePassword}>Alterar senha</button>
      </section>

      <section className="panel">
        <p className="eyebrow">Dados locais</p>
        <h2>Backup, restauração e biblioteca</h2>
        <p className="mutedParagraph">Fotos importadas são copiadas para a biblioteca local do PicTour, e sessões/vendas ficam salvas em um arquivo de banco local.</p>
        <div className="actionColumn">
          <button className="primaryButton" type="button" onClick={onOpenDataFolder}>Abrir pasta de dados</button>
          <button className="ghostButton" type="button" onClick={onExportBackup}>Exportar backup</button>
          <button className="ghostButton" type="button" onClick={onRestoreBackup}>Restaurar backup</button>
        </div>

        <p className="eyebrow spacingTop">Moedas presenciais</p>
        <div className="checkboxList">
          {['BRL — Real', 'USD — Dólar', 'EUR — Euro', 'PYG — Guarani', 'ARS — Peso argentino'].map((currency) => (
            <label key={currency}><input type="checkbox" defaultChecked /> {currency}</label>
          ))}
        </div>
      </section>
    </div>
  );
}
