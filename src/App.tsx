import { useEffect, useMemo, useRef, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { CustomerDisplayView } from './components/CustomerDisplayView';
import { LoginScreen } from './components/LoginScreen';
import { Dashboard } from './screens/Dashboard';
import { OperationStatus } from './screens/OperationStatus';
import { CommercialReadiness } from './screens/CommercialReadiness';
import { DemoGuide } from './screens/DemoGuide';
import { SaaSControl } from './screens/SaaSControl';
import { Sessions } from './screens/Sessions';
import { Capture } from './screens/Capture';
import { ChromaStudio } from './screens/ChromaStudio';
import { QuickSale } from './screens/QuickSale';
import { PostTour } from './screens/PostTour';
import { FunnelBI } from './screens/FunnelBI';
import { PhotographerPortal } from './screens/PhotographerPortal';
import { Cashier } from './screens/Cashier';
import { Settings } from './screens/Settings';
import { Diagnostics } from './screens/Diagnostics';
import { AuditLogs } from './screens/AuditLogs';
import { packages as seedPackages, photos as seedPhotos, sessions as seedSessions, cashierSales as seedSales, cashShifts as seedCashShifts, cashMovements as seedCashMovements, onlineCheckouts as seedOnlineCheckouts, deliveryAccessLogs as seedDeliveryAccessLogs } from './lib/mockData';
import type {
  CurrencyCode,
  LocalDatabase,
  NavKey,
  PackageOption,
  Photo,
  RegisterManualSaleInput,
  SaveChromaRenderInput,
  ExportPurchasedPhotosInput,
  ThemeMode,
  UpdateSettingsInput,
  CreateMercadoPagoCheckoutInput,
  CreateMercadoPagoCheckoutResult,
  CheckMercadoPagoCheckoutInput,
  CheckMercadoPagoCheckoutResult,
  CloudPublishSessionInput,
  CloudPublishSessionResult,
  CloudSyncSalesInput,
  CloudSyncSalesResult,
  AuthUser,
  LoginResult,
  ChangePasswordResult,
  CashierSale,
  AuditLog,
  AppPermission,
  CashOperationResult,
  LicenseValidationInput,
  LicenseValidationResult,
  SetSessionStatusInput,
  MarkSaleDeliveredInput,
  SaleReceiptResult,
  AppUpdateInfo,
  CreateSaleDeliveryResult,
  MultiStationInfo,
  MultiStationSyncResult,
  AppSettings
} from './lib/types';
import { calculatePackageTotalCents, defaultExchangeRates, formatMoney } from './lib/money';
import { createDefaultLicense } from './lib/license';

function isCustomerDisplayRoute() {
  return window.location.hash.replace('#/', '') === 'customer-display';
}

const fallbackDatabase: LocalDatabase = {
  version: 462,
  migrationInfo: { schemaVersion: 463, lastMigratedAt: new Date().toISOString(), migrationLog: ['Banco demo v4.6.3.'] },
  settings: {
    companyName: 'Parque Aventura',
    locationName: 'Foz do Iguaçu',
    defaultPostTourDays: 7,
    locations: [{ id: 'location_default', name: 'Parque Aventura', active: true }],
    users: [{ id: 'user_admin_default', name: 'Administrador PicTour', username: 'admin', role: 'MANAGER', adminPermissions: true, active: true }],
    mercadoPago: {
      enabled: false,
      environment: 'sandbox',
      publicKey: '',
      accessToken: '',
      webhookUrl: '',
      successUrl: 'https://pictour.app/pagamento/aprovado',
      failureUrl: 'https://pictour.app/pagamento/recusado',
      pendingUrl: 'https://pictour.app/pagamento/pendente'
    },
    cloud: {
      enabled: false,
      apiBaseUrl: 'http://127.0.0.1:8787',
      apiKey: '',
      publicGalleryBaseUrl: 'http://127.0.0.1:8787'
    },
    saas: {
      tenantSlug: '',
      adminPanelUrl: 'http://127.0.0.1:8787/admin?token=SEU_TOKEN',
      billingStatus: 'TRIAL',
      billingCycle: 'MONTHLY',
      seatsPurchased: 5,
      deviceLimit: 1,
      requireOnlineLicense: false
    },
    subscription: {
      enabled: false,
      plan: 'PRO',
      status: 'TRIAL',
      billingCycle: 'MONTHLY',
      provider: 'MANUAL',
      monthlyPriceCents: 29900,
      yearlyPriceCents: 299000,
      graceDays: 5,
      autoSuspendPastDue: true
    },
    multiStation: {
      enabled: false,
      mode: 'PRIMARY',
      stationName: 'Estação principal',
      syncToken: 'pictour-local-sync',
      primaryUrl: 'http://127.0.0.1:3888',
      autoPullSeconds: 0
    },
    photographerPortal: {
      enabled: true,
      requireSessionAccessCode: true,
      maxFilesPerUpload: 12,
      defaultLabelPrefix: 'Fotógrafo externo',
      mobileMode: 'FULL_OPERATION',
      allowMobileSelection: true,
      allowMobileFavorite: true,
      showPurchasedOnMobile: true,
      enableUploadQueue: true
    },
    commercialSetup: {
      onboardingCompleted: false,
      completedStepIds: [],
      demoModeLoaded: true,
      demoLoadedAt: new Date().toISOString(),
      installMode: 'DEV'
    },
    antiPrint: {
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
    },
    commission: {
      mode: 'NONE',
      defaultRatePercent: 10,
      individualRates: {},
      collectiveUsernames: [],
      includeManagers: false
    },
    operationChecklist: { completedItemIds: [] },
    license: createDefaultLicense(),
    updateFeedUrl: 'http://127.0.0.1:8787/api/updates/latest',
    chromaAssets: [],
    quickScenarios: [
      { id: 'quick_default_cataratas', name: 'Cataratas cinematic', isDefault: true, isActive: true, sortOrder: 1 },
      { id: 'quick_default_selva', name: 'Selva premium', isDefault: true, isActive: true, sortOrder: 2 },
      { id: 'quick_default_barco', name: 'Barco pôr do sol', isDefault: true, isActive: true, sortOrder: 3 },
      { id: 'quick_default_inspector', name: 'Inspector profissional', isDefault: true, isActive: true, sortOrder: 4 }
    ]
  },
  sessions: seedSessions,
  photos: seedPhotos,
  cashierSales: seedSales.map((sale) => ({ saleStatus: 'ACTIVE' as const, ...sale })),
  cashShifts: seedCashShifts,
  cashMovements: seedCashMovements,
  auditLogs: [],
  onlineCheckouts: seedOnlineCheckouts,
  deliveryAccessLogs: seedDeliveryAccessLogs,
  publicGallery: {
    enabled: true,
    port: 3888,
    localUrl: 'http://127.0.0.1:3888',
    networkUrls: [],
    primaryUrl: 'http://127.0.0.1:3888'
  }
};

export default function App() {
  const [route, setRoute] = useState<NavKey>('dashboard');
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [theme, setTheme] = useState<ThemeMode>('dark');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [customerDisplayOpen, setCustomerDisplayOpen] = useState(false);
  const [database, setDatabase] = useState<LocalDatabase>(fallbackDatabase);
  const [selectedSessionCode, setSelectedSessionCode] = useState(seedSessions[0]?.code ?? 'PT-4821');
  const [selectedPackageId, setSelectedPackageId] = useState(seedPackages[0].id);
  const [focusedPhotoId, setFocusedPhotoId] = useState<string>('');
  const [customerDisplayMode, setCustomerDisplayMode] = useState<'SINGLE' | 'TRIPLE' | 'GRID'>('SINGLE');
  const [quickSaleMonitorPreview, setQuickSaleMonitorPreview] = useState<{ packageName: string; selectedCount: number; totalCents: number; currency: CurrencyCode; photoIds: string[]; focusedPhotoId?: string; customerMessage: string } | null>(null);
  const [syncMessage, setSyncMessage] = useState('Carregando banco local...');
  const autoLicenseCheckInKeyRef = useRef('');

  const openSessions = database.sessions.filter((session) => session.status !== 'CLOSED');
  const activeSession = openSessions.find((session) => session.code === selectedSessionCode) ?? openSessions[0] ?? null;
  const operationalSessionCode = activeSession?.code ?? '';
  const currentOpenCashShift = (database.cashShifts || []).find((shift) => shift.status === 'OPEN') || null;
  const configuredPackages = database.settings.packages?.length ? database.settings.packages : seedPackages;
  const activePackages = configuredPackages.filter((packageOption) => {
    if (packageOption.active === false) return false;
    if (!activeSession?.locationName || !packageOption.locationName) return true;
    return packageOption.locationName === activeSession.locationName;
  });
  const packageOptionsForSession = activePackages.length ? activePackages : configuredPackages.filter((packageOption) => packageOption.active !== false);
  const selectedPackage = packageOptionsForSession.find((packageOption) => packageOption.id === selectedPackageId) ?? packageOptionsForSession[0] ?? seedPackages[0];

  useEffect(() => {
    if (!openSessions.length) {
      if (selectedSessionCode) setSelectedSessionCode('');
      return;
    }

    const selectedStillOpen = openSessions.some((session) => session.code === selectedSessionCode);
    if (!selectedStillOpen) {
      const nextOpenSession = [...openSessions].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0] || openSessions[0];
      setSelectedSessionCode(nextOpenSession.code);
      const nextPhoto = database.photos.find((photo) => photo.sessionCode === nextOpenSession.code);
      setFocusedPhotoId(nextPhoto?.id ?? '');
    }
  }, [database.sessions, database.photos, selectedSessionCode, openSessions]);
  const photos = database.photos.filter((photo) => photo.sessionCode === activeSession?.code);
  const selectedPhotos = photos.filter((photo) => photo.selected && photo.status !== 'PURCHASED');
  const focusedPhoto = photos.find((photo) => photo.id === focusedPhotoId) ?? selectedPhotos[0] ?? photos[0];
  function hasPermission(permission: AppPermission) {
    if (!currentUser) return false;
    if (currentUser.role === 'MANAGER') return true;
    if (currentUser.adminPermissions) return true;
    return Boolean(currentUser.permissions?.[permission]);
  }

  const canAccessSettings = hasPermission('SETTINGS');
  const canAccessDiagnostics = hasPermission('SETTINGS');
  const canAccessAudit = hasPermission('AUDIT_LOG') || hasPermission('REPORTS');
  const canAccessCashier = hasPermission('CASHIER');
  const canControlCash = hasPermission('CASH_CONTROL');
  const canCancelSale = hasPermission('CANCEL_SALE');
  const canExportReports = hasPermission('REPORTS');
  const visibleNavKeys = new Set<NavKey>([
    ...(hasPermission('DASHBOARD') ? ['dashboard' as NavKey] : []),
    ...(hasPermission('OPERATION_STATUS') ? ['operation' as NavKey] : []),
    ...(hasPermission('SETTINGS') ? ['readiness' as NavKey, 'demo-guide' as NavKey] : []),
    ...(hasPermission('SETTINGS') || hasPermission('SAAS_ADMIN') ? ['saas' as NavKey] : []),
    ...(hasPermission('SESSIONS') ? ['sessions' as NavKey] : []),
    ...(hasPermission('CAPTURE') ? ['capture' as NavKey] : []),
    ...(hasPermission('CHROMA') ? ['chroma' as NavKey] : []),
    ...(hasPermission('QUICK_SALE') ? ['quick-sale' as NavKey] : []),
    ...(hasPermission('POST_TOUR') ? ['post-tour' as NavKey] : []),
    ...(hasPermission('REPORTS') ? ['reports' as NavKey] : []),
    ...(hasPermission('PHOTOGRAPHER_PORTAL') ? ['photographer' as NavKey] : []),
    ...(canAccessCashier ? ['cashier' as NavKey] : []),
    ...(canAccessAudit ? ['audit' as NavKey] : []),
    ...(canAccessDiagnostics ? ['diagnostics' as NavKey] : []),
    ...(canAccessSettings ? ['settings' as NavKey] : [])
  ]);


  const customerSnapshot = useMemo<CustomerDisplaySnapshot>(() => {
    const companyName = database.settings.companyName || 'PicTour';
    const sessionCode = activeSession?.code ?? 'SEM-SESSÃO';
    const modularPhotoIds = new Set(quickSaleMonitorPreview?.photoIds || []);
    const modularPhotos = modularPhotoIds.size ? photos.filter((photo) => modularPhotoIds.has(photo.id)) : [];
    const displayPhotoPool = modularPhotos.length ? modularPhotos : photos;
    const displayFocused = photos.find((photo) => photo.id === quickSaleMonitorPreview?.focusedPhotoId) || focusedPhoto;
    const fallbackTotal = calculatePackageTotalCents(selectedPackage, selectedPhotos.length);

    return {
      companyName,
      sessionCode,
      packageName: quickSaleMonitorPreview?.packageName || selectedPackage.name,
      selectedCount: quickSaleMonitorPreview?.selectedCount ?? selectedPhotos.length,
      totalCents: quickSaleMonitorPreview?.totalCents ?? fallbackTotal,
      currency: quickSaleMonitorPreview?.currency || selectedPackage.currency,
      customerMessage: quickSaleMonitorPreview?.customerMessage || (selectedPhotos.length > 0
        ? `Você selecionou ${selectedPhotos.length} foto(s). Total: ${formatMoney(fallbackTotal, selectedPackage.currency as CurrencyCode)}.`
        : 'Escolha suas fotos favoritas com o vendedor.'),
      photoCode: displayFocused?.code,
      photoLabel: displayFocused?.label,
      photoPreviewUrl: displayFocused?.previewUrl,
      displayMode: customerDisplayMode,
      photos: displayPhotoPool.map((photo) => ({ id: photo.id, code: photo.code, label: photo.label, previewUrl: photo.previewUrl, selected: modularPhotoIds.size ? modularPhotoIds.has(photo.id) : photo.selected, status: photo.status })),
      focusedPhotoId: displayFocused?.id,
      watermarkText: `${companyName.toUpperCase()} • ${sessionCode} • ${displayFocused?.code ?? 'F01'} • PREVIEW`,
      qrLabel: 'Comprar depois por QR Code'
    };
  }, [activeSession?.code, database.settings.companyName, focusedPhoto, selectedPackage, selectedPhotos.length, photos, customerDisplayMode, quickSaleMonitorPreview]);

  useEffect(() => {
    if (packageOptionsForSession.length && !packageOptionsForSession.some((packageOption) => packageOption.id === selectedPackageId)) {
      setSelectedPackageId(packageOptionsForSession[0].id);
    }
  }, [packageOptionsForSession, selectedPackageId]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        if (!window.pictourDesktop?.loadAppData) {
          setSyncMessage('Rodando no navegador: dados de demonstração. Use npm run dev para persistência local.');
          return;
        }

        const loadedDatabase = await window.pictourDesktop.loadAppData();
        if (!active) return;
        setDatabase(loadedDatabase);
        setSelectedSessionCode((loadedDatabase.sessions || []).find((session) => session.status !== 'CLOSED')?.code ?? '');
        setSyncMessage('Banco local carregado. Importações e vendas ficam salvas neste computador.');
      } catch (error) {
        console.error(error);
        setSyncMessage('Não consegui carregar o banco local. Mantive os dados de demonstração.');
      }
    }

    load();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const unsubscribe = window.pictourDesktop?.onDatabaseChanged?.((nextDatabase) => {
      setDatabase(nextDatabase);
      setSyncMessage('Banco local atualizado pela galeria pública/local.');
    });

    return () => {
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (currentUser && !visibleNavKeys.has(route)) {
      const firstRoute = Array.from(visibleNavKeys)[0] || 'dashboard';
      setRoute(firstRoute);
    }
  }, [currentUser, route, visibleNavKeys]);


  useEffect(() => {
    if (!currentUser || !window.pictourDesktop?.validateLicenseWithServer) return;
    const license = database.settings.license;
    const companyId = String(license?.companyId || '').trim();
    const licenseKey = String(license?.licenseKey || '').trim();
    const licenseServerUrl = String(license?.licenseServerUrl || database.settings.cloud?.apiBaseUrl || '').trim();
    if (!companyId || !licenseKey || !licenseServerUrl) return;

    const today = new Date().toISOString().slice(0, 10);
    const checkInKey = `${companyId}:${licenseKey}:${today}`;
    if (autoLicenseCheckInKeyRef.current === checkInKey) return;
    autoLicenseCheckInKeyRef.current = checkInKey;

    validateLicenseWithServer({
      companyId,
      licenseKey,
      licenseServerUrl,
      actorUsername: currentUser.username,
      silentCheckIn: true
    }).catch((error) => {
      console.warn('Check-in automático da licença falhou:', error);
    });
  }, [currentUser, database.settings.license?.companyId, database.settings.license?.licenseKey, database.settings.license?.licenseServerUrl, database.settings.cloud?.apiBaseUrl]);

  useEffect(() => {
    const unsubscribe = window.pictourDesktop?.onCustomerDisplayClosed?.(() => {
      setCustomerDisplayOpen(false);
      setSyncMessage('Monitor do cliente fechado.');
    });

    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    if (!customerDisplayOpen) return;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const snapshot = await buildCustomerSnapshotForDisplay();
      if (!cancelled) await window.pictourDesktop?.updateCustomerDisplay(snapshot);
    }, 80);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [customerDisplayOpen, customerSnapshot, focusedPhoto?.id]);

  useEffect(() => {
    if (!photos.length) {
      if (focusedPhotoId) setFocusedPhotoId('');
      return;
    }

    if (!photos.some((photo) => photo.id === focusedPhotoId)) {
      setFocusedPhotoId(photos[0].id);
    }
  }, [photos, focusedPhotoId]);

  async function handleLogin(username: string, password: string): Promise<LoginResult> {
    if (window.pictourDesktop?.authenticateUser) {
      const result = await window.pictourDesktop.authenticateUser({ username, password });
      if (result.database) setDatabase(result.database);
      return result;
    }

    if (username === 'admin' && password === 'admin12345') {
      return {
        ok: true,
        message: 'Login demo aprovado.',
        user: { id: 'user_admin_default', name: 'Administrador PicTour', username: 'admin', role: 'MANAGER', adminPermissions: true, active: true }
      };
    }

    return { ok: false, message: 'Login demo inválido.' };
  }


  async function changePassword(username: string, currentPassword: string, newPassword: string): Promise<ChangePasswordResult> {
    if (window.pictourDesktop?.changePassword) {
      const result = await window.pictourDesktop.changePassword({ username, currentPassword, newPassword });
      if (result.database) setDatabase(result.database);
      return result;
    }

    if (username === 'admin' && currentPassword === 'admin12345' && newPassword.length >= 8) {
      return {
        ok: true,
        message: 'Senha demo alterada nesta sessão.',
        user: { id: 'user_admin_default', name: 'Administrador PicTour', username: 'admin', role: 'MANAGER', adminPermissions: true, active: true }
      };
    }

    return { ok: false, message: 'Troca de senha persistente funciona no Electron.' };
  }

  async function buildCustomerSnapshotForDisplay(): Promise<CustomerDisplaySnapshot> {
    const snapshot = { ...customerSnapshot };
    if (window.pictourDesktop?.readPhotoDataUrl) {
      try {
        const snapshotPhotoIds = new Set((snapshot.photos || []).map((photo) => photo.id).filter(Boolean));
        const sourcePhotos = snapshotPhotoIds.size ? photos.filter((photo) => snapshotPhotoIds.has(photo.id)) : photos;
        const focusedFromSnapshot = sourcePhotos.find((photo) => photo.id === snapshot.focusedPhotoId) || focusedPhoto;
        const visiblePhotos = snapshot.displayMode === 'GRID' ? sourcePhotos.slice(0, 60) : snapshot.displayMode === 'TRIPLE' ? sourcePhotos.slice(0, 3) : (focusedFromSnapshot ? [focusedFromSnapshot] : []);
        const withDataUrls = await Promise.all(visiblePhotos.map(async (photo) => {
          try {
            const result = await window.pictourDesktop?.readPhotoDataUrl(photo.id);
            return { id: photo.id, code: photo.code, label: photo.label, selected: photo.selected, status: photo.status, previewUrl: result?.dataUrl || photo.previewUrl };
          } catch {
            return { id: photo.id, code: photo.code, label: photo.label, selected: photo.selected, status: photo.status, previewUrl: photo.previewUrl };
          }
        }));
        snapshot.photos = withDataUrls;
        if (withDataUrls[0]) snapshot.photoPreviewUrl = withDataUrls[0].previewUrl;
      } catch {
        snapshot.photoPreviewUrl = focusedPhoto?.previewUrl;
      }
    }
    return snapshot;
  }

  function handleSessionChange(sessionCode: string) {
    setQuickSaleMonitorPreview(null);
    setSelectedSessionCode(sessionCode);
    const nextPhoto = database.photos.find((photo) => photo.sessionCode === sessionCode);
    setFocusedPhotoId(nextPhoto?.id ?? '');
  }

  function focusPhoto(photoId: string) {
    setFocusedPhotoId(photoId);
  }

  async function togglePhoto(photoId: string) {
    if (window.pictourDesktop?.togglePhotoSelected) {
      const nextDatabase = await window.pictourDesktop.togglePhotoSelected(photoId);
      setDatabase(nextDatabase);
      return;
    }

    setDatabase((current) => ({
      ...current,
      photos: current.photos.map((photo) => (
        photo.id === photoId ? { ...photo, selected: !photo.selected } : photo
      ))
    }));
  }


  async function toggleFavorite(photoId: string) {
    if (window.pictourDesktop?.togglePhotoFavorite) {
      const nextDatabase = await window.pictourDesktop.togglePhotoFavorite(photoId);
      setDatabase(nextDatabase);
      return;
    }

    setDatabase((current) => ({
      ...current,
      photos: current.photos.map((photo) => (
        photo.id === photoId ? { ...photo, favorite: !photo.favorite } : photo
      ))
    }));
  }

  async function setPhotoSelection(photoIds: string[], selected: boolean) {
    if (window.pictourDesktop?.setPhotoSelection) {
      const nextDatabase = await window.pictourDesktop.setPhotoSelection({ photoIds, selected });
      setDatabase(nextDatabase);
      return;
    }

    const idSet = new Set(photoIds);
    setDatabase((current) => ({
      ...current,
      photos: current.photos.map((photo) => (
        idSet.has(photo.id) && photo.status !== 'PURCHASED' ? { ...photo, selected } : photo
      ))
    }));
  }

  async function createSession(customerName: string, locationName: string) {
    if (window.pictourDesktop?.createSession) {
      const previousCodes = new Set(database.sessions.map((session) => session.code));
      const nextDatabase = await window.pictourDesktop.createSession({ customerName, locationName, postTourEnabled: true });
      setDatabase(nextDatabase);

      const createdSession = nextDatabase.sessions.find((session) => !previousCodes.has(session.code) && session.status !== 'CLOSED')
        ?? [...nextDatabase.sessions].filter((session) => session.status !== 'CLOSED').sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0];

      if (createdSession) {
        setSelectedSessionCode(createdSession.code);
        setFocusedPhotoId('');
      }
      return;
    }
  }

  async function setSessionStatus(input: SetSessionStatusInput) {
    if (window.pictourDesktop?.setSessionStatus) {
      const nextDatabase = await window.pictourDesktop.setSessionStatus({
        ...input,
        actorName: currentUser?.name,
        actorUsername: currentUser?.username
      });
      setDatabase(nextDatabase);
      if (input.status === 'CLOSED' && selectedSessionCode === input.sessionCode) {
        const nextOpen = nextDatabase.sessions.find((session) => session.status !== 'CLOSED');
        setSelectedSessionCode(nextOpen?.code ?? '');
      }
      setSyncMessage(input.status === 'CLOSED' ? `Sessão ${input.sessionCode} encerrada.` : `Sessão ${input.sessionCode} reaberta.`);
      return;
    }
  }

  async function importPhotos(mode: 'files' | 'folder') {
    if (!activeSession) return;

    if (!window.pictourDesktop?.importPhotos) {
      alert('Importação real só funciona no Electron. Rode com npm run dev.');
      return;
    }

    const result = mode === 'folder'
      ? await window.pictourDesktop.importPhotoFolder({ sessionCode: activeSession.code })
      : await window.pictourDesktop.importPhotos({ sessionCode: activeSession.code });

    setDatabase(result.database);
    setSyncMessage(result.canceled
      ? 'Importação cancelada.'
      : `${result.importedCount} foto(s) importada(s) para a sessão ${activeSession.code}.`);
  }


  async function saveCameraCapture(dataUrl: string) {
    if (!activeSession) return;

    if (!window.pictourDesktop?.saveCameraCapture) {
      alert('Captura persistente funciona no Electron. Rode com npm run dev.');
      return;
    }

    const result = await window.pictourDesktop.saveCameraCapture({
      sessionCode: activeSession.code,
      dataUrl,
      label: `Captura ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
    });

    setDatabase(result.database);
    setSyncMessage(`Foto ${result.photoCode} capturada e salva na sessão ${activeSession.code}.`);
  }


  async function saveChromaRender(input: SaveChromaRenderInput) {
    if (window.pictourDesktop?.saveChromaRender) {
      const result = await window.pictourDesktop.saveChromaRender(input);
      setDatabase(result.database);
      setSyncMessage(`Chroma ${result.photoCode} renderizado e salvo na sessão ${input.sessionCode}.`);
      return;
    }

    alert('Render persistente do Chroma Studio funciona no Electron. Rode com npm run dev.');
  }

  async function registerManualSale(input: RegisterManualSaleInput) {
    if (window.pictourDesktop?.registerManualSale) {
      const nextDatabase = await window.pictourDesktop.registerManualSale(input);
      setDatabase(nextDatabase);
      setSyncMessage(input.channel === 'POST_TOUR' ? 'Compra pós-passeio aprovada e fotos liberadas.' : 'Venda registrada e fotos selecionadas marcadas como compradas.');
      return;
    }

    alert('Registro persistente de venda funciona no Electron. Rode com npm run dev.');
  }

  async function exportPurchasedPhotos(input: ExportPurchasedPhotosInput) {
    if (!window.pictourDesktop?.exportPurchasedPhotos) {
      alert('Exportação de fotos compradas funciona no Electron. Rode com npm run dev.');
      return;
    }

    const result = await window.pictourDesktop.exportPurchasedPhotos(input);

    if (result.canceled) {
      setSyncMessage('Exportação cancelada.');
      return;
    }

    if (!result.exportedCount) {
      setSyncMessage('Nenhuma foto comprada disponível para exportar nesta sessão.');
      return;
    }

    setSyncMessage(`${result.exportedCount} foto(s) comprada(s) exportada(s) para entrega.`);
  }


  async function updateSettings(input: UpdateSettingsInput) {
    if (window.pictourDesktop?.updateSettings) {
      const nextDatabase = await window.pictourDesktop.updateSettings({ ...input, actorUsername: currentUser?.username });
      setDatabase(nextDatabase);
      setSyncMessage('Configurações atualizadas no banco local.');
      return;
    }

    setDatabase((current) => ({
      ...current,
      settings: {
        ...current.settings,
        ...input,
        mercadoPago: {
          enabled: false,
          environment: 'sandbox',
          publicKey: '',
          accessToken: '',
          webhookUrl: '',
          webhookSecret: '',
          autoReleaseDelivery: true,
          successUrl: 'https://pictour.app/pagamento/aprovado',
          failureUrl: 'https://pictour.app/pagamento/recusado',
          pendingUrl: 'https://pictour.app/pagamento/pendente',
          ...(current.settings.mercadoPago || {}),
          ...(input.mercadoPago || {})
        },
        cloud: {
          enabled: false,
          apiBaseUrl: 'http://127.0.0.1:8787',
          apiKey: '',
          publicGalleryBaseUrl: 'http://127.0.0.1:8787',
          ...(current.settings.cloud || {}),
          ...(input.cloud || {})
        },
        commercialSetup: {
      onboardingCompleted: false,
      completedStepIds: [],
      demoModeLoaded: true,
      demoLoadedAt: new Date().toISOString(),
      installMode: 'DEV'
    },
    antiPrint: {
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
          showSessionMeta: true,
          ...(current.settings.antiPrint || {}),
          ...(input.antiPrint || {})
        }
      }
    }));
  }

  async function createMercadoPagoCheckout(input: CreateMercadoPagoCheckoutInput): Promise<CreateMercadoPagoCheckoutResult> {
    if (!window.pictourDesktop?.createMercadoPagoCheckout) {
      return { ok: false, message: 'Checkout real do Mercado Pago funciona no Electron. Rode com npm run dev.', database };
    }

    const result = await window.pictourDesktop.createMercadoPagoCheckout(input);
    setDatabase(result.database);
    setSyncMessage(result.message);
    return result;
  }

  async function checkMercadoPagoCheckout(input: CheckMercadoPagoCheckoutInput): Promise<CheckMercadoPagoCheckoutResult> {
    if (!window.pictourDesktop?.checkMercadoPagoCheckout) {
      return { ok: false, status: 'UNKNOWN', message: 'Consulta real do Mercado Pago funciona no Electron. Rode com npm run dev.', database };
    }

    const result = await window.pictourDesktop.checkMercadoPagoCheckout(input);
    setDatabase(result.database);
    setSyncMessage(result.message);
    return result;
  }

  async function openExternalUrl(url: string) {
    if (window.pictourDesktop?.openExternalUrl) {
      await window.pictourDesktop.openExternalUrl(url);
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function openPublicGallery(sessionCode: string) {
    if (!window.pictourDesktop?.openPublicGallery) {
      const session = database.sessions.find((item) => item.code === sessionCode);
      if (session?.localGalleryUrl) window.open(`${session.localGalleryUrl}?code=${encodeURIComponent(session.accessCode || '')}`, '_blank');
      return;
    }

    const result = await window.pictourDesktop.openPublicGallery({ sessionCode });
    setSyncMessage(`Galeria local aberta: ${result.url}`);
  }

  async function publishSessionToCloud(input: CloudPublishSessionInput): Promise<CloudPublishSessionResult> {
    if (!window.pictourDesktop?.publishSessionToCloud) {
      return { ok: false, message: 'Publicação cloud funciona no Electron. Rode com npm run dev.', database };
    }

    const result = await window.pictourDesktop.publishSessionToCloud(input);
    setDatabase(result.database);
    setSyncMessage(result.message);
    return result;
  }


  async function syncCloudSales(input: CloudSyncSalesInput = {}): Promise<CloudSyncSalesResult> {
    if (!window.pictourDesktop?.syncCloudSales) {
      return { ok: false, message: 'Sincronização de vendas cloud funciona no Electron. Rode com npm run dev.', importedSales: 0, updatedPhotos: 0, matchedSessions: 0, database };
    }

    const result = await window.pictourDesktop.syncCloudSales(input);
    setDatabase(result.database);
    setSyncMessage(result.message);
    return result;
  }



  async function getMultiStationInfo(): Promise<MultiStationInfo | null> {
    if (!window.pictourDesktop?.getMultiStationInfo) return null;
    return window.pictourDesktop.getMultiStationInfo();
  }

  async function pullFromPrimaryStation(): Promise<MultiStationSyncResult> {
    if (!window.pictourDesktop?.pullFromPrimaryStation) {
      return { ok: false, message: 'Sincronização multi-estação funciona no Electron. Rode com npm run dev.', database };
    }
    const result = await window.pictourDesktop.pullFromPrimaryStation({ actorUsername: currentUser?.username });
    if (result.database) setDatabase(result.database);
    setSyncMessage(result.message);
    return result;
  }

  async function validateLicenseWithServer(input: LicenseValidationInput = {}): Promise<LicenseValidationResult> {
    if (!window.pictourDesktop?.validateLicenseWithServer) {
      return { ok: false, message: 'Validação de licença no servidor funciona no Electron. Rode com npm run dev.', database };
    }

    const result = await window.pictourDesktop.validateLicenseWithServer({ ...input, actorUsername: input.actorUsername || currentUser?.username });
    setDatabase(result.database);
    if (!input.silentCheckIn) setSyncMessage(result.message);
    return result;
  }

  async function openDataFolder() {
    await window.pictourDesktop?.openDataFolder?.();
  }


  async function exportBackup() {
    const result = await window.pictourDesktop?.exportBackup?.();
    if (result?.message) setSyncMessage(result.message);
  }

  async function restoreBackup() {
    const result = await window.pictourDesktop?.restoreBackup?.();
    if (result?.database) setDatabase(result.database);
    if (result?.message) setSyncMessage(result.message);
  }

  async function loadDemoData() {
    if (window.pictourDesktop?.loadDemoData) {
      const result = await window.pictourDesktop.loadDemoData({ actorUsername: currentUser?.username });
      if (result.database) setDatabase(result.database);
      setSyncMessage(result.message);
      return;
    }

    setDatabase((current) => ({
      ...fallbackDatabase,
      settings: {
        ...fallbackDatabase.settings,
        companyName: current.settings.companyName || fallbackDatabase.settings.companyName,
        commercialSetup: {
          ...(current.settings.commercialSetup || {}),
          demoModeLoaded: true,
          demoLoadedAt: new Date().toISOString(),
          completedStepIds: ['COMPANY', 'LOCATIONS', 'PACKAGES', 'SECURITY', 'DEMO_DONE']
        }
      }
    }));
    setSyncMessage('Demo carregado no navegador. No Electron, os dados ficam persistidos no banco local.');
  }

  async function exportAuditLogsCsv(logs: AuditLog[]) {
    const result = await window.pictourDesktop?.exportAuditLogsCsv?.({
      logs,
      actorName: currentUser?.name,
      actorUsername: currentUser?.username
    });
    if (result?.message) setSyncMessage(result.message);
  }

  async function exportCashierCsv(sales: CashierSale[]) {
    const result = await window.pictourDesktop?.exportCashierCsv?.({ sales, operator: currentUser?.name, actorUsername: currentUser?.username });
    if (result?.message) setSyncMessage(result.message);
  }

  async function createCashCloseReport(sales: CashierSale[], filters: Record<string, string>) {
    const result = await window.pictourDesktop?.createCashCloseReport?.({ sales, operator: currentUser?.name, filters });
    if (result?.message) setSyncMessage(result.message);
  }

  async function exportCashHistory(format: 'TXT' | 'CSV') {
    const result = await window.pictourDesktop?.exportCashHistory?.({ format, days: 30, operator: currentUser?.name, actorUsername: currentUser?.username });
    if (result?.message) setSyncMessage(result.message);
  }

  async function openCashShift(openingAmountCents: number, note?: string): Promise<CashOperationResult | void> {
    if (!window.pictourDesktop?.openCashShift) return;
    const result = await window.pictourDesktop.openCashShift({ operatorName: currentUser?.name || 'Operador', openingAmountCents, note });
    setDatabase(result.database);
    setSyncMessage(result.message);
    return result;
  }

  async function registerCashWithdrawal(amountCents: number, reason?: string): Promise<CashOperationResult | void> {
    if (!window.pictourDesktop?.registerCashWithdrawal) return;
    const result = await window.pictourDesktop.registerCashWithdrawal({ operatorName: currentUser?.name || 'Operador', amountCents, reason });
    setDatabase(result.database);
    setSyncMessage(result.message);
    return result;
  }

  async function closeCashShift(closingAmountCents: number, note?: string, closingChangeFundCents?: number, shiftChange?: boolean): Promise<CashOperationResult | void> {
    if (!window.pictourDesktop?.closeCashShift) return;
    const result = await window.pictourDesktop.closeCashShift({ operatorName: currentUser?.name || 'Operador', closingAmountCents, closingChangeFundCents, note, shiftChange });
    setDatabase(result.database);
    setSyncMessage(result.message);
    return result;
  }

  async function cancelSale(saleId: string, reason: string): Promise<CashOperationResult | void> {
    if (!window.pictourDesktop?.cancelSale) return;
    const result = await window.pictourDesktop.cancelSale({ saleId, operatorName: currentUser?.name || 'Operador', reason });
    setDatabase(result.database);
    setSyncMessage(result.message);
    return result;
  }


  async function markSaleDelivered(input: MarkSaleDeliveredInput) {
    if (!window.pictourDesktop?.markSaleDelivered) return;
    const nextDatabase = await window.pictourDesktop.markSaleDelivered({
      ...input,
      operatorName: currentUser?.name || 'Operador',
      actorUsername: currentUser?.username
    });
    setDatabase(nextDatabase);
    setSyncMessage('Venda marcada como entregue.');
  }

  async function exportSaleReceipt(saleId: string): Promise<SaleReceiptResult | void> {
    const result = await window.pictourDesktop?.exportSaleReceipt?.({ saleId, operatorName: currentUser?.name || 'Operador', actorUsername: currentUser?.username });
    if (result?.database) setDatabase(result.database);
    if (result?.message) setSyncMessage(result.message);
    return result;
  }


  async function createSaleDelivery(saleId: string): Promise<CreateSaleDeliveryResult | void> {
    const result = await window.pictourDesktop?.createSaleDelivery?.({
      saleId,
      expiresInDays: 7,
      operatorName: currentUser?.name || 'Operador',
      actorUsername: currentUser?.username
    });
    if (result?.database) setDatabase(result.database);
    if (result?.message) setSyncMessage(result.message);
    return result;
  }

  async function openSaleDelivery(saleId: string) {
    const result = await window.pictourDesktop?.openSaleDelivery?.({ saleId });
    if (result?.message) setSyncMessage(result.message);
    const nextDatabase = await window.pictourDesktop?.loadAppData?.();
    if (nextDatabase) setDatabase(nextDatabase);
    return result;
  }

  async function exportSalePhotos(saleId: string): Promise<SaleReceiptResult | void> {
    const result = await window.pictourDesktop?.exportSalePhotos?.({ saleId, operatorName: currentUser?.name || 'Operador', actorUsername: currentUser?.username });
    if (result?.database) setDatabase(result.database);
    if (result?.message) setSyncMessage(result.message);
    return result;
  }

  async function checkForUpdates(): Promise<AppUpdateInfo | void> {
    const result = await window.pictourDesktop?.checkForUpdates?.();
    if (result?.message) setSyncMessage(result.message);
    const nextDatabase = await window.pictourDesktop?.loadAppData?.();
    if (nextDatabase) setDatabase(nextDatabase);
    return result;
  }

  async function openPhotographerPortal() {
    if (!window.pictourDesktop?.openPhotographerPortal) {
      alert('O portal do fotógrafo abre dentro do Electron. Rode com npm run dev.');
      return;
    }

    const result = await window.pictourDesktop.openPhotographerPortal();
    setSyncMessage(result.message || 'Portal do fotógrafo aberto.');
  }

  async function openCustomerDisplay() {
    if (!window.pictourDesktop) {
      alert('O monitor do cliente abre dentro do Electron. Rode com npm run dev.');
      return;
    }

    const snapshot = await buildCustomerSnapshotForDisplay();
    await window.pictourDesktop.openCustomerDisplay(snapshot);
    setCustomerDisplayOpen(true);
    setSyncMessage('Monitor do cliente aberto. A partir de agora, foto, pacote e total sincronizam automaticamente.');

    window.setTimeout(async () => {
      await window.pictourDesktop?.updateCustomerDisplay(await buildCustomerSnapshotForDisplay());
    }, 220);
  }

  async function closeCustomerDisplay() {
    const result = await window.pictourDesktop?.closeCustomerDisplay?.();
    setCustomerDisplayOpen(false);
    setSyncMessage(result?.closed ? 'Monitor do cliente fechado.' : 'Nenhum monitor do cliente estava aberto.');
  }

  if (isCustomerDisplayRoute()) {
    return <CustomerDisplayView />;
  }

  if (!currentUser) {
    return <LoginScreen onLogin={handleLogin} onChangePassword={changePassword} onLoggedIn={setCurrentUser} />;
  }

  return (
    <div className={`appShell ${sidebarCollapsed ? 'sidebarCollapsed' : ''}`}>
      {sidebarCollapsed && (
        <button
          className="sidebarRevealButton"
          type="button"
          title="Mostrar menu lateral"
          aria-label="Mostrar menu lateral"
          onClick={() => setSidebarCollapsed(false)}
        >
          ☰
        </button>
      )}
      <Sidebar
        active={route}
        canAccessSettings={canAccessSettings}
        visibleNavKeys={visibleNavKeys}
        companyName={database.settings.companyName}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((current) => !current)}
        onChange={setRoute}
      />
      <main className="mainShell">
        <Topbar route={route} theme={theme} currentUser={currentUser} onToggleTheme={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')} onLogout={() => setCurrentUser(null)} />

        {route === 'dashboard' && <Dashboard sessions={database.sessions} photos={database.photos} cashierSales={database.cashierSales} syncMessage={syncMessage} />}
        {route === 'readiness' && (
          <CommercialReadiness
            database={database}
            onNavigate={setRoute}
            onOpenDataFolder={openDataFolder}
            onExportBackup={exportBackup}
            onRestoreBackup={restoreBackup}
            onCheckForUpdates={checkForUpdates}
            onUpdateSettings={updateSettings}
            onLoadDemoData={loadDemoData}
          />
        )}
        {route === 'demo-guide' && (
          <DemoGuide
            database={database}
            selectedSessionCode={selectedSessionCode}
            customerDisplayOpen={customerDisplayOpen}
            onNavigate={setRoute}
            onLoadDemoData={loadDemoData}
            onOpenCustomerDisplay={openCustomerDisplay}
            onCloseCustomerDisplay={closeCustomerDisplay}
            onOpenPhotographerPortal={openPhotographerPortal}
            onOpenPublicGallery={openPublicGallery}
          />
        )}
        {route === 'saas' && (
          <SaaSControl
            database={database}
            onValidateLicense={validateLicenseWithServer}
            onUpdateSettings={updateSettings}
            onOpenUrl={openExternalUrl}
          />
        )}
        {route === 'operation' && currentUser && (
          <OperationStatus
            database={database}
            currentUser={currentUser}
            selectedSessionCode={operationalSessionCode}
            customerDisplayOpen={customerDisplayOpen}
            syncMessage={syncMessage}
            onNavigate={setRoute}
            onOpenCustomerDisplay={openCustomerDisplay}
            onCloseCustomerDisplay={closeCustomerDisplay}
            onUpdateSettings={updateSettings}
          />
        )}
        {route === 'sessions' && (
          <Sessions
            sessions={database.sessions}
            locations={database.settings.locations || []}
            selectedSessionCode={selectedSessionCode}
            onSelectSession={handleSessionChange}
            onCreateSession={createSession}
            onSetSessionStatus={setSessionStatus}
          />
        )}
        {route === 'capture' && (
          <Capture
            sessions={openSessions}
            selectedSessionCode={selectedSessionCode}
            quickScenarios={database.settings.quickScenarios || []}
            onSelectSession={handleSessionChange}
            onImportFiles={() => importPhotos('files')}
            onImportFolder={() => importPhotos('folder')}
            onCameraCapture={saveCameraCapture}
            syncMessage={syncMessage}
          />
        )}
        {route === 'chroma' && (
          <ChromaStudio
            sessions={openSessions}
            selectedSessionCode={selectedSessionCode}
            photos={photos}
            allowAiBackgroundRemoval={Boolean(database.settings.license?.features?.aiBackgroundRemoval)}
            chromaAssets={database.settings.chromaAssets || []}
            companyName={database.settings.companyName}
            currentLocationName={activeSession?.locationName || database.settings.locationName}
            onSessionChange={handleSessionChange}
            onSaveChromaRender={saveChromaRender}
          />
        )}
        {route === 'quick-sale' && (
          <QuickSale
            sessions={openSessions}
            selectedSessionCode={selectedSessionCode}
            photos={photos}
            selectedPackage={selectedPackage as PackageOption}
            packageOptions={packageOptionsForSession}
            exchangeRates={database.settings.exchangeRates || defaultExchangeRates}
            onSessionChange={handleSessionChange}
            onPackageChange={setSelectedPackageId}
            focusedPhotoId={focusedPhoto?.id}
            users={database.settings.users || []}
            currentUser={currentUser}
            onFocusPhoto={focusPhoto}
            onTogglePhoto={togglePhoto}
            onToggleFavorite={toggleFavorite}
            onOpenCustomerDisplay={openCustomerDisplay}
            customerDisplayOpen={customerDisplayOpen}
            customerDisplayMode={customerDisplayMode}
            onCustomerDisplayModeChange={setCustomerDisplayMode}
            onCloseCustomerDisplay={closeCustomerDisplay}
            openCashShift={currentOpenCashShift}
            onNavigateToCashier={() => setRoute('cashier')}
            onRegisterSale={registerManualSale}
            onMonitorPreviewChange={setQuickSaleMonitorPreview}
            antiPrint={database.settings.antiPrint}
            stationName={database.settings.multiStation?.stationName}
          />
        )}
        {route === 'post-tour' && (
          <PostTour
            sessions={openSessions}
            selectedSessionCode={selectedSessionCode}
            photos={photos}
            selectedPackage={selectedPackage as PackageOption}
            packageOptions={packageOptionsForSession}
            onSessionChange={handleSessionChange}
            onPackageChange={setSelectedPackageId}
            onTogglePhoto={togglePhoto}
            onSetPhotoSelection={setPhotoSelection}
            onRegisterSale={registerManualSale}
            onExportPurchasedPhotos={exportPurchasedPhotos}
            onlineCheckouts={database.onlineCheckouts}
            cashierSales={database.cashierSales}
            settings={database.settings}
            onCreateMercadoPagoCheckout={createMercadoPagoCheckout}
            onCheckMercadoPagoCheckout={checkMercadoPagoCheckout}
            onOpenExternalUrl={openExternalUrl}
            publicGallery={database.publicGallery}
            onOpenPublicGallery={openPublicGallery}
            onPublishSessionToCloud={publishSessionToCloud}
            onSyncCloudSales={syncCloudSales}
            onCreateSaleDelivery={createSaleDelivery}
            onOpenSaleDelivery={openSaleDelivery}
          />
        )}
        {route === 'reports' && canExportReports && (
          <FunnelBI
            sessions={database.sessions}
            photos={database.photos}
            cashierSales={database.cashierSales}
            onlineCheckouts={database.onlineCheckouts}
            deliveryAccessLogs={database.deliveryAccessLogs || []}
            packages={database.settings.packages || []}
            companyName={database.settings.companyName}
          />
        )}
        {route === 'photographer' && (
          <PhotographerPortal
            sessions={openSessions}
            photos={database.photos}
            publicGallery={database.publicGallery}
            selectedSessionCode={selectedSessionCode}
            onSessionChange={handleSessionChange}
            onOpenPhotographerPortal={openPhotographerPortal}
          />
        )}
        {route === 'cashier' && currentUser && (
          <Cashier
            cashierSales={database.cashierSales}
            cashShifts={database.cashShifts || []}
            cashMovements={database.cashMovements || []}
            sessions={database.sessions}
            settings={database.settings}
            currentUser={currentUser}
            canControlCash={canControlCash}
            canCancelSale={canCancelSale}
            canExportReports={canExportReports}
            onOpenDataFolder={openDataFolder}
            onExportCsv={exportCashierCsv}
            onCreateCloseReport={createCashCloseReport}
            onOpenCashShift={openCashShift}
            onRegisterCashWithdrawal={registerCashWithdrawal}
            onCloseCashShift={closeCashShift}
            onCancelSale={cancelSale}
            onMarkSaleDelivered={markSaleDelivered}
            onExportSaleReceipt={exportSaleReceipt}
            onExportSalePhotos={exportSalePhotos}
            onCreateSaleDelivery={createSaleDelivery}
            onOpenSaleDelivery={openSaleDelivery}
            onExportCashHistory={exportCashHistory}
          />
        )}
        {route === 'audit' && canAccessAudit && currentUser && <AuditLogs logs={database.auditLogs || []} currentUser={currentUser} onExportCsv={exportAuditLogsCsv} />}
        {route === 'diagnostics' && canAccessSettings && <Diagnostics onOpenDataFolder={openDataFolder} onCheckForUpdates={checkForUpdates} />}
        {route === 'settings' && canAccessSettings && <Settings settings={database.settings} currentUser={currentUser as AuthUser} onOpenDataFolder={openDataFolder} onExportBackup={exportBackup} onRestoreBackup={restoreBackup} onChangePassword={changePassword} onValidateLicense={validateLicenseWithServer} onGetMultiStationInfo={getMultiStationInfo} onPullFromPrimaryStation={pullFromPrimaryStation} onUpdateSettings={updateSettings} />}
      </main>
    </div>
  );
}
