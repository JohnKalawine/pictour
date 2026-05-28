const { app, BrowserWindow, ipcMain, screen, dialog, nativeImage, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const http = require('http');
const os = require('os');
const { pathToFileURL } = require('url');

let mainWindow = null;
let customerWindow = null;
let latestCustomerSnapshot = null;
let dbCache = null;
let publicGalleryServer = null;
let publicGalleryServerPort = 3888;
let multiStationAutoPullTimer = null;

const isDev = !app.isPackaged;
const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5173';
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp']);
const APP_RELEASE_VERSION = '4.6.2';
const DB_SCHEMA_VERSION = 462;

function getDataRoot() {
  return path.join(app.getPath('userData'), 'pictour-local');
}

function getDatabasePath() {
  return path.join(getDataRoot(), 'pictour-db.json');
}

function getPhotoLibraryPath() {
  return path.join(getDataRoot(), 'photo-library');
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

function getAppVersion() {
  try {
    return require(path.join(__dirname, '../package.json')).version || 'dev';
  } catch {
    return 'dev';
  }
}

function getDeviceFingerprint() {
  const raw = [os.hostname(), os.platform(), os.arch(), os.userInfo?.().username || '', app.getPath('userData')].join('|');
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function maskSensitiveValue(key, value) {
  const normalizedKey = String(key || '').toLowerCase();
  if (normalizedKey.includes('password') || normalizedKey.includes('token') || normalizedKey.includes('apikey') || normalizedKey.includes('api_key') || normalizedKey.includes('secret')) {
    return value ? '***' : '';
  }
  return value;
}

function sanitizeAuditDetails(value, depth = 0) {
  if (depth > 4) return '[limite]';
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.slice(0, 40).map((item) => sanitizeAuditDetails(item, depth + 1));
  if (typeof value === 'object') {
    const output = {};
    for (const [key, item] of Object.entries(value)) {
      if (String(key).toLowerCase().includes('database')) continue;
      output[key] = sanitizeAuditDetails(maskSensitiveValue(key, item), depth + 1);
    }
    return output;
  }
  if (typeof value === 'string' && value.length > 500) return `${value.slice(0, 500)}...`;
  return value;
}

function actorFromInput(input = {}, fallbackName = 'Sistema') {
  const username = String(input.actorUsername || input.operatorUsername || input.username || '').trim().toLowerCase();
  const name = String(input.actorName || input.operatorName || input.sellerName || input.username || fallbackName || 'Sistema').trim() || 'Sistema';
  return { actorUsername: username || undefined, actorName: name };
}

function addAuditLog(db, entry = {}) {
  if (!db) return;
  const severity = ['INFO', 'WARNING', 'CRITICAL'].includes(entry.severity) ? entry.severity : 'INFO';
  const category = ['AUTH','SETTINGS','SESSION','PHOTO','SALE','CASHIER','CLOUD','BACKUP','CUSTOMER_DISPLAY','SYSTEM'].includes(entry.category) ? entry.category : 'SYSTEM';
  const log = {
    id: makeId('audit'),
    createdAt: nowIso(),
    category,
    action: String(entry.action || 'SYSTEM.EVENT'),
    severity,
    actorName: entry.actorName || 'Sistema',
    actorUsername: entry.actorUsername || undefined,
    entityType: entry.entityType || undefined,
    entityId: entry.entityId || undefined,
    entityLabel: entry.entityLabel || undefined,
    summary: String(entry.summary || entry.action || 'Ação registrada'),
    details: sanitizeAuditDetails(entry.details || {}),
    deviceName: os.hostname(),
    appVersion: getAppVersion()
  };
  db.auditLogs = [log, ...(db.auditLogs || [])].slice(0, 5000);
}

function addDaysIso(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function getLocalIPv4Addresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];

  Object.values(interfaces).forEach((entries) => {
    (entries || []).forEach((entry) => {
      if (entry.family === 'IPv4' && !entry.internal) {
        addresses.push(entry.address);
      }
    });
  });

  return [...new Set(addresses)];
}

function getPublicGalleryInfo() {
  const networkAddresses = getLocalIPv4Addresses();
  const port = publicGalleryServerPort || 3888;
  const urls = [
    `http://127.0.0.1:${port}`,
    ...networkAddresses.map((address) => `http://${address}:${port}`)
  ];

  return {
    enabled: Boolean(publicGalleryServer),
    port,
    localUrl: urls[0],
    networkUrls: urls.slice(1),
    primaryUrl: urls[1] || urls[0]
  };
}


function getMultiStationInfo() {
  const db = getMutableDatabase();
  const settings = normalizeMultiStationSettings((db.settings || {}).multiStation || {});
  const gallery = getPublicGalleryInfo();
  return {
    enabled: Boolean(settings.enabled),
    mode: settings.mode,
    stationName: settings.stationName || os.hostname() || 'Estação PicTour',
    appVersion: `v${APP_RELEASE_VERSION}`,
    schemaVersion: DB_SCHEMA_VERSION,
    primaryUrl: settings.primaryUrl,
    localUrl: gallery.localUrl,
    networkUrls: gallery.networkUrls,
    sessionCount: (db.sessions || []).length,
    photoCount: (db.photos || []).length,
    saleCount: (db.cashierSales || []).filter((sale) => sale.saleStatus !== 'CANCELLED').length,
    lastSyncAt: settings.lastSyncAt,
    lastSyncMessage: settings.lastSyncMessage
  };
}

function getRequestToken(req, query = {}) {
  return String(req.headers['x-pictour-sync-token'] || query.token || '').trim();
}

function isValidStationSyncToken(req, query = {}) {
  const db = getMutableDatabase();
  const settings = normalizeMultiStationSettings((db.settings || {}).multiStation || {});
  if (!settings.enabled) return false;
  const expected = String(settings.syncToken || '').trim();
  if (!expected) return false;
  return getRequestToken(req, query) === expected;
}

function buildStationSnapshot(db) {
  const hydrated = hydrateDatabase(db);
  return {
    ...hydrated,
    stationSnapshot: {
      generatedAt: nowIso(),
      stationName: hydrated.settings?.multiStation?.stationName || os.hostname(),
      appVersion: `v${APP_RELEASE_VERSION}`,
      schemaVersion: DB_SCHEMA_VERSION
    },
    photos: (hydrated.photos || []).map((photo) => ({
      ...photo,
      storedPath: photo.storedPath ? path.basename(photo.storedPath) : undefined,
      downloadUrl: `/api/station/photo/${encodeURIComponent(photo.id)}`
    }))
  };
}

async function fetchJsonFromUrl(url, options = {}) {
  if (typeof fetch !== 'function') throw new Error('Fetch não disponível neste runtime do Electron/Node.');
  const response = await fetch(url, options);
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
  if (!response.ok) {
    const message = payload?.message || payload?.error || text || `HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload;
}

async function downloadStationPhoto(primaryUrl, token, photo) {
  if (!photo?.id || typeof fetch !== 'function') return { ok: false, message: 'Foto inválida.' };
  const originalName = photo.storedPath || photo.originalFileName || `${photo.id}.jpg`;
  const safeName = path.basename(String(originalName)).replace(/[^a-zA-Z0-9._-]/g, '_') || `${photo.id}.jpg`;
  const targetPath = path.join(getPhotoLibraryPath(), safeName);
  if (fs.existsSync(targetPath) && fs.statSync(targetPath).size > 0) return { ok: true, targetPath, skipped: true };
  const url = `${primaryUrl.replace(/\/$/, '')}/api/station/photo/${encodeURIComponent(photo.id)}?token=${encodeURIComponent(token)}`;
  const response = await fetch(url);
  if (!response.ok) return { ok: false, message: `HTTP ${response.status}` };
  const buffer = Buffer.from(await response.arrayBuffer());
  ensureDir(getPhotoLibraryPath());
  fs.writeFileSync(targetPath, buffer);
  return { ok: true, targetPath, skipped: false };
}


function resetMultiStationAutoPull() {
  if (multiStationAutoPullTimer) {
    clearInterval(multiStationAutoPullTimer);
    multiStationAutoPullTimer = null;
  }
  if (!dbCache) return;
  const settings = normalizeMultiStationSettings((dbCache.settings || {}).multiStation || {});
  if (!settings.enabled || settings.mode !== 'SECONDARY' || !settings.autoPullSeconds) return;
  const intervalMs = Math.max(30, Number(settings.autoPullSeconds || 0)) * 1000;
  multiStationAutoPullTimer = setInterval(() => {
    pullFromPrimaryStation({ actorName: 'Auto-sync local' }).catch((error) => {
      const db = getMutableDatabase();
      db.settings = {
        ...(db.settings || {}),
        multiStation: {
          ...normalizeMultiStationSettings((db.settings || {}).multiStation || {}),
          lastSyncAt: nowIso(),
          lastSyncMessage: `Auto-sync falhou: ${error.message || error}`
        }
      };
      saveDatabase(db);
    });
  }, intervalMs);
}

async function pullFromPrimaryStation(input = {}) {
  const db = getMutableDatabase();
  const localSettings = normalizeMultiStationSettings((db.settings || {}).multiStation || {});
  if (!localSettings.enabled) {
    return { ok: false, message: 'Ative a sincronização multi-estação nas configurações.', database: hydrateDatabase(db) };
  }
  const primaryUrl = String(localSettings.primaryUrl || '').trim().replace(/\/$/, '');
  const token = String(localSettings.syncToken || '').trim();
  if (!primaryUrl || !token) {
    return { ok: false, message: 'Configure a URL da estação principal e o token local.', database: hydrateDatabase(db) };
  }

  const snapshotUrl = `${primaryUrl}/api/station/snapshot?token=${encodeURIComponent(token)}`;
  const remoteDb = await fetchJsonFromUrl(snapshotUrl);
  if (!remoteDb || !Array.isArray(remoteDb.sessions) || !Array.isArray(remoteDb.photos)) {
    throw new Error('Snapshot da estação principal inválido.');
  }

  let downloadedPhotos = 0;
  let failedPhotos = 0;
  const localizedPhotos = [];
  for (const photo of remoteDb.photos || []) {
    let storedPath = photo.storedPath;
    if (photo.id) {
      try {
        const download = await downloadStationPhoto(primaryUrl, token, photo);
        if (download.ok && download.targetPath) {
          storedPath = download.targetPath;
          if (!download.skipped) downloadedPhotos += 1;
        } else if (photo.storedPath) {
          failedPhotos += 1;
        }
      } catch {
        if (photo.storedPath) failedPhotos += 1;
      }
    }
    const { downloadUrl, ...cleanPhoto } = photo;
    localizedPhotos.push({ ...cleanPhoto, storedPath });
  }

  const message = `Sync local concluído: ${remoteDb.sessions.length || 0} sessões, ${localizedPhotos.length || 0} fotos, ${(remoteDb.cashierSales || []).length || 0} vendas. Fotos baixadas: ${downloadedPhotos}. Falhas: ${failedPhotos}.`;
  const nextSettings = {
    ...(remoteDb.settings || {}),
    multiStation: {
      ...localSettings,
      lastSyncAt: nowIso(),
      lastSyncMessage: message
    }
  };
  const nextDb = {
    ...remoteDb,
    version: DB_SCHEMA_VERSION,
    settings: nextSettings,
    photos: localizedPhotos,
    migrationInfo: {
      ...(remoteDb.migrationInfo || {}),
      schemaVersion: DB_SCHEMA_VERSION,
      lastMigratedAt: nowIso(),
      migrationLog: [
        ...((remoteDb.migrationInfo || {}).migrationLog || []).slice(-20),
        `Snapshot importado via multi-estação em ${nowIso()}.`
      ]
    }
  };
  delete nextDb.stationSnapshot;
  saveDatabase(nextDb);
  addAuditLog(dbCache, { category: 'SYSTEM', action: 'MULTI_STATION.PULL', severity: 'CRITICAL', ...actorFromInput(input, 'Sistema'), entityType: 'STATION', entityLabel: primaryUrl, summary: message, details: { primaryUrl, downloadedPhotos, failedPhotos } });
  saveDatabase(dbCache);
  return {
    ok: true,
    message,
    importedSessions: remoteDb.sessions.length || 0,
    importedPhotos: localizedPhotos.length || 0,
    importedSales: (remoteDb.cashierSales || []).length,
    downloadedPhotos,
    failedPhotos,
    database: hydrateDatabase(dbCache)
  };
}

function buildLocalGalleryUrl(session) {
  const publicSlug = session?.publicSlug || slugify(`${session?.code || 'pt'}-${session?.customerName || 'cliente'}`);
  return `${getPublicGalleryInfo().primaryUrl}/g/${publicSlug}`;
}

function notifyDatabaseChanged() {
  if (!mainWindow || mainWindow.isDestroyed() || !dbCache) return;
  mainWindow.webContents.send('database:changed', hydrateDatabase(dbCache));
}

function defaultMercadoPagoSettings() {
  return {
    enabled: false,
    environment: 'sandbox',
    publicKey: '',
    accessToken: '',
    webhookUrl: '',
    webhookSecret: '',
    autoReleaseDelivery: true,
    successUrl: 'https://pictour.app/pagamento/aprovado',
    failureUrl: 'https://pictour.app/pagamento/recusado',
    pendingUrl: 'https://pictour.app/pagamento/pendente'
  };
}

function defaultCloudStorageSettings() {
  return {
    driver: 'local',
    bucket: '',
    endpoint: '',
    publicBaseUrl: 'http://127.0.0.1:8787/media',
    signedDownloadTtlSeconds: 900,
    keepOriginalsPrivate: true
  };
}

function defaultCloudSettings() {
  return {
    enabled: false,
    apiBaseUrl: 'http://127.0.0.1:8787',
    apiKey: '',
    publicGalleryBaseUrl: 'http://127.0.0.1:8787',
    storage: defaultCloudStorageSettings()
  };
}

function defaultPhotographerPortalSettings() {
  return {
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
}

function defaultMultiStationSettings() {
  return {
    enabled: false,
    mode: 'PRIMARY',
    stationName: os.hostname() || 'Estação PicTour',
    syncToken: 'pictour-local-sync',
    primaryUrl: 'http://127.0.0.1:3888',
    autoPullSeconds: 0,
    lastSyncAt: undefined,
    lastSyncMessage: undefined
  };
}

function normalizeMultiStationSettings(input = {}) {
  const defaults = defaultMultiStationSettings();
  const mode = input.mode === 'SECONDARY' ? 'SECONDARY' : 'PRIMARY';
  return {
    ...defaults,
    ...input,
    enabled: Boolean(input.enabled),
    mode,
    stationName: String(input.stationName || defaults.stationName).trim() || defaults.stationName,
    syncToken: String(input.syncToken || defaults.syncToken).trim() || defaults.syncToken,
    primaryUrl: String(input.primaryUrl || defaults.primaryUrl).trim().replace(/\/$/, ''),
    autoPullSeconds: Math.max(0, Number(input.autoPullSeconds || 0) || 0)
  };
}

function defaultAntiPrintSettings() {
  return {
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
}

function normalizeAntiPrintSettings(input = {}) {
  const defaults = defaultAntiPrintSettings();
  return {
    ...defaults,
    ...input,
    enabled: input.enabled !== false,
    watermarkText: String(input.watermarkText || defaults.watermarkText).trim() || defaults.watermarkText,
    opacity: Math.min(85, Math.max(5, Number(input.opacity ?? defaults.opacity))),
    density: Math.min(48, Math.max(8, Number(input.density ?? defaults.density))),
    rotationDeg: Math.min(45, Math.max(-45, Number(input.rotationDeg ?? defaults.rotationDeg))),
    noiseIntensity: Math.min(60, Math.max(0, Number(input.noiseIntensity ?? defaults.noiseIntensity))),
    previewBlur: Math.min(6, Math.max(0, Number(input.previewBlur ?? defaults.previewBlur))),
    shieldAfterInactivitySeconds: Math.min(120, Math.max(0, Number(input.shieldAfterInactivitySeconds ?? defaults.shieldAfterInactivitySeconds))),
    includeSessionCode: input.includeSessionCode !== false,
    includePhotoCode: input.includePhotoCode !== false,
    includeTimestamp: input.includeTimestamp !== false,
    includeStationName: input.includeStationName !== false,
    resolutionGuard: input.resolutionGuard !== false,
    blockContextMenu: input.blockContextMenu !== false,
    blockDrag: input.blockDrag !== false,
    shieldOnBlur: input.shieldOnBlur !== false,
    showSessionMeta: input.showSessionMeta !== false
  };
}

function defaultCommercialSetupSettings() {
  return {
    onboardingCompleted: false,
    completedStepIds: [],
    demoModeLoaded: false,
    installMode: app.isPackaged ? 'PACKAGED' : 'DEV',
    installerNotesAcknowledged: false
  };
}

function normalizeCommercialSetupSettings(input = {}) {
  const validSteps = new Set(['COMPANY', 'LOCATIONS', 'PACKAGES', 'MERCADO_PAGO', 'SECURITY', 'BACKUP', 'DEMO_DONE']);
  const completedStepIds = Array.isArray(input.completedStepIds)
    ? [...new Set(input.completedStepIds.filter((step) => validSteps.has(step)))]
    : [];
  return {
    ...defaultCommercialSetupSettings(),
    ...input,
    completedStepIds,
    onboardingCompleted: Boolean(input.onboardingCompleted || completedStepIds.length >= validSteps.size),
    demoModeLoaded: Boolean(input.demoModeLoaded),
    installMode: app.isPackaged ? 'PACKAGED' : 'DEV'
  };
}



const STAFF_PERMISSION_KEYS = [
  'DASHBOARD',
  'OPERATION_STATUS',
  'SESSIONS',
  'CAPTURE',
  'CHROMA',
  'QUICK_SALE',
  'POST_TOUR',
  'PHOTOGRAPHER_PORTAL',
  'CASHIER',
  'REPORTS',
  'CASH_CONTROL',
  'CANCEL_SALE',
  'CLOUD_PUBLISH',
  'BACKUP',
  'AUDIT_LOG',
  'SETTINGS'
];

function defaultStaffPermissions() {
  return {
    DASHBOARD: true,
    OPERATION_STATUS: true,
    SESSIONS: true,
    CAPTURE: true,
    CHROMA: true,
    QUICK_SALE: true,
    POST_TOUR: true,
    PHOTOGRAPHER_PORTAL: true,
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

function managerPermissions() {
  return Object.fromEntries(STAFF_PERMISSION_KEYS.map((key) => [key, true]));
}

function normalizePermissions(role, input = {}, adminPermissions = false) {
  if (role === 'MANAGER') return managerPermissions();
  const base = { ...defaultStaffPermissions(), ...(input || {}) };
  if (adminPermissions) {
    base.SETTINGS = true;
    base.REPORTS = true;
    base.CASH_CONTROL = true;
    base.CANCEL_SALE = true;
    base.CLOUD_PUBLISH = true;
    base.BACKUP = true;
    base.AUDIT_LOG = true;
  }
  return Object.fromEntries(STAFF_PERMISSION_KEYS.map((key) => [key, Boolean(base[key])]));
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(String(password || ''), 'utf8').digest('hex');
}

function defaultUsers() {
  return [
    {
      id: 'user_admin_default',
      name: 'Administrador PicTour',
      username: 'admin',
      role: 'MANAGER',
      adminPermissions: true,
      permissions: managerPermissions(),
      active: true,
      passwordHash: hashPassword('admin12345'),
      forcePasswordChange: true,
      createdAt: nowIso()
    }
  ];
}

function defaultLocations(settings = {}) {
  const name = String(settings.locationName || 'Parque Aventura').trim() || 'Parque Aventura';
  return [{ id: 'location_default', name, active: true, createdAt: nowIso() }];
}

function defaultExchangeRates() {
  return {
    BRL: 1,
    USD: 5,
    EUR: 5.5,
    PYG: 0.0007,
    ARS: 0.006
  };
}

function defaultPackages(settings = {}) {
  const locationName = String(settings.locationName || 'Parque Aventura').trim() || 'Parque Aventura';
  return [
    { id: 'pkg_01', name: '1 Foto Digital', locationName, photoQuantity: 1, includesAllPhotos: false, priceCents: 4000, currency: 'BRL', pricingMode: 'PER_PHOTO', active: true, createdAt: nowIso() },
    { id: 'pkg_02', name: 'Foto Premium Digital', locationName, photoQuantity: 1, includesAllPhotos: false, priceCents: 6000, currency: 'BRL', pricingMode: 'PER_PHOTO', active: true, createdAt: nowIso() },
    { id: 'pkg_03', name: 'Todas as fotos da sessão', locationName, photoQuantity: null, includesAllPhotos: true, priceCents: 14990, currency: 'BRL', pricingMode: 'FIXED', active: true, createdAt: nowIso() }
  ];
}

function publicUser(user) {
  if (!user) return null;
  const { passwordHash, password, ...safeUser } = user;
  return safeUser;
}

function normalizeUsers(users = [], previousUsers = []) {
  const previousById = new Map((previousUsers || []).map((user) => [user.id, user]));
  const previousByUsername = new Map((previousUsers || []).map((user) => [String(user.username || '').toLowerCase(), user]));
  const normalized = [];
  const seen = new Set();

  for (const rawUser of users || []) {
    const username = String(rawUser.username || '').trim().toLowerCase();
    if (!username || seen.has(username)) continue;
    seen.add(username);

    const previous = previousById.get(rawUser.id) || previousByUsername.get(username) || {};
    const role = rawUser.role === 'MANAGER' ? 'MANAGER' : 'STAFF';
    const passwordHash = rawUser.password
      ? hashPassword(rawUser.password)
      : (rawUser.passwordHash || previous.passwordHash || hashPassword(username === 'admin' ? 'admin12345' : 'pictour123'));

    const defaultAdminHash = hashPassword('admin12345');
    const forcePasswordChange = rawUser.forcePasswordChange === true
      || previous.forcePasswordChange === true
      || (username === 'admin' && passwordHash === defaultAdminHash && rawUser.forcePasswordChange !== false);

    normalized.push({
      id: rawUser.id || makeId('user'),
      name: String(rawUser.name || previous.name || username).trim() || username,
      username,
      role,
      adminPermissions: role === 'MANAGER' ? true : Boolean(rawUser.adminPermissions),
      permissions: normalizePermissions(role, rawUser.permissions || previous.permissions, Boolean(rawUser.adminPermissions)),
      active: rawUser.active !== false,
      passwordHash,
      forcePasswordChange,
      createdAt: rawUser.createdAt || previous.createdAt || nowIso()
    });
  }

  if (!normalized.some((user) => user.role === 'MANAGER' && user.active !== false)) {
    const existingAdmin = previousByUsername.get('admin') || normalized.find((user) => user.username === 'admin');
    normalized.unshift({
      ...(existingAdmin || {}),
      id: existingAdmin?.id || 'user_admin_default',
      name: existingAdmin?.name || 'Administrador PicTour',
      username: 'admin',
      role: 'MANAGER',
      adminPermissions: true,
      permissions: managerPermissions(),
      active: true,
      passwordHash: existingAdmin?.passwordHash || hashPassword('admin12345'),
      forcePasswordChange: existingAdmin?.forcePasswordChange ?? true,
      createdAt: existingAdmin?.createdAt || nowIso()
    });
  }

  return normalized;
}

function normalizeLocations(locations = [], settings = {}) {
  const normalized = [];
  const seen = new Set();

  for (const rawLocation of locations || []) {
    const name = String(rawLocation.name || '').trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    normalized.push({
      id: rawLocation.id || makeId('loc'),
      name,
      active: rawLocation.active !== false,
      createdAt: rawLocation.createdAt || nowIso()
    });
  }

  if (!normalized.length) return defaultLocations(settings);
  return normalized;
}

function normalizeExchangeRates(exchangeRates = {}) {
  const defaults = defaultExchangeRates();
  return {
    BRL: 1,
    USD: Number(exchangeRates.USD || defaults.USD),
    EUR: Number(exchangeRates.EUR || defaults.EUR),
    PYG: Number(exchangeRates.PYG || defaults.PYG),
    ARS: Number(exchangeRates.ARS || defaults.ARS)
  };
}

function defaultCashSettings() {
  return {
    recommendedChangeFundCents: 50000,
    requireOpeningChangeFund: true,
    warnIfClosingChangeFundDifferent: true,
    cashRegisterName: 'Caixa 01',
    receiptPrinterName: '',
    receiptPaperWidthChars: 42,
    autoPrintCashReceipts: true
  };
}

function normalizeCashSettings(input = {}) {
  const defaults = defaultCashSettings();
  const recommended = Math.max(0, Math.round(Number(input.recommendedChangeFundCents ?? defaults.recommendedChangeFundCents)));
  return {
    recommendedChangeFundCents: recommended || defaults.recommendedChangeFundCents,
    requireOpeningChangeFund: input.requireOpeningChangeFund !== false,
    warnIfClosingChangeFundDifferent: input.warnIfClosingChangeFundDifferent !== false,
    cashRegisterName: String(input.cashRegisterName || defaults.cashRegisterName).trim() || defaults.cashRegisterName,
    receiptPrinterName: String(input.receiptPrinterName || '').trim(),
    receiptPaperWidthChars: Math.max(32, Math.min(56, Math.round(Number(input.receiptPaperWidthChars || defaults.receiptPaperWidthChars)))),
    autoPrintCashReceipts: input.autoPrintCashReceipts !== false
  };
}


function formatCashMoney(cents = 0) {
  return `R$ ${(Number(cents || 0) / 100).toFixed(2).replace('.', ',')}`;
}

function formatCurrencyMoney(cents = 0, currency = 'BRL') {
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(Number(cents || 0) / 100);
  } catch {
    return `${currency} ${(Number(cents || 0) / 100).toFixed(2).replace('.', ',')}`;
  }
}

function cashMethodLabel(method = '') {
  const labels = {
    PIX_ONLINE: 'Pix online',
    MANUAL_PIX: 'Pix caixa',
    CREDIT_CARD_ONLINE: 'Cartao online',
    DEBIT_CARD_ONLINE: 'Debito online',
    EXTERNAL_CARD_MACHINE: 'Cartao maq.',
    CASH: 'Dinheiro',
    MIXED: 'Pagamento misto'
  };
  return labels[method] || method || 'Metodo';
}


function normalizeSaleTender(tender = {}, fallbackId = '') {
  const method = String(tender.method || 'MANUAL_PIX');
  const currency = String(tender.currency || 'BRL');
  const amountCents = Math.max(0, Math.round(Number(tender.amountCents || 0)));
  const amountBaseCents = Math.max(0, Math.round(Number(tender.amountBaseCents || amountCents)));
  return {
    id: String(tender.id || fallbackId || makeId('tender')),
    method,
    currency,
    amountCents,
    amountBaseCents,
    label: tender.label || cashMethodLabel(method)
  };
}

function getSaleTenders(sale = {}) {
  if (Array.isArray(sale.tenders) && sale.tenders.length) {
    return sale.tenders.map((tender, index) => normalizeSaleTender(tender, `${sale.id || 'sale'}_tender_${index + 1}`));
  }
  return [normalizeSaleTender({ method: sale.method || 'MANUAL_PIX', currency: sale.currency || 'BRL', amountCents: sale.amountCents || 0, amountBaseCents: sale.amountBaseCents || sale.amountCents || 0 }, `${sale.id || 'sale'}_legacy`)]
    .filter((tender) => tender.amountCents > 0 || tender.amountBaseCents > 0);
}

function saleCashDrawerBaseCents(sale = {}) {
  if (sale.saleStatus === 'CANCELLED') return 0;
  const cashPaid = getSaleTenders(sale)
    .filter((tender) => tender.method === 'CASH')
    .reduce((sum, tender) => sum + Number(tender.amountBaseCents || 0), 0);
  const change = Math.max(0, Number(sale.changeBaseCents || 0));
  if (cashPaid > 0) return Math.max(0, cashPaid - change);
  return sale.method === 'CASH' ? Math.max(0, Number(sale.amountBaseCents || 0) - change) : 0;
}

function salePaymentSummary(sale = {}) {
  const tenders = getSaleTenders(sale);
  const parts = tenders.map((tender) => `${cashMethodLabel(tender.method)} ${tender.currency}: ${formatCurrencyMoney(tender.amountCents, tender.currency)}`);
  if (sale.changeBaseCents) parts.push(`Troco: ${formatCashMoney(sale.changeBaseCents)}`);
  return parts.join(' + ');
}

function receiptLogoLines(width = 42) {
  return [
    centerReceiptLine('◆◆◆  PICTOUR  ◆◆◆', width),
    centerReceiptLine('PHOTO COMMERCE PLATFORM', width)
  ];
}

function formatReceiptDate(iso = nowIso()) {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });
}

function padReceiptLine(label, value, width = 42) {
  const left = String(label || '').slice(0, Math.max(8, width - 8));
  const right = String(value ?? '');
  const space = Math.max(1, width - left.length - right.length);
  return `${left}${' '.repeat(space)}${right}`;
}

function centerReceiptLine(text, width = 42) {
  const raw = String(text || '').slice(0, width);
  const left = Math.max(0, Math.floor((width - raw.length) / 2));
  return `${' '.repeat(left)}${raw}`;
}

function receiptSeparator(width = 42) {
  return '-'.repeat(Math.max(32, Math.min(56, width)));
}

function getCashReceiptDir() {
  const dir = path.join(getDataRoot(), 'cash-receipts');
  ensureDir(dir);
  return dir;
}

function businessDayOf(iso) {
  return new Date(iso || nowIso()).toISOString().slice(0, 10);
}

function summarizeSalesByMethod(sales = []) {
  const map = new Map();
  for (const sale of sales) {
    if (sale.saleStatus === 'CANCELLED') continue;
    for (const tender of getSaleTenders(sale)) {
      const key = `${tender.method || 'UNKNOWN'}:${tender.currency || 'BRL'}`;
      const current = map.get(key) || { method: tender.method || 'UNKNOWN', currency: tender.currency || 'BRL', totalBaseCents: 0, amountCents: 0, count: 0 };
      current.count += 1;
      current.amountCents += Number(tender.amountCents || 0);
      current.totalBaseCents += Number(tender.amountBaseCents || 0);
      map.set(key, current);
    }
  }
  return Array.from(map.values()).sort((a, b) => b.totalBaseCents - a.totalBaseCents);
}

function summarizeSalesByPaymentFamily(sales = []) {
  const families = new Map();
  for (const sale of sales) {
    if (sale.saleStatus === 'CANCELLED') continue;
    for (const tender of getSaleTenders(sale)) {
      const method = tender.method || 'UNKNOWN';
      const family = method.includes('PIX') ? 'PIX' : method.includes('CARD') || method.includes('DEBIT') || method.includes('CREDIT') ? 'CARTAO' : method === 'CASH' ? 'DINHEIRO' : 'OUTROS';
      const key = `${family}:${tender.currency || 'BRL'}`;
      const current = families.get(key) || { family, currency: tender.currency || 'BRL', totalBaseCents: 0, amountCents: 0, count: 0 };
      current.count += 1;
      current.amountCents += Number(tender.amountCents || 0);
      current.totalBaseCents += Number(tender.amountBaseCents || 0);
      families.set(key, current);
    }
  }
  return Array.from(families.values()).sort((a, b) => b.totalBaseCents - a.totalBaseCents);
}

function appendSalesBreakdown(lines, title, summary, width = 42) {
  lines.push(receiptSeparator(width));
  lines.push(centerReceiptLine(title, width));
  if (!summary?.byMethod?.length) {
    lines.push('Sem vendas no periodo.'.slice(0, width));
    return;
  }
  lines.push(centerReceiptLine('POR METODO / MOEDA', width));
  for (const item of summary.byMethod) {
    const original = formatCurrencyMoney(item.amountCents, item.currency);
    const base = item.currency === 'BRL' ? '' : ` | BRL ${formatCashMoney(item.totalBaseCents).replace('R$ ', '')}`;
    lines.push(padReceiptLine(`${cashMethodLabel(item.method)} ${item.currency}`, `${item.count}x ${original}${base}`.slice(0, Math.max(12, width - 16)), width));
  }
  lines.push(centerReceiptLine('PIX / CARTAO / DINHEIRO', width));
  for (const item of summarizeSalesByPaymentFamily(summary.activeSales || [])) {
    const original = formatCurrencyMoney(item.amountCents, item.currency);
    const base = item.currency === 'BRL' ? '' : ` | BRL ${formatCashMoney(item.totalBaseCents).replace('R$ ', '')}`;
    lines.push(padReceiptLine(`${item.family} ${item.currency}`, `${item.count}x ${original}${base}`.slice(0, Math.max(12, width - 16)), width));
  }
}

function getCashShiftSummary(db, shift) {
  const sales = (db.cashierSales || []).filter((sale) => sale.cashShiftId === shift.id);
  const activeSales = sales.filter((sale) => sale.saleStatus !== 'CANCELLED');
  const cancelledSales = sales.filter((sale) => sale.saleStatus === 'CANCELLED');
  const movements = (db.cashMovements || []).filter((movement) => movement.shiftId === shift.id);
  const withdrawals = movements.filter((movement) => movement.type === 'WITHDRAWAL');
  const salesTotalCents = activeSales.reduce((sum, sale) => sum + Number(sale.amountBaseCents || 0), 0);
  const paidBaseCents = activeSales.reduce((sum, sale) => sum + Number(sale.paidBaseCents || sale.amountBaseCents || 0), 0);
  const changeBaseCents = activeSales.reduce((sum, sale) => sum + Number(sale.changeBaseCents || 0), 0);
  const cashDrawerCents = activeSales.reduce((sum, sale) => sum + saleCashDrawerBaseCents(sale), 0);
  const cancelledTotalCents = cancelledSales.reduce((sum, sale) => sum + Number(sale.amountBaseCents || 0), 0);
  const withdrawalTotalCents = withdrawals.reduce((sum, movement) => sum + Number(movement.amountCents || 0), 0);
  return { sales, activeSales, cancelledSales, movements, withdrawals, salesTotalCents, paidBaseCents, changeBaseCents, cashDrawerCents, cancelledTotalCents, withdrawalTotalCents, byMethod: summarizeSalesByMethod(activeSales) };
}

function getPdvDaySummary(db, iso = nowIso()) {
  const day = businessDayOf(iso);
  const sales = (db.cashierSales || []).filter((sale) => businessDayOf(sale.createdAt) === day);
  const activeSales = sales.filter((sale) => sale.saleStatus !== 'CANCELLED');
  const cancelledSales = sales.filter((sale) => sale.saleStatus === 'CANCELLED');
  const shifts = (db.cashShifts || []).filter((shift) => businessDayOf(shift.openedAt) === day || (shift.closedAt && businessDayOf(shift.closedAt) === day));
  const movements = (db.cashMovements || []).filter((movement) => businessDayOf(movement.createdAt) === day);
  const withdrawalTotalCents = movements.filter((movement) => movement.type === 'WITHDRAWAL').reduce((sum, movement) => sum + Number(movement.amountCents || 0), 0);
  return {
    day,
    sales,
    activeSales,
    cancelledSales,
    shifts,
    movements,
    salesTotalCents: activeSales.reduce((sum, sale) => sum + Number(sale.amountBaseCents || 0), 0),
    paidBaseCents: activeSales.reduce((sum, sale) => sum + Number(sale.paidBaseCents || sale.amountBaseCents || 0), 0),
    changeBaseCents: activeSales.reduce((sum, sale) => sum + Number(sale.changeBaseCents || 0), 0),
    cashDrawerCents: activeSales.reduce((sum, sale) => sum + saleCashDrawerBaseCents(sale), 0),
    cancelledTotalCents: cancelledSales.reduce((sum, sale) => sum + Number(sale.amountBaseCents || 0), 0),
    withdrawalTotalCents,
    byMethod: summarizeSalesByMethod(activeSales),
    hadShiftChange: shifts.length > 1 || shifts.some((shift) => shift.shiftChangeOnClose)
  };
}

function buildCashReceiptText(db, type, context = {}) {
  const settings = db.settings || {};
  const cashSettings = normalizeCashSettings(settings.cash || defaultCashSettings());
  const width = cashSettings.receiptPaperWidthChars || 42;
  const shift = context.shift || {};
  const movement = context.movement || null;
  const shiftSummary = shift.id ? getCashShiftSummary(db, shift) : null;
  const pdvSummary = getPdvDaySummary(db, context.createdAt || shift.closedAt || shift.openedAt || nowIso());
  const titleByType = {
    OPENING: 'ABERTURA DE CAIXA',
    WITHDRAWAL: 'SANGRIA DE CAIXA',
    CLOSE: 'FECHAMENTO DE CAIXA'
  };
  const lines = [];
  lines.push(...receiptLogoLines(width));
  lines.push(centerReceiptLine(settings.companyName || 'PICTOUR', width));
  lines.push(centerReceiptLine(titleByType[type] || 'MOVIMENTO DE CAIXA', width));
  lines.push(receiptSeparator(width));
  lines.push(padReceiptLine('Caixa/PDV:', shift.cashRegisterName || cashSettings.cashRegisterName || 'Caixa 01', width));
  lines.push(padReceiptLine('Turno:', shift.code || '—', width));
  lines.push(padReceiptLine('Atendente:', context.operatorName || shift.openedBy || shift.closedBy || movement?.operatorName || 'Operador', width));
  lines.push(padReceiptLine('Horario:', formatReceiptDate(context.createdAt || shift.closedAt || shift.openedAt || nowIso()), width));
  lines.push(padReceiptLine('Estacao:', os.hostname(), width));
  lines.push(receiptSeparator(width));

  if (type === 'OPENING') {
    lines.push(padReceiptLine('Fundo de troco:', formatCashMoney(shift.openingAmountCents || context.openingAmountCents || 0), width));
    lines.push(padReceiptLine('Recomendado:', formatCashMoney(shift.recommendedChangeFundCents || cashSettings.recommendedChangeFundCents || 0), width));
    lines.push(`Obs: ${shift.note || context.note || '—'}`.slice(0, width));
  }

  if (type === 'WITHDRAWAL') {
    lines.push(padReceiptLine('Valor sangria:', formatCashMoney(movement?.amountCents || context.amountCents || 0), width));
    lines.push(`Motivo: ${movement?.note || context.reason || 'Sangria de caixa'}`.slice(0, width));
    lines.push(padReceiptLine('Fundo inicial:', formatCashMoney(shift.openingAmountCents || 0), width));
  }

  if (type === 'CLOSE') {
    const expected = Number(shift.expectedAmountCents ?? context.expectedAmountCents ?? 0);
    const counted = Number(shift.closingAmountCents ?? context.closingAmountCents ?? 0);
    const difference = Number(shift.differenceCents ?? counted - expected);
    lines.push(padReceiptLine('Fundo inicial:', formatCashMoney(shift.openingAmountCents || 0), width));
    lines.push(padReceiptLine('Vendas caixa:', `${shiftSummary?.activeSales.length || 0} / ${formatCashMoney(shiftSummary?.salesTotalCents || 0)}`, width));
    lines.push(padReceiptLine('Recebido:', formatCashMoney(shiftSummary?.paidBaseCents || shiftSummary?.salesTotalCents || 0), width));
    lines.push(padReceiptLine('Troco:', formatCashMoney(shiftSummary?.changeBaseCents || 0), width));
    lines.push(padReceiptLine('Dinheiro gaveta:', formatCashMoney(shiftSummary?.cashDrawerCents || 0), width));
    lines.push(padReceiptLine('Sangrias:', `${shiftSummary?.withdrawals.length || 0} / ${formatCashMoney(shiftSummary?.withdrawalTotalCents || 0)}`, width));
    lines.push(padReceiptLine('Esperado:', formatCashMoney(expected), width));
    lines.push(padReceiptLine('Contado:', formatCashMoney(counted), width));
    lines.push(padReceiptLine('Diferenca:', formatCashMoney(difference), width));
    lines.push(padReceiptLine('Fundo final:', formatCashMoney(shift.closingChangeFundCents || context.closingChangeFundCents || 0), width));
    lines.push(padReceiptLine('Troca turno:', shift.shiftChangeOnClose ? 'SIM' : 'NAO', width));
    lines.push(`Obs: ${shift.closeNote || context.note || '—'}`.slice(0, width));
    appendSalesBreakdown(lines, 'MOVIMENTO DO CAIXA', shiftSummary || { activeSales: [], byMethod: [] }, width);
    lines.push(receiptSeparator(width));
    lines.push(centerReceiptLine('MOVIMENTO DO PDV NO DIA', width));
    lines.push(padReceiptLine('Data:', pdvSummary.day, width));
    lines.push(padReceiptLine('Turnos:', String(pdvSummary.shifts.length), width));
    lines.push(padReceiptLine('Troca caixa:', pdvSummary.hadShiftChange || shift.shiftChangeOnClose ? 'SIM' : 'NAO', width));
    lines.push(padReceiptLine('Vendas PDV:', `${pdvSummary.activeSales.length} / ${formatCashMoney(pdvSummary.salesTotalCents)}`, width));
    lines.push(padReceiptLine('Canceladas:', `${pdvSummary.cancelledSales.length} / ${formatCashMoney(pdvSummary.cancelledTotalCents)}`, width));
    lines.push(padReceiptLine('Sangrias dia:', formatCashMoney(pdvSummary.withdrawalTotalCents), width));
    appendSalesBreakdown(lines, 'DETALHE DO PDV', pdvSummary, width);
  }

  lines.push(receiptSeparator(width));
  lines.push('Assinatura do atendente:');
  lines.push('');
  lines.push('________________________________________'.slice(0, width));
  lines.push('Nome legivel: __________________________'.slice(0, width));
  lines.push('Documento: _____________________________'.slice(0, width));
  lines.push(receiptSeparator(width));
  lines.push(centerReceiptLine(`PicTour ${getAppVersion()}`, width));
  lines.push('');
  return lines.join('\n');
}

function saveCashReceiptText(type, shiftCode, text) {
  const safeType = slugify(type || 'caixa');
  const safeShift = slugify(shiftCode || 'sem-turno');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(getCashReceiptDir(), `${stamp}-${safeShift}-${safeType}.txt`);
  fs.writeFileSync(filePath, text, 'utf8');
  return filePath;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>\"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;' }[char] || char));
}

function printCashReceiptText(text, printerName) {
  if (!printerName || !mainWindow) return Promise.resolve({ printed: false, message: 'Impressora não configurada.' });
  return new Promise((resolve) => {
    const printWindow = new BrowserWindow({ show: false, width: 320, height: 600, webPreferences: { sandbox: true } });
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;padding:8px;background:#fff;color:#000}pre{font-family:Consolas,"Courier New",monospace;font-size:11px;line-height:1.25;white-space:pre-wrap;margin:0}</style></head><body><pre>${escapeHtml(text)}</pre></body></html>`;
    printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).then(() => {
      printWindow.webContents.print({ silent: true, printBackground: false, deviceName: printerName }, (success, failureReason) => {
        if (!printWindow.isDestroyed()) printWindow.close();
        resolve({ printed: Boolean(success), message: success ? `Comprovante enviado para ${printerName}.` : `Falha ao imprimir: ${failureReason || 'impressora indisponivel'}.` });
      });
    }).catch((error) => {
      if (!printWindow.isDestroyed()) printWindow.close();
      resolve({ printed: false, message: error.message || 'Falha ao carregar comprovante.' });
    });
  });
}

function emitCashReceipt(db, type, context = {}) {
  const cashSettings = normalizeCashSettings(db.settings?.cash || defaultCashSettings());
  if (cashSettings.autoPrintCashReceipts === false) return { message: 'Emissão automática de comprovante desativada.' };
  const text = buildCashReceiptText(db, type, context);
  const shiftCode = context.shift?.code || context.shiftCode || 'caixa';
  const txtPath = saveCashReceiptText(type, shiftCode, text);
  const printerName = String(cashSettings.receiptPrinterName || '').trim();
  if (printerName) {
    printCashReceiptText(text, printerName).then((printResult) => {
      if (!printResult.printed) {
        console.warn('[PicTour] comprovante térmico não impresso:', printResult.message, 'TXT:', txtPath);
      }
    });
    return { message: `Comprovante enviado para ${printerName} e cópia salva em TXT.`, filePath: txtPath, printerName };
  }
  return { message: `Nenhuma impressora configurada. Comprovante salvo em TXT.`, filePath: txtPath };
}




function licensePlanLimits(plan = 'PRO') {
  const normalizedPlan = plan === 'STARTER' || plan === 'ENTERPRISE' ? plan : 'PRO';
  const limits = {
    STARTER: {
      maxUsers: 5,
      maxLocations: 1,
      monthlyPhotoLimit: 1500,
      features: { cloudGallery: false, mercadoPago: false, aiBackgroundRemoval: false, auditLogs: true, multiLocation: false, advancedReports: false }
    },
    PRO: {
      maxUsers: 15,
      maxLocations: 1,
      monthlyPhotoLimit: 15000,
      features: { cloudGallery: true, mercadoPago: true, aiBackgroundRemoval: false, auditLogs: true, multiLocation: false, advancedReports: true }
    },
    ENTERPRISE: {
      maxUsers: 100,
      maxLocations: 50,
      monthlyPhotoLimit: 150000,
      features: { cloudGallery: true, mercadoPago: true, aiBackgroundRemoval: true, auditLogs: true, multiLocation: true, advancedReports: true }
    }
  };
  return { ...limits[normalizedPlan], features: { ...limits[normalizedPlan].features } };
}

function dateOnlyPlusDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function defaultLicenseSettings() {
  const plan = 'PRO';
  return {
    companyId: '',
    licenseKey: '',
    licenseServerUrl: 'http://127.0.0.1:8787',
    serverLicenseId: '',
    lastValidationMessage: '',
    plan,
    status: 'TRIAL',
    activatedAt: nowIso(),
    expiresAt: dateOnlyPlusDays(14),
    lastValidatedAt: nowIso(),
    offlineGraceDays: 7,
    notes: 'Licença local de teste. Para produção, validar no painel cloud do PicTour.',
    ...licensePlanLimits(plan)
  };
}

function normalizeLicenseSettings(input = {}) {
  const fallback = defaultLicenseSettings();
  const plan = input.plan === 'STARTER' || input.plan === 'ENTERPRISE' ? input.plan : input.plan === 'PRO' ? 'PRO' : fallback.plan;
  const limits = licensePlanLimits(plan);
  const allowedStatus = new Set(['TRIAL', 'ACTIVE', 'EXPIRED', 'SUSPENDED', 'OFFLINE_GRACE']);
  const status = allowedStatus.has(String(input.status || '')) ? input.status : fallback.status;
  return {
    ...fallback,
    ...limits,
    ...(input || {}),
    plan,
    status,
    maxUsers: Math.max(1, Math.round(Number(input.maxUsers || limits.maxUsers))),
    maxLocations: Math.max(1, Math.round(Number(input.maxLocations || limits.maxLocations))),
    monthlyPhotoLimit: Math.max(1, Math.round(Number(input.monthlyPhotoLimit || limits.monthlyPhotoLimit))),
    offlineGraceDays: Math.max(0, Math.round(Number(input.offlineGraceDays ?? fallback.offlineGraceDays))),
    features: {
      ...limits.features,
      ...((input || {}).features || {})
    }
  };
}

function daysUntilLicenseDate(dateValue) {
  if (!dateValue) return null;
  const end = new Date(`${dateValue}T23:59:59`);
  if (Number.isNaN(end.getTime())) return null;
  return Math.ceil((end.getTime() - Date.now()) / 86400000);
}

function getLicenseHealth(db) {
  const settings = db.settings || {};
  const license = normalizeLicenseSettings(settings.license || {});
  const daysLeft = daysUntilLicenseDate(license.expiresAt);
  const activeUsers = (settings.users || []).filter((user) => user.active !== false).length;
  const activeLocations = (settings.locations || []).filter((location) => location.active !== false).length;
  const currentMonth = new Date().toISOString().slice(0, 7);
  const photosThisMonth = (db.photos || []).filter((photo) => String(photo.importedAt || '').slice(0, 7) === currentMonth).length;
  const expired = license.status === 'EXPIRED' || license.status === 'SUSPENDED' || (daysLeft !== null && daysLeft < 0);
  const blockers = [expired, activeUsers > license.maxUsers, activeLocations > license.maxLocations, photosThisMonth > license.monthlyPhotoLimit].filter(Boolean).length;
  return { license, daysLeft, activeUsers, activeLocations, photosThisMonth, expired, blockers, ready: blockers === 0 };
}


function buildLicenseUsagePayload(db) {
  const settings = db.settings || {};
  const currentMonth = new Date().toISOString().slice(0, 7);
  const photosThisMonth = (db.photos || []).filter((photo) => String(photo.importedAt || '').slice(0, 7) === currentMonth).length;
  const salesThisMonth = (db.cashierSales || []).filter((sale) => String(sale.createdAt || '').slice(0, 7) === currentMonth && sale.saleStatus !== 'CANCELLED').length;
  const activeUsers = (settings.users || []).filter((user) => user.active !== false).length;
  const activeLocations = (settings.locations || []).filter((location) => location.active !== false).length;
  const cloudSyncedPhotosThisMonth = (db.photos || []).filter((photo) => String(photo.cloudSyncedAt || '').slice(0, 7) === currentMonth).length;
  const openShift = getOpenCashShift(db);
  return {
    month: currentMonth,
    activeUsers,
    activeLocations,
    photosThisMonth,
    cloudSyncedPhotosThisMonth,
    salesThisMonth,
    totalSales: (db.cashierSales || []).filter((sale) => sale.saleStatus !== 'CANCELLED').length,
    totalPhotos: (db.photos || []).length,
    openSessions: (db.sessions || []).filter((session) => session.status !== 'CLOSED').length,
    closedSessions: (db.sessions || []).filter((session) => session.status === 'CLOSED').length,
    cashShiftOpen: Boolean(openShift),
    lastSaleAt: (db.cashierSales || [])[0]?.createdAt || null,
    lastPhotoAt: (db.photos || []).slice().reverse().find((photo) => photo.importedAt)?.importedAt || null
  };
}

function enforcePlanLimitsOnSettings(settings = {}) {
  const license = normalizeLicenseSettings(settings.license || defaultLicenseSettings());
  const limits = licensePlanLimits(license.plan);
  const result = { ...settings, license: { ...license, ...limits, features: { ...limits.features, ...(license.features || {}) } } };
  const warnings = [];

  let users = normalizeUsers(result.users || defaultUsers(), result.users || defaultUsers());
  const activeUsers = users.filter((user) => user.active !== false);
  if (activeUsers.length > result.license.maxUsers) {
    const keep = new Set(activeUsers
      .slice()
      .sort((a, b) => (a.role === 'MANAGER' ? -1 : 1) - (b.role === 'MANAGER' ? -1 : 1))
      .slice(0, result.license.maxUsers)
      .map((user) => user.username));
    users = users.map((user) => user.active === false || keep.has(user.username) ? user : { ...user, active: false });
    warnings.push(`Plano ${result.license.plan}: usuários ativos limitados a ${result.license.maxUsers}.`);
  }
  result.users = users;

  let locations = normalizeLocations(result.locations || [], result);
  const activeLocations = locations.filter((location) => location.active !== false);
  if (activeLocations.length > result.license.maxLocations) {
    const keep = new Set(activeLocations.slice(0, result.license.maxLocations).map((location) => location.id));
    locations = locations.map((location) => location.active === false || keep.has(location.id) ? location : { ...location, active: false });
    warnings.push(`Plano ${result.license.plan}: locais ativos limitados a ${result.license.maxLocations}.`);
  }
  result.locations = locations;

  if (!result.license.features.cloudGallery) {
    result.cloud = { ...defaultCloudSettings(), ...(result.cloud || {}), enabled: false };
  }
  if (!result.license.features.mercadoPago) {
    result.mercadoPago = { ...defaultMercadoPagoSettings(), ...(result.mercadoPago || {}), enabled: false };
  }

  return { settings: result, warnings };
}

function remainingMonthlyPhotoSlots(db) {
  const health = getLicenseHealth(db);
  return Math.max(0, Number(health.license.monthlyPhotoLimit || 0) - Number(health.photosThisMonth || 0));
}

function assertCanCreatePhotos(db, count = 1) {
  const health = getLicenseHealth(db);
  if (health.expired) {
    throw new Error('Licença expirada/suspensa. Valide a licença para continuar capturando fotos.');
  }
  const remaining = remainingMonthlyPhotoSlots(db);
  if (remaining < count) {
    throw new Error(`Limite mensal de fotos do plano ${health.license.plan} atingido. Restam ${remaining} foto(s) neste mês.`);
  }
}

function defaultCommissionSettings() {
  return {
    mode: 'NONE',
    defaultRatePercent: 10,
    individualRates: {},
    collectiveUsernames: [],
    includeManagers: false
  };
}

function normalizeCommissionSettings(input = {}) {
  const mode = input.mode === 'INDIVIDUAL' || input.mode === 'COLLECTIVE' ? input.mode : 'NONE';
  const defaultRate = Number(input.defaultRatePercent ?? defaultCommissionSettings().defaultRatePercent);
  const individualRates = {};
  for (const [username, value] of Object.entries(input.individualRates || {})) {
    const key = String(username || '').trim().toLowerCase();
    const rate = Number(value);
    if (key && Number.isFinite(rate) && rate >= 0) individualRates[key] = Math.min(100, rate);
  }

  return {
    mode,
    defaultRatePercent: Number.isFinite(defaultRate) ? Math.min(100, Math.max(0, defaultRate)) : 10,
    individualRates,
    collectiveUsernames: Array.from(new Set((input.collectiveUsernames || []).map((item) => String(item || '').trim().toLowerCase()).filter(Boolean))),
    includeManagers: Boolean(input.includeManagers)
  };
}

function findUserBySellerName(users = [], sellerName = '') {
  const target = String(sellerName || '').trim().toLowerCase();
  if (!target) return null;
  return users.find((user) => user.active !== false && (String(user.name || '').toLowerCase() === target || String(user.username || '').toLowerCase() === target)) || null;
}

function calculateCommissionForSale(db, sale = {}) {
  const settings = db.settings || {};
  const commission = normalizeCommissionSettings(settings.commission || {});
  const amountBaseCents = Math.max(0, Number(sale.amountBaseCents || 0));
  const users = normalizeUsers(settings.users || defaultUsers(), settings.users || []).filter((user) => user.active !== false);
  const empty = (mode = commission.mode) => ({
    commissionMode: mode,
    commissionBaseCents: 0,
    commissionRatePercent: 0,
    commissionTotalCents: 0,
    commissionSplits: []
  });

  if (commission.mode === 'NONE' || amountBaseCents <= 0) return empty();

  if (commission.mode === 'INDIVIDUAL') {
    const seller = findUserBySellerName(users, sale.sellerName);
    const username = String(seller?.username || sale.sellerName || 'operador').trim().toLowerCase() || 'operador';
    const rate = Number(commission.individualRates?.[username] ?? commission.defaultRatePercent ?? 0);
    const total = Math.round(amountBaseCents * Math.max(0, rate) / 100);
    return {
      commissionMode: 'INDIVIDUAL',
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

  const configured = new Set((commission.collectiveUsernames || []).map((item) => String(item).toLowerCase()));
  let team = users.filter((user) => {
    if (user.role === 'MANAGER' && !commission.includeManagers) return false;
    return configured.size ? configured.has(String(user.username).toLowerCase()) : user.role === 'STAFF';
  });

  if (!team.length) {
    const seller = findUserBySellerName(users, sale.sellerName);
    team = seller ? [seller] : users.filter((user) => user.role === 'STAFF');
  }
  if (!team.length) return empty('COLLECTIVE');

  const rate = Number(commission.defaultRatePercent || 0);
  const total = Math.round(amountBaseCents * Math.max(0, rate) / 100);
  const baseShare = Math.floor(total / team.length);
  let remainder = total - baseShare * team.length;
  const splits = team.map((user) => {
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
    commissionMode: 'COLLECTIVE',
    commissionBaseCents: amountBaseCents,
    commissionRatePercent: rate,
    commissionTotalCents: total,
    commissionSplits: splits
  };
}

function attachCommissionToSale(db, sale) {
  return {
    ...sale,
    ...calculateCommissionForSale(db, sale)
  };
}

function summarizeCommissionFromSales(sales = []) {
  const members = {};
  let totalCommissionCents = 0;
  for (const sale of sales) {
    totalCommissionCents += Number(sale.commissionTotalCents || 0);
    for (const split of sale.commissionSplits || []) {
      const key = split.username || split.name || 'sem_usuario';
      members[key] = members[key] || { username: split.username, name: split.name || key, amountBaseCents: 0, saleCount: 0 };
      members[key].amountBaseCents += Number(split.amountBaseCents || 0);
      members[key].saleCount += 1;
    }
  }
  return { totalCommissionCents, members: Object.values(members).sort((a, b) => b.amountBaseCents - a.amountBaseCents) };
}

function normalizePackages(packages = [], settings = {}) {
  const normalized = [];
  const seen = new Set();

  for (const rawPackage of packages || []) {
    const name = String(rawPackage.name || '').trim();
    if (!name) continue;
    const id = rawPackage.id || makeId('pkg');
    if (seen.has(id)) continue;
    seen.add(id);
    const currency = ['BRL', 'USD', 'EUR', 'PYG', 'ARS'].includes(rawPackage.currency) ? rawPackage.currency : 'BRL';
    const priceCents = Math.max(0, Math.round(Number(rawPackage.priceCents || 0)));
    normalized.push({
      id,
      name,
      locationId: rawPackage.locationId || undefined,
      locationName: String(rawPackage.locationName || settings.locationName || 'Parque Aventura').trim() || 'Parque Aventura',
      photoQuantity: rawPackage.includesAllPhotos ? null : (rawPackage.photoQuantity === null ? null : Number(rawPackage.photoQuantity || 1)),
      includesAllPhotos: Boolean(rawPackage.includesAllPhotos),
      priceCents,
      currency,
      pricingMode: rawPackage.includesAllPhotos || rawPackage.pricingMode === 'FIXED' ? 'FIXED' : 'PER_PHOTO',
      active: rawPackage.active !== false,
      createdAt: rawPackage.createdAt || nowIso()
    });
  }

  if (!normalized.length) return defaultPackages(settings);
  return normalized;
}

function userCanAccessSettings(user) {
  return Boolean(user && (user.role === 'MANAGER' || user.adminPermissions));
}

function userCanManagePermissions(user) {
  return Boolean(user && user.role === 'MANAGER');
}

function makeId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72) || 'sessao';
}

function generateAccessCode(code) {
  const digits = String(code || '').replace(/\D/g, '');
  return (digits || String(Math.floor(1000 + Math.random() * 9000))).slice(-4).padStart(4, '0');
}

function buildPostTourFields(session) {
  const codeSlug = slugify(session.code || makeId('pt'));
  const customerSlug = slugify(session.customerName || 'cliente');
  const publicSlug = session.publicSlug || `${codeSlug}-${customerSlug}`;
  const accessCode = session.accessCode || generateAccessCode(session.code);
  return {
    publicSlug,
    accessCode,
    postTourUrl: session.postTourUrl || `https://galeria.pictour.app/g/${publicSlug}`,
    localGalleryUrl: buildLocalGalleryUrl({ ...session, publicSlug, accessCode })
  };
}

function ensurePostTourFields(session) {
  return {
    ...session,
    ...buildPostTourFields(session)
  };
}


function buildDeliverySlug(sale) {
  const base = slugify(`${sale?.code || 'venda'}-${sale?.sessionCode || 'sessao'}`);
  const suffix = String(sale?.id || makeId('sale')).replace(/[^a-z0-9]/gi, '').slice(-8).toLowerCase();
  return `${base}-${suffix}`;
}

function buildLocalDeliveryUrl(sale) {
  const info = getPublicGalleryInfo();
  const slug = sale.deliverySlug || buildDeliverySlug(sale);
  return `${info.primaryUrl}/d/${encodeURIComponent(slug)}`;
}

function getSalePhotoIds(sale = {}) {
  const ids = new Set(Array.isArray(sale.photoIds) ? sale.photoIds.filter(Boolean) : []);
  for (const item of Array.isArray(sale.saleLineItems) ? sale.saleLineItems : []) {
    if (item?.photoId) ids.add(item.photoId);
  }
  return Array.from(ids);
}

function normalizeSaleDeliveryFields(sale = {}) {
  const normalized = { ...sale };
  const normalizedPhotoIds = getSalePhotoIds(normalized);
  if (normalizedPhotoIds.length) normalized.photoIds = normalizedPhotoIds;
  if (normalizedPhotoIds.length && normalized.saleStatus !== 'CANCELLED') {
    normalized.deliverySlug = normalized.deliverySlug || buildDeliverySlug(normalized);
    normalized.deliveryUrl = buildLocalDeliveryUrl(normalized);
    normalized.deliveryStatus = normalized.deliveryStatus || (normalized.deliveredAt ? 'DELIVERED' : 'PENDING');
  }
  return normalized;
}

function ensureSaleDelivery(db, saleId, options = {}) {
  const expiresInDays = Number(options.expiresInDays || 7);
  let updatedSale = null;
  const generatedAt = nowIso();
  db.cashierSales = (db.cashierSales || []).map((sale) => {
    if (sale.id !== saleId) return sale;
    const next = normalizeSaleDeliveryFields({
      ...sale,
      deliverySlug: sale.deliverySlug || buildDeliverySlug(sale),
      deliveryExpiresAt: sale.deliveryExpiresAt || addDaysIso(Math.max(1, Math.min(60, expiresInDays))),
      deliveryStatus: sale.deliveryStatus || 'PENDING'
    });
    updatedSale = next;
    return next;
  });
  if (!updatedSale) return null;
  addAuditLog(db, {
    category: 'SALE',
    action: 'SALE.DELIVERY_LINK_CREATE',
    severity: 'INFO',
    ...actorFromInput(options, options.operatorName || 'Operador'),
    entityType: 'SALE',
    entityId: updatedSale.id,
    entityLabel: updatedSale.code,
    summary: `Link de entrega criado/atualizado para a venda ${updatedSale.code}.`,
    details: { deliverySlug: updatedSale.deliverySlug, deliveryExpiresAt: updatedSale.deliveryExpiresAt, generatedAt }
  });
  return updatedSale;
}

function getSaleByDeliverySlug(db, deliverySlug) {
  return (db.cashierSales || [])
    .map((sale) => normalizeSaleDeliveryFields(sale))
    .find((sale) => sale.deliverySlug === deliverySlug && sale.saleStatus !== 'CANCELLED');
}

function logDeliveryAccess(db, sale, req, action, photoId) {
  const entry = {
    id: makeId('delivery_log'),
    saleId: sale.id,
    saleCode: sale.code,
    sessionCode: sale.sessionCode,
    action,
    photoId,
    ipAddress: req?.socket?.remoteAddress || '',
    userAgent: String(req?.headers?.['user-agent'] || '').slice(0, 240),
    createdAt: nowIso()
  };
  db.deliveryAccessLogs = [entry, ...(db.deliveryAccessLogs || [])].slice(0, 5000);
  db.cashierSales = (db.cashierSales || []).map((item) => item.id === sale.id ? {
    ...item,
    lastDeliveryAccessAt: entry.createdAt,
    deliveryDownloadCount: Number(item.deliveryDownloadCount || 0) + (action === 'VIEW' ? 0 : 1),
    deliveredAt: action === 'VIEW' ? item.deliveredAt : (item.deliveredAt || entry.createdAt),
    deliveredBy: action === 'VIEW' ? item.deliveredBy : (item.deliveredBy || 'Link de entrega'),
    deliveryStatus: action === 'VIEW' ? (item.deliveryStatus || 'PENDING') : 'DELIVERED'
  } : item);
}


function pathToPreviewUrl(filePath) {
  if (!filePath) return undefined;
  return pathToFileURL(filePath).toString();
}


function defaultChromaAssets() {
  const createdAt = nowIso();
  return [
    {
      id: 'chroma_demo_falls_blue',
      name: 'Cataratas azul oficial',
      description: 'Cenário oficial demonstrativo para operação turística.',
      type: 'SCENARIO',
      locationName: 'Parque Aventura',
      imageUrl: '',
      thumbnailUrl: '',
      isActive: false,
      isDefault: false,
      sortOrder: 1,
      createdAt,
      updatedAt: createdAt,
      createdBy: 'sistema'
    }
  ];
}


function defaultQuickScenarios() {
  const createdAt = nowIso();
  return [
    { id: 'quick_default_cataratas', name: 'Cataratas cinematic', isDefault: true, isActive: true, sortOrder: 1, createdAt, updatedAt: createdAt },
    { id: 'quick_default_selva', name: 'Selva premium', isDefault: true, isActive: true, sortOrder: 2, createdAt, updatedAt: createdAt },
    { id: 'quick_default_barco', name: 'Barco pôr do sol', isDefault: true, isActive: true, sortOrder: 3, createdAt, updatedAt: createdAt },
    { id: 'quick_default_inspector', name: 'Inspector profissional', isDefault: true, isActive: true, sortOrder: 4, createdAt, updatedAt: createdAt }
  ];
}

function normalizeQuickScenarios(scenarios = []) {
  const source = Array.isArray(scenarios) && scenarios.length ? scenarios : defaultQuickScenarios();
  return source
    .filter((scenario) => scenario && typeof scenario === 'object')
    .map((scenario, index) => {
      const now = nowIso();
      return {
        id: String(scenario.id || makeId('quick')),
        name: String(scenario.name || `Cenário rápido ${index + 1}`).trim() || `Cenário rápido ${index + 1}`,
        imageUrl: scenario.imageUrl ? String(scenario.imageUrl) : undefined,
        thumbnailUrl: scenario.thumbnailUrl ? String(scenario.thumbnailUrl) : (scenario.imageUrl ? String(scenario.imageUrl) : undefined),
        isDefault: Boolean(scenario.isDefault),
        isActive: scenario.isActive !== false,
        sortOrder: Number(scenario.sortOrder || index + 1),
        createdAt: scenario.createdAt || now,
        updatedAt: scenario.updatedAt || now
      };
    });
}

function normalizeChromaAssets(assets = []) {
  return (Array.isArray(assets) ? assets : [])
    .filter((asset) => asset && typeof asset === 'object')
    .map((asset, index) => {
      const type = ['SCENARIO', 'TEMPLATE', 'OVERLAY'].includes(asset.type) ? asset.type : 'SCENARIO';
      const now = nowIso();
      return {
        id: String(asset.id || makeId('chroma')),
        name: String(asset.name || `Cenário ${index + 1}`).trim() || `Cenário ${index + 1}`,
        description: asset.description ? String(asset.description) : undefined,
        type,
        locationName: asset.locationName ? String(asset.locationName) : undefined,
        imageUrl: String(asset.imageUrl || ''),
        thumbnailUrl: String(asset.thumbnailUrl || asset.imageUrl || ''),
        width: asset.width ? Number(asset.width) : undefined,
        height: asset.height ? Number(asset.height) : undefined,
        isActive: asset.isActive !== false,
        isDefault: Boolean(asset.isDefault),
        sortOrder: Number(asset.sortOrder || index + 1),
        createdAt: asset.createdAt || now,
        updatedAt: asset.updatedAt || now,
        createdBy: asset.createdBy ? String(asset.createdBy) : undefined
      };
    });
}

function createSeedDatabase() {
  return {
    version: DB_SCHEMA_VERSION,
    migrationInfo: { schemaVersion: DB_SCHEMA_VERSION, lastMigratedAt: nowIso(), migrationLog: ['Banco inicial criado na versão 4.0.'] },
    settings: {
      companyName: 'Parque Aventura',
      locationName: 'Foz do Iguaçu',
      defaultPostTourDays: 7,
      defaultCurrency: 'BRL',
      locations: defaultLocations({ locationName: 'Parque Aventura' }),
      users: defaultUsers(),
      packages: defaultPackages({ locationName: 'Parque Aventura' }),
      exchangeRates: defaultExchangeRates(),
      commission: defaultCommissionSettings(),
      cash: defaultCashSettings(),
      license: defaultLicenseSettings(),
      mercadoPago: defaultMercadoPagoSettings(),
      cloud: defaultCloudSettings(),
      cloudStorage: defaultCloudStorageSettings(),
      photographerPortal: defaultPhotographerPortalSettings(),
      multiStation: defaultMultiStationSettings(),
      antiPrint: defaultAntiPrintSettings(),
      commercialSetup: defaultCommercialSetupSettings(),
      operationChecklist: { completedItemIds: [] },
      updateFeedUrl: 'http://127.0.0.1:8787/api/updates/latest',
      chromaAssets: [],
      quickScenarios: defaultQuickScenarios()
    },
    sessions: [
      {
        id: 'sess_demo_01',
        code: 'PT-4821',
        customerName: 'Família Oliveira',
        locationName: 'Parque Aventura',
        photoCount: 0,
        selectedCount: 0,
        postTourEnabled: true,
        expiresAt: addDaysIso(7),
        publicSlug: 'pt-4821-familia-oliveira',
        accessCode: '4821',
        postTourUrl: 'https://galeria.pictour.app/g/pt-4821-familia-oliveira',
        status: 'OPEN',
        createdAt: nowIso()
      }
    ],
    photos: [],
    cashierSales: [
      { id: 'sale_demo_01', code: 'V-1204', sessionCode: 'PT-4821', sellerName: 'Marina', method: 'MANUAL_PIX', currency: 'BRL', amountCents: 14990, amountBaseCents: 14990, createdAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(), channel: 'DESK' },
      { id: 'sale_demo_02', code: 'V-1205', sessionCode: 'PT-4821', sellerName: 'João', method: 'CASH', currency: 'USD', amountCents: 3000, amountBaseCents: 15000, createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), channel: 'DESK' }
    ],
    onlineCheckouts: [],
    cashShifts: [],
    cashMovements: [],
    auditLogs: [],
    cloudSyncQueue: [],
    deliveryAccessLogs: []
  };
}

function hydrateDatabase(db) {
  const photos = (db.photos || []).map((photo) => ({
    ...photo,
    previewUrl: pathToPreviewUrl(photo.storedPath) || photo.previewUrl,
    selected: Boolean(photo.selected),
    favorite: Boolean(photo.favorite)
  }));

  const sessions = (db.sessions || []).map((session) => {
    const sessionPhotos = photos.filter((photo) => photo.sessionCode === session.code);
    const postTourFields = buildPostTourFields(session);
    return {
      ...session,
      ...postTourFields,
      photoCount: sessionPhotos.length,
      selectedCount: sessionPhotos.filter((photo) => photo.selected).length
    };
  });

  return {
    ...db,
    settings: {
      ...createSeedDatabase().settings,
      ...(db.settings || {}),
      locations: normalizeLocations((db.settings || {}).locations, db.settings || {}),
      users: normalizeUsers((db.settings || {}).users || defaultUsers(), (db.settings || {}).users || []),
      packages: normalizePackages((db.settings || {}).packages || defaultPackages(db.settings || {}), db.settings || {}),
      exchangeRates: normalizeExchangeRates((db.settings || {}).exchangeRates || defaultExchangeRates()),
      commission: normalizeCommissionSettings((db.settings || {}).commission || defaultCommissionSettings()),
      cash: normalizeCashSettings((db.settings || {}).cash || defaultCashSettings()),
      license: normalizeLicenseSettings((db.settings || {}).license || defaultLicenseSettings()),
      defaultCurrency: (db.settings || {}).defaultCurrency || 'BRL',
      mercadoPago: {
        ...defaultMercadoPagoSettings(),
        ...((db.settings || {}).mercadoPago || {})
      },
      cloud: {
        ...defaultCloudSettings(),
        ...((db.settings || {}).cloud || {})
      },
      photographerPortal: {
        ...defaultPhotographerPortalSettings(),
        ...((db.settings || {}).photographerPortal || {})
      },
      multiStation: normalizeMultiStationSettings((db.settings || {}).multiStation || {}),
      antiPrint: normalizeAntiPrintSettings((db.settings || {}).antiPrint || {}),
      commercialSetup: normalizeCommercialSetupSettings((db.settings || {}).commercialSetup || {}),
      operationChecklist: { completedItemIds: [], ...((db.settings || {}).operationChecklist || {}) },
      updateFeedUrl: (db.settings || {}).updateFeedUrl || 'http://127.0.0.1:8787/api/updates/latest',
      chromaAssets: normalizeChromaAssets((db.settings || {}).chromaAssets || []),
      quickScenarios: normalizeQuickScenarios((db.settings || {}).quickScenarios || [])
    },
    sessions,
    photos,
    cashierSales: (db.cashierSales || []).map((sale) => normalizeSaleDeliveryFields({ saleStatus: 'ACTIVE', ...sale })),
    cashShifts: db.cashShifts || [],
    cashMovements: db.cashMovements || [],
    auditLogs: (db.auditLogs || []).slice(0, 5000),
    onlineCheckouts: db.onlineCheckouts || [],
    cloudSyncQueue: db.cloudSyncQueue || [],
    deliveryAccessLogs: db.deliveryAccessLogs || [],
    publicGallery: getPublicGalleryInfo()
  };
}


function compareVersions(a, b) {
  const pa = String(a || '0').split('.').map((part) => Number(part) || 0);
  const pb = String(b || '0').split('.').map((part) => Number(part) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function createMigrationBackup(fromVersion) {
  const dbPath = getDatabasePath();
  if (!fs.existsSync(dbPath)) return undefined;
  const migrationDir = path.join(getDataRoot(), 'migration-backups');
  ensureDir(migrationDir);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(migrationDir, `pictour-db-v${fromVersion || 'old'}-${stamp}.json`);
  fs.copyFileSync(dbPath, backupPath);
  return backupPath;
}

function migrateDatabaseIfNeeded(db) {
  if (!db || typeof db !== 'object') return createSeedDatabase();
  const fromVersion = Number(db.version || 1);
  if (fromVersion >= DB_SCHEMA_VERSION) {
    return {
      ...db,
      version: fromVersion,
      migrationInfo: {
        schemaVersion: fromVersion,
        ...((db || {}).migrationInfo || {})
      }
    };
  }

  let backupPath;
  try {
    backupPath = createMigrationBackup(fromVersion);
  } catch (error) {
    backupPath = undefined;
  }

  const migrationLog = [
    ...(((db || {}).migrationInfo || {}).migrationLog || []),
    `Migração automática de v${fromVersion || 1} para v${DB_SCHEMA_VERSION} em ${nowIso()}.`,
    'Adicionados campos de entrega profissional por link/QR nas vendas.',
    'Adicionada estrutura de atualização e diagnóstico de migração.',
    'Sessões sem status foram normalizadas como abertas.',
    'Mercado Pago real: checkouts aprovados passam a gerar entrega automática e sync cloud importa vendas já liberadas.',
    'BI avançado: adicionada leitura de funil comercial, gargalos, pacotes, canais e entregas.',
    'Multi-estação: sincronização em rede local com estação principal/secundária, snapshot protegido por token e download de arquivos.',
    'Segurança v3.8: adicionadas configurações globais de anti-print, watermark dinâmico, escudo de foco e proteção de preview.',
    'Cloud Admin v4.1: painel administrativo web, visão SaaS executiva, ações rápidas de licença, dispositivos e exportação CSV.',
    'Assinaturas/planos v4.3: política comercial de cobrança e monitor do cliente em grid.',
    'App mobile v4.4: portal completo para fotógrafo com sessão, fila, seleção/favoritos e operação de upload em campo.',
    'v4.6.2: Pagamento dividido no caixa, múltiplas formas de pagamento, troco automático e fechamento por dinheiro físico.'
  ];

  db.version = DB_SCHEMA_VERSION;
  db.migrationInfo = {
    schemaVersion: DB_SCHEMA_VERSION,
    lastMigratedAt: nowIso(),
    lastMigrationFrom: fromVersion,
    lastMigrationBackupPath: backupPath,
    migrationLog: migrationLog.slice(-50)
  };

  db.sessions = (db.sessions || []).map((session) => ({
    ...session,
    status: session.status || 'OPEN'
  }));

  db.cashierSales = (db.cashierSales || []).map((sale) => normalizeSaleDeliveryFields({
    deliveryStatus: sale.deliveredAt ? 'DELIVERED' : 'PENDING',
    receiptCode: sale.receiptCode || `R-${sale.code || String(sale.id || '').slice(-6)}`,
    saleStatus: 'ACTIVE',
    ...sale
  }));

  db.deliveryAccessLogs = db.deliveryAccessLogs || [];

  db.settings = {
    ...(db.settings || {}),
    updateFeedUrl: (db.settings || {}).updateFeedUrl || 'http://127.0.0.1:8787/api/updates/latest',
    antiPrint: normalizeAntiPrintSettings((db.settings || {}).antiPrint || {}),
    commercialSetup: normalizeCommercialSetupSettings((db.settings || {}).commercialSetup || {})
  };

  addAuditLog(db, {
    category: 'SYSTEM',
    action: 'SYSTEM.MIGRATION_AUTO',
    severity: 'CRITICAL',
    actorName: 'Sistema',
    entityType: 'DATABASE',
    entityLabel: `v${fromVersion} → v${DB_SCHEMA_VERSION}`,
    summary: `Banco local migrado automaticamente para o schema ${DB_SCHEMA_VERSION}.`,
    details: { fromVersion, toVersion: DB_SCHEMA_VERSION, backupPath }
  });

  return db;
}

function loadDatabase() {
  ensureDir(getDataRoot());
  ensureDir(getPhotoLibraryPath());

  const dbPath = getDatabasePath();
  if (!fs.existsSync(dbPath)) {
    dbCache = createSeedDatabase();
    saveDatabase(dbCache);
    return hydrateDatabase(dbCache);
  }

  try {
    const raw = fs.readFileSync(dbPath, 'utf-8');
    const parsedDatabase = JSON.parse(raw);
    const previousVersion = Number(parsedDatabase.version || 1);
    dbCache = migrateDatabaseIfNeeded(parsedDatabase);
    if (previousVersion < DB_SCHEMA_VERSION) {
      saveDatabase(dbCache);
    }
    return hydrateDatabase(dbCache);
  } catch (error) {
    const backupPath = `${dbPath}.corrompido-${Date.now()}.bak`;
    if (fs.existsSync(dbPath)) fs.copyFileSync(dbPath, backupPath);
    dbCache = createSeedDatabase();
    saveDatabase(dbCache);
    return hydrateDatabase(dbCache);
  }
}

function saveDatabase(nextDb) {
  ensureDir(getDataRoot());
  const cleanDb = {
    ...nextDb,
    sessions: (nextDb.sessions || []).map(({ localGalleryUrl, ...session }) => session),
    photos: (nextDb.photos || []).map(({ previewUrl, ...photo }) => photo)
  };
  fs.writeFileSync(getDatabasePath(), JSON.stringify(cleanDb, null, 2), 'utf-8');
  dbCache = cleanDb;
  notifyDatabaseChanged();
}

function getMutableDatabase() {
  if (!dbCache) loadDatabase();
  return dbCache;
}

function generateSessionCode(db) {
  const numericCodes = (db.sessions || [])
    .map((session) => Number(String(session.code || '').replace(/\D/g, '')))
    .filter((value) => Number.isFinite(value));
  const nextNumber = Math.max(4820, ...numericCodes) + 1;
  return `PT-${nextNumber}`;
}

function generateSaleCode(db) {
  const numericCodes = (db.cashierSales || [])
    .map((sale) => Number(String(sale.code || '').replace(/\D/g, '')))
    .filter((value) => Number.isFinite(value));
  const nextNumber = Math.max(1200, ...numericCodes) + 1;
  return `V-${nextNumber}`;
}


function generateCashShiftCode(db) {
  const numericCodes = (db.cashShifts || [])
    .map((shift) => Number(String(shift.code || '').replace(/\D/g, '')))
    .filter((value) => Number.isFinite(value));
  const nextNumber = Math.max(100, ...numericCodes) + 1;
  return `CX-${nextNumber}`;
}

function getOpenCashShift(db) {
  return (db.cashShifts || []).find((shift) => shift.status === 'OPEN') || null;
}

function activeSaleAmount(sale) {
  return sale?.saleStatus === 'CANCELLED' ? 0 : Number(sale?.amountBaseCents || 0);
}

function calculateExpectedCashAmount(db, shiftId) {
  const shift = (db.cashShifts || []).find((item) => item.id === shiftId);
  if (!shift) return 0;
  const saleTotal = (db.cashierSales || [])
    .filter((sale) => sale.cashShiftId === shiftId && sale.saleStatus !== 'CANCELLED')
    .reduce((sum, sale) => sum + saleCashDrawerBaseCents(sale), 0);
  const withdrawalTotal = (db.cashMovements || [])
    .filter((movement) => movement.shiftId === shiftId && movement.type === 'WITHDRAWAL')
    .reduce((sum, movement) => sum + Number(movement.amountCents || 0), 0);
  return Number(shift.openingAmountCents || 0) + saleTotal - withdrawalTotal;
}

function restorePhotosIfNoOtherActiveSale(db, sale) {
  const ids = new Set(sale.photoIds || []);
  if (!ids.size) return;
  const stillPurchased = new Set();
  for (const otherSale of db.cashierSales || []) {
    if (otherSale.id === sale.id || otherSale.saleStatus === 'CANCELLED') continue;
    for (const id of otherSale.photoIds || []) stillPurchased.add(id);
  }
  db.photos = (db.photos || []).map((photo) => (
    ids.has(photo.id) && !stillPurchased.has(photo.id)
      ? { ...photo, status: 'READY', selected: false }
      : photo
  ));
}

function openCashShift(input = {}) {
  const db = getMutableDatabase();
  const existing = getOpenCashShift(db);
  if (existing) {
    return { ok: false, message: `Já existe um caixa aberto: ${existing.code}. Feche antes de abrir outro.`, database: loadDatabase() };
  }
  const cashSettings = normalizeCashSettings(db.settings?.cash || defaultCashSettings());
  const openingAmountCents = Math.max(0, Math.round(Number(input.openingAmountCents || 0)));
  if (cashSettings.requireOpeningChangeFund && openingAmountCents <= 0) {
    return { ok: false, message: 'Informe obrigatoriamente o fundo de troco para abrir o caixa.', database: loadDatabase() };
  }
  const shift = {
    id: makeId('shift'),
    code: generateCashShiftCode(db),
    status: 'OPEN',
    openedAt: nowIso(),
    openedBy: input.operatorName || 'Operador',
    openingAmountCents,
    openingChangeFundCents: openingAmountCents,
    recommendedChangeFundCents: cashSettings.recommendedChangeFundCents,
    cashRegisterName: cashSettings.cashRegisterName,
    note: input.note || undefined
  };
  db.cashShifts = [shift, ...(db.cashShifts || [])];
  db.cashMovements = [{
    id: makeId('mov'),
    shiftId: shift.id,
    type: 'OPENING',
    amountCents: shift.openingAmountCents,
    createdAt: shift.openedAt,
    operatorName: shift.openedBy,
    note: shift.note || `Abertura de caixa com fundo de troco de R$ ${(shift.openingAmountCents / 100).toFixed(2)}`
  }, ...(db.cashMovements || [])];
  const differsFromRecommendation = shift.openingAmountCents !== cashSettings.recommendedChangeFundCents;
  const receipt = emitCashReceipt(db, 'OPENING', { shift, operatorName: shift.openedBy, openingAmountCents: shift.openingAmountCents, note: shift.note, createdAt: shift.openedAt });
  addAuditLog(db, { category: 'CASHIER', action: 'CASHIER.OPEN_SHIFT', severity: 'CRITICAL', actorName: shift.openedBy, entityType: 'CASH_SHIFT', entityId: shift.id, entityLabel: shift.code, summary: `Caixa ${shift.code} aberto.`, details: { openingAmountCents: shift.openingAmountCents, recommendedChangeFundCents: cashSettings.recommendedChangeFundCents, differsFromRecommendation, note: shift.note, receiptPath: receipt.filePath, receiptPrinterName: receipt.printerName } });
  saveDatabase(db);
  const baseMessage = differsFromRecommendation ? `Caixa ${shift.code} aberto com fundo diferente do recomendado.` : `Caixa ${shift.code} aberto com fundo de troco recomendado.`;
  return { ok: true, message: `${baseMessage} ${receipt.message || ''}`.trim(), receiptMessage: receipt.message, receiptPath: receipt.filePath, database: loadDatabase() };
}

function registerCashWithdrawal(input = {}) {
  const db = getMutableDatabase();
  const shift = input.shiftId
    ? (db.cashShifts || []).find((item) => item.id === input.shiftId)
    : getOpenCashShift(db);
  if (!shift || shift.status !== 'OPEN') {
    return { ok: false, message: 'Abra um caixa antes de registrar sangria.', database: loadDatabase() };
  }
  const amount = Math.max(0, Math.round(Number(input.amountCents || 0)));
  if (!amount) return { ok: false, message: 'Informe um valor de sangria maior que zero.', database: loadDatabase() };
  const movement = {
    id: makeId('mov'),
    shiftId: shift.id,
    type: 'WITHDRAWAL',
    amountCents: amount,
    createdAt: nowIso(),
    operatorName: input.operatorName || 'Operador',
    note: input.reason || 'Sangria de caixa'
  };
  db.cashMovements = [movement, ...(db.cashMovements || [])];
  const receipt = emitCashReceipt(db, 'WITHDRAWAL', { shift, movement, operatorName: movement.operatorName, amountCents: amount, reason: input.reason, createdAt: movement.createdAt });
  addAuditLog(db, { category: 'CASHIER', action: 'CASHIER.WITHDRAWAL', severity: 'CRITICAL', ...actorFromInput(input, 'Operador'), entityType: 'CASH_SHIFT', entityId: shift.id, entityLabel: shift.code, summary: `Sangria registrada no caixa ${shift.code}.`, details: { amountCents: amount, reason: input.reason, receiptPath: receipt.filePath, receiptPrinterName: receipt.printerName } });
  saveDatabase(db);
  return { ok: true, message: `Sangria registrada no caixa ${shift.code}. ${receipt.message || ''}`.trim(), receiptMessage: receipt.message, receiptPath: receipt.filePath, database: loadDatabase() };
}

function closeCashShift(input = {}) {
  const db = getMutableDatabase();
  const shift = input.shiftId
    ? (db.cashShifts || []).find((item) => item.id === input.shiftId)
    : getOpenCashShift(db);
  if (!shift || shift.status !== 'OPEN') {
    return { ok: false, message: 'Não há caixa aberto para fechar.', database: loadDatabase() };
  }
  const closingAmountCents = Math.max(0, Math.round(Number(input.closingAmountCents || 0)));
  const expectedAmountCents = calculateExpectedCashAmount(db, shift.id);
  const expectedChangeFundCents = Math.max(0, Math.round(Number(shift.openingChangeFundCents ?? shift.openingAmountCents ?? 0)));
  const closingChangeFundCents = Math.max(0, Math.round(Number(input.closingChangeFundCents ?? expectedChangeFundCents)));
  const changeFundDifferenceCents = closingChangeFundCents - expectedChangeFundCents;
  const closedAt = nowIso();
  const shiftChangeOnClose = Boolean(input.shiftChange);
  db.cashShifts = (db.cashShifts || []).map((item) => item.id === shift.id ? {
    ...item,
    status: 'CLOSED',
    closedAt,
    closedBy: input.operatorName || 'Operador',
    closingAmountCents,
    expectedAmountCents,
    differenceCents: closingAmountCents - expectedAmountCents,
    closingChangeFundCents,
    expectedChangeFundCents,
    changeFundDifferenceCents,
    closeNote: input.note || undefined,
    shiftChangeOnClose,
    cashRegisterName: item.cashRegisterName || normalizeCashSettings(db.settings?.cash || defaultCashSettings()).cashRegisterName
  } : item);
  db.cashMovements = [{
    id: makeId('mov'),
    shiftId: shift.id,
    type: 'CLOSE',
    amountCents: closingAmountCents,
    createdAt: closedAt,
    operatorName: input.operatorName || 'Operador',
    note: input.note || `Fechamento de caixa. Fundo contado: R$ ${(closingChangeFundCents / 100).toFixed(2)}`
  }, ...(db.cashMovements || [])];
  const closedShift = (db.cashShifts || []).find((item) => item.id === shift.id) || { ...shift, closedAt, closedBy: input.operatorName || 'Operador', closingAmountCents, expectedAmountCents, differenceCents: closingAmountCents - expectedAmountCents, closingChangeFundCents, expectedChangeFundCents, changeFundDifferenceCents, closeNote: input.note, shiftChangeOnClose };
  const receipt = emitCashReceipt(db, 'CLOSE', { shift: closedShift, operatorName: input.operatorName || 'Operador', closingAmountCents, expectedAmountCents, closingChangeFundCents, note: input.note, createdAt: closedAt });
  addAuditLog(db, { category: 'CASHIER', action: 'CASHIER.CLOSE_SHIFT', severity: 'CRITICAL', ...actorFromInput(input, 'Operador'), entityType: 'CASH_SHIFT', entityId: shift.id, entityLabel: shift.code, summary: `Caixa ${shift.code} fechado.`, details: { closingAmountCents, expectedAmountCents, differenceCents: closingAmountCents - expectedAmountCents, closingChangeFundCents, expectedChangeFundCents, changeFundDifferenceCents, shiftChangeOnClose, note: input.note, receiptPath: receipt.filePath, receiptPrinterName: receipt.printerName } });
  saveDatabase(db);
  const fundMessage = changeFundDifferenceCents === 0 ? 'Fundo de troco conferido.' : `Atenção: fundo de troco com diferença de R$ ${(changeFundDifferenceCents / 100).toFixed(2)}.`;
  const shiftMessage = shiftChangeOnClose ? 'Marcado como troca de turno/caixa.' : 'Sem troca de turno marcada.';
  return { ok: true, message: `Caixa ${shift.code} fechado. Diferença geral: R$ ${((closingAmountCents - expectedAmountCents) / 100).toFixed(2)}. ${fundMessage} ${shiftMessage} ${receipt.message || ''}`.trim(), receiptMessage: receipt.message, receiptPath: receipt.filePath, database: loadDatabase() };
}

function cancelSale(input = {}) {
  const db = getMutableDatabase();
  const sale = (db.cashierSales || []).find((item) => item.id === input.saleId);
  if (!sale) return { ok: false, message: 'Venda não encontrada.', database: loadDatabase() };
  if (sale.saleStatus === 'CANCELLED') return { ok: false, message: 'Esta venda já está cancelada.', database: loadDatabase() };
  const reason = String(input.reason || '').trim();
  if (!reason) return { ok: false, message: 'Informe o motivo do cancelamento.', database: loadDatabase() };
  const cancelledAt = nowIso();
  db.cashierSales = (db.cashierSales || []).map((item) => item.id === sale.id ? {
    ...item,
    saleStatus: 'CANCELLED',
    cancelledAt,
    cancelledBy: input.operatorName || 'Operador',
    cancelReason: reason,
    commissionTotalCents: 0,
    commissionSplits: []
  } : item);
  restorePhotosIfNoOtherActiveSale(db, { ...sale, saleStatus: 'CANCELLED' });
  db.cashMovements = [{
    id: makeId('mov'),
    shiftId: sale.cashShiftId,
    type: 'SALE_CANCEL',
    amountCents: Number(sale.amountBaseCents || 0),
    createdAt: cancelledAt,
    operatorName: input.operatorName || 'Operador',
    note: reason,
    saleId: sale.id,
    saleCode: sale.code
  }, ...(db.cashMovements || [])];
  addAuditLog(db, { category: 'SALE', action: 'SALE.CANCEL', severity: 'CRITICAL', ...actorFromInput(input, 'Operador'), entityType: 'SALE', entityId: sale.id, entityLabel: sale.code, summary: `Venda ${sale.code} cancelada.`, details: { reason, amountBaseCents: sale.amountBaseCents, method: sale.method, photoIds: sale.photoIds || [] } });
  saveDatabase(db);
  return { ok: true, message: `Venda ${sale.code} cancelada.`, database: loadDatabase() };
}


function getSaleSession(db, sale) {
  return (db.sessions || []).find((session) => session.code === sale.sessionCode) || null;
}

function getSalePhotos(db, sale) {
  const ids = new Set(sale.photoIds || []);
  return (db.photos || []).filter((photo) => ids.has(photo.id));
}

function buildSaleReceiptText(db, sale) {
  const session = getSaleSession(db, sale);
  const photos = getSalePhotos(db, sale);
  const settings = db.settings || {};
  const receiptCode = sale.receiptCode || `R-${sale.code}`;
  const lines = [
    `${settings.companyName || 'PicTour'}`,
    'RECIBO DE VENDA DIGITAL',
    '----------------------------------------',
    `Recibo: ${receiptCode}`,
    `Venda: ${sale.code}`,
    `Data: ${new Date(sale.createdAt || nowIso()).toLocaleString('pt-BR')}`,
    `Sessão: ${sale.sessionCode || '—'}`,
    `Cliente: ${session?.customerName || '—'}`,
    `Local: ${session?.locationName || settings.locationName || '—'}`,
    `Vendedor: ${sale.sellerName || '—'}`,
    `Pacote: ${sale.packageName || '—'}`,
    `Método: ${sale.method === 'MIXED' ? 'Pagamento misto' : sale.method || '—'}`,
    `Pagamentos: ${salePaymentSummary(sale) || '—'}`,
    `Total da venda: R$ ${(Number(sale.amountBaseCents || 0) / 100).toFixed(2)}`,
    `Valor pago: R$ ${(Number(sale.paidBaseCents || sale.amountBaseCents || 0) / 100).toFixed(2)}`,
    `Troco: R$ ${(Number(sale.changeBaseCents || 0) / 100).toFixed(2)}`,
    `Status: ${sale.saleStatus === 'CANCELLED' ? 'Cancelada' : 'Ativa'}`,
    `Entrega: ${sale.deliveredAt ? `Entregue em ${new Date(sale.deliveredAt).toLocaleString('pt-BR')} por ${sale.deliveredBy || 'Operador'}` : 'Pendente'}`,
    '----------------------------------------',
    'Fotos compradas:',
    ...(photos.length ? photos.map((photo) => `- ${photo.code} • ${photo.label || photo.originalFileName || photo.id}`) : ['- Nenhuma foto vinculada']),
    '----------------------------------------',
    'Arquivo gerado pelo PicTour Desktop.',
    'Guarde este recibo para conferência de entrega e pós-venda.'
  ];
  return lines.join('\n');
}


function createSaleDelivery(input = {}) {
  const db = getMutableDatabase();
  const sale = (db.cashierSales || []).find((item) => item.id === input.saleId);
  if (!sale) return { ok: false, message: 'Venda não encontrada para gerar link de entrega.', database: loadDatabase() };
  if (!getSalePhotoIds(sale).length) return { ok: false, message: 'Esta venda não tem fotos vinculadas para entrega.', database: loadDatabase() };
  const updatedSale = ensureSaleDelivery(db, sale.id, input);
  saveDatabase(db);
  const hydrated = loadDatabase();
  const finalSale = (hydrated.cashierSales || []).find((item) => item.id === updatedSale.id) || updatedSale;
  return { ok: true, message: `Link de entrega pronto para a venda ${finalSale.code}.`, sale: finalSale, url: finalSale.deliveryUrl, database: hydrated };
}

function openSaleDelivery(input = {}) {
  const db = getMutableDatabase();
  const sale = (db.cashierSales || []).find((item) => item.id === input.saleId);
  if (!sale) return { ok: false, message: 'Venda não encontrada.' };
  const ensured = sale.deliverySlug ? normalizeSaleDeliveryFields(sale) : ensureSaleDelivery(db, sale.id, input);
  if (!ensured) return { ok: false, message: 'Não foi possível gerar a entrega.' };
  saveDatabase(db);
  const url = normalizeSaleDeliveryFields(ensured).deliveryUrl;
  const { shell } = require('electron');
  shell.openExternal(url);
  return { ok: true, url, message: 'Link de entrega aberto no navegador.' };
}

async function exportSaleReceipt(input = {}) {
  const db = getMutableDatabase();
  const sale = (db.cashierSales || []).find((item) => item.id === input.saleId);
  if (!sale) return { ok: false, message: 'Venda não encontrada para gerar recibo.', database: loadDatabase() };
  const receiptCode = sale.receiptCode || `R-${sale.code}`;
  const result = await dialog.showSaveDialog(mainWindow, {
    title: `Salvar recibo ${receiptCode}`,
    defaultPath: `pictour-recibo-${sale.code}.txt`,
    filters: [{ name: 'Recibo de texto', extensions: ['txt'] }]
  });
  if (result.canceled || !result.filePath) return { ok: false, message: 'Exportação de recibo cancelada.', database: loadDatabase() };
  fs.writeFileSync(result.filePath, buildSaleReceiptText(db, { ...sale, receiptCode }), 'utf-8');
  db.cashierSales = (db.cashierSales || []).map((item) => item.id === sale.id ? { ...item, receiptCode, receiptExportedAt: nowIso() } : item);
  addAuditLog(db, { category: 'SALE', action: 'SALE.RECEIPT_EXPORT', severity: 'INFO', ...actorFromInput(input, input.operatorName || 'Operador'), entityType: 'SALE', entityId: sale.id, entityLabel: sale.code, summary: `Recibo da venda ${sale.code} exportado.`, details: { receiptCode, filePath: result.filePath } });
  saveDatabase(db);
  return { ok: true, message: `Recibo ${receiptCode} salvo.`, filePath: result.filePath, database: loadDatabase() };
}

async function exportSalePhotos(input = {}) {
  const db = getMutableDatabase();
  const sale = (db.cashierSales || []).find((item) => item.id === input.saleId);
  if (!sale) return { ok: false, message: 'Venda não encontrada para exportar fotos.', database: loadDatabase() };
  if (sale.saleStatus === 'CANCELLED') return { ok: false, message: 'Venda cancelada não pode ser entregue.', database: loadDatabase() };
  const photos = getSalePhotos(db, sale).filter((photo) => photo.storedPath && fs.existsSync(photo.storedPath));
  if (!photos.length) return { ok: false, message: 'Nenhuma foto dessa venda foi encontrada no computador.', database: loadDatabase() };

  const result = await dialog.showOpenDialog(mainWindow, {
    title: `Escolher pasta para entregar a venda ${sale.code}`,
    properties: ['openDirectory', 'createDirectory']
  });
  if (result.canceled || !result.filePaths.length) return { ok: false, message: 'Entrega cancelada.', database: loadDatabase() };

  const session = getSaleSession(db, sale);
  const baseFolder = result.filePaths[0];
  const exportFolder = path.join(baseFolder, `PicTour-${sale.code}-${slugify(session?.customerName || sale.sessionCode || 'cliente')}`);
  ensureDir(exportFolder);
  let exportedCount = 0;
  photos.forEach((photo, index) => {
    const ext = path.extname(photo.storedPath) || '.jpg';
    const safeLabel = slugify(photo.label || photo.code || `foto-${index + 1}`);
    fs.copyFileSync(photo.storedPath, path.join(exportFolder, `${String(index + 1).padStart(2, '0')}-${photo.code}-${safeLabel}${ext}`));
    exportedCount += 1;
  });

  const { shell } = require('electron');
  await shell.openPath(exportFolder);

  const deliveredAt = nowIso();
  const deliveredBy = input.operatorName || 'Operador';
  db.cashierSales = (db.cashierSales || []).map((item) => item.id === sale.id ? { ...item, deliveryStatus: 'DELIVERED', deliveredAt, deliveredBy } : item);
  addAuditLog(db, { category: 'PHOTO', action: 'SALE.PHOTOS_EXPORT_DELIVER', severity: 'CRITICAL', ...actorFromInput(input, deliveredBy), entityType: 'SALE', entityId: sale.id, entityLabel: sale.code, summary: `${exportedCount} foto(s) da venda ${sale.code} exportada(s) e marcada(s) como entregues.`, details: { exportedCount, folderPath: exportFolder, photoIds: photos.map((photo) => photo.id) } });
  saveDatabase(db);
  return { ok: true, message: `${exportedCount} foto(s) exportada(s). Venda marcada como entregue.`, filePath: exportFolder, database: loadDatabase() };
}

function markSaleDelivered(input = {}) {
  const db = getMutableDatabase();
  const sale = (db.cashierSales || []).find((item) => item.id === input.saleId);
  if (!sale) return loadDatabase();
  if (sale.saleStatus === 'CANCELLED') return loadDatabase();
  const deliveredAt = nowIso();
  const deliveredBy = input.operatorName || 'Operador';
  db.cashierSales = (db.cashierSales || []).map((item) => item.id === sale.id ? { ...item, deliveryStatus: 'DELIVERED', deliveredAt, deliveredBy } : item);
  addAuditLog(db, { category: 'SALE', action: 'SALE.MARK_DELIVERED', severity: 'CRITICAL', ...actorFromInput(input, deliveredBy), entityType: 'SALE', entityId: sale.id, entityLabel: sale.code, summary: `Venda ${sale.code} marcada como entregue.`, details: { deliveredAt, deliveredBy } });
  saveDatabase(db);
  return loadDatabase();
}

async function checkForUpdates() {
  const db = getMutableDatabase();
  const currentVersion = getAppVersion();
  const updateFeedUrl = String(db.settings?.updateFeedUrl || db.settings?.cloud?.apiBaseUrl && `${String(db.settings.cloud.apiBaseUrl).replace(/\/$/, '')}/api/updates/latest` || '').trim();
  let info = {
    currentVersion,
    latestVersion: currentVersion,
    updateAvailable: false,
    releaseNotes: [],
    downloadUrl: '',
    checkedAt: nowIso(),
    source: 'LOCAL',
    message: 'Sem servidor de atualização configurado. App está rodando com a versão local.'
  };

  if (updateFeedUrl && typeof fetch === 'function') {
    try {
      const response = await fetch(updateFeedUrl, { headers: { 'x-pictour-version': currentVersion } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const latestVersion = String(payload.latestVersion || payload.version || currentVersion);
      info = {
        currentVersion,
        latestVersion,
        updateAvailable: compareVersions(latestVersion, currentVersion) > 0,
        releaseNotes: Array.isArray(payload.releaseNotes) ? payload.releaseNotes : [],
        downloadUrl: payload.downloadUrl || '',
        checkedAt: nowIso(),
        source: 'CLOUD',
        message: compareVersions(latestVersion, currentVersion) > 0 ? `Nova versão disponível: ${latestVersion}.` : `PicTour já está atualizado em ${currentVersion}.`
      };
    } catch (error) {
      info.message = `Não consegui verificar atualização: ${error.message || error}`;
    }
  }

  db.settings = { ...(db.settings || {}), lastUpdateCheck: info };
  addAuditLog(db, { category: 'SYSTEM', action: 'SYSTEM.UPDATE_CHECK', severity: info.updateAvailable ? 'WARNING' : 'INFO', actorName: 'Sistema', summary: info.message, details: { currentVersion: info.currentVersion, latestVersion: info.latestVersion, source: info.source, updateAvailable: info.updateAvailable } });
  saveDatabase(db);
  return info;
}

function isImageFile(filePath) {
  return IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function collectImageFiles(paths) {
  const files = [];

  for (const itemPath of paths) {
    if (!fs.existsSync(itemPath)) continue;
    const stat = fs.statSync(itemPath);

    if (stat.isDirectory()) {
      const entries = fs.readdirSync(itemPath);
      for (const entry of entries) {
        const childPath = path.join(itemPath, entry);
        if (fs.existsSync(childPath) && fs.statSync(childPath).isFile() && isImageFile(childPath)) {
          files.push(childPath);
        }
      }
    } else if (stat.isFile() && isImageFile(itemPath)) {
      files.push(itemPath);
    }
  }

  return files;
}

function importPhotoFiles({ sessionCode, files }) {
  const db = getMutableDatabase();
  const session = (db.sessions || []).find((item) => item.code === sessionCode) || (db.sessions || [])[0];
  if (!session) throw new Error('Nenhuma sessão encontrada para importar fotos.');

  const selectedFiles = collectImageFiles(files || []);
  const remaining = remainingMonthlyPhotoSlots(db);
  if (selectedFiles.length && remaining <= 0) {
    addAuditLog(db, { category: 'PHOTO', action: 'PHOTO.IMPORT_BLOCKED_PLAN_LIMIT', severity: 'WARNING', entityType: 'SESSION', entityId: session.id, entityLabel: session.code, summary: `Importação bloqueada: limite mensal de fotos do plano atingido.`, details: { requestedCount: selectedFiles.length, remaining } });
    saveDatabase(db);
    throw new Error('Limite mensal de fotos do plano atingido. Atualize a licença ou aguarde o próximo mês.');
  }
  const filesToImport = selectedFiles.slice(0, remaining);
  const importedPhotos = [];
  const libraryPath = getPhotoLibraryPath();
  ensureDir(libraryPath);

  const currentSessionCount = (db.photos || []).filter((photo) => photo.sessionCode === session.code).length;

  filesToImport.forEach((sourcePath, index) => {
    const ext = path.extname(sourcePath).toLowerCase();
    const photoId = makeId('photo');
    const storedFileName = `${session.code}-${photoId}${ext}`;
    const storedPath = path.join(libraryPath, storedFileName);

    fs.copyFileSync(sourcePath, storedPath);

    const code = `F${String(currentSessionCount + index + 1).padStart(2, '0')}`;
    const photo = {
      id: photoId,
      code,
      label: path.basename(sourcePath, ext),
      sessionCode: session.code,
      status: 'READY',
      kind: 'UPLOAD',
      selected: false,
      favorite: false,
      originalFileName: path.basename(sourcePath),
      storedPath,
      importedAt: nowIso()
    };

    importedPhotos.push(photo);
  });

  db.photos = [...(db.photos || []), ...importedPhotos];
  if (importedPhotos.length) {
    addAuditLog(db, { category: 'PHOTO', action: 'PHOTO.IMPORT', severity: filesToImport.length < selectedFiles.length ? 'WARNING' : 'INFO', entityType: 'SESSION', entityId: session.id, entityLabel: session.code, summary: `${importedPhotos.length} foto(s) importada(s) na sessão ${session.code}.`, details: { sessionCode: session.code, importedCount: importedPhotos.length, skippedByPlanLimit: Math.max(0, selectedFiles.length - filesToImport.length), files: importedPhotos.map((photo) => photo.originalFileName) } });
  }
  saveDatabase(db);

  return {
    importedCount: importedPhotos.length,
    database: loadDatabase()
  };
}


function saveCapturedPhoto({ sessionCode, dataUrl, label }) {
  const db = getMutableDatabase();
  const session = (db.sessions || []).find((item) => item.code === sessionCode) || (db.sessions || [])[0];
  if (!session) throw new Error('Nenhuma sessão encontrada para salvar a captura.');
  assertCanCreatePhotos(db, 1);

  const match = String(dataUrl || '').match(/^data:image\/(png|jpeg|webp);base64,(.+)$/);
  if (!match) throw new Error('Formato da captura inválido.');

  const extension = match[1] === 'jpeg' ? '.jpg' : `.${match[1]}`;
  const buffer = Buffer.from(match[2], 'base64');

  if (!buffer.length) throw new Error('Captura vazia. Tente novamente.');

  const libraryPath = getPhotoLibraryPath();
  ensureDir(libraryPath);

  const currentSessionCount = (db.photos || []).filter((photo) => photo.sessionCode === session.code).length;
  const photoId = makeId('photo');
  const storedFileName = `${session.code}-${photoId}${extension}`;
  const storedPath = path.join(libraryPath, storedFileName);
  fs.writeFileSync(storedPath, buffer);

  const code = `F${String(currentSessionCount + 1).padStart(2, '0')}`;
  const photo = {
    id: photoId,
    code,
    label: label || `Captura ${code}`,
    sessionCode: session.code,
    status: 'READY',
    kind: 'CAMERA',
    selected: false,
    favorite: false,
    originalFileName: storedFileName,
    storedPath,
    importedAt: nowIso()
  };

  db.photos = [...(db.photos || []), photo];
  addAuditLog(db, { category: 'PHOTO', action: 'PHOTO.CAMERA_CAPTURE', severity: 'INFO', entityType: 'PHOTO', entityId: photo.id, entityLabel: `${session.code} ${code}`, summary: `Foto ${code} capturada na sessão ${session.code}.`, details: { sessionCode: session.code, kind: photo.kind, label: photo.label } });
  saveDatabase(db);

  return {
    photoId,
    photoCode: code,
    database: loadDatabase()
  };
}


function getMimeTypeForExtension(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.bmp') return 'image/bmp';
  return 'image/png';
}

function readPhotoDataUrl(photoId) {
  const db = getMutableDatabase();
  const photo = (db.photos || []).find((item) => item.id === photoId);
  if (!photo) throw new Error('Foto não encontrada.');
  if (!photo.storedPath || !fs.existsSync(photo.storedPath)) {
    throw new Error('Arquivo original da foto não encontrado no computador.');
  }

  const buffer = fs.readFileSync(photo.storedPath);
  const mimeType = getMimeTypeForExtension(photo.storedPath);
  return {
    photoId,
    dataUrl: `data:${mimeType};base64,${buffer.toString('base64')}`
  };
}

function saveChromaRender({ sessionCode, sourcePhotoId, dataUrl, backgroundName, composition }) {
  const db = getMutableDatabase();
  const session = (db.sessions || []).find((item) => item.code === sessionCode) || (db.sessions || [])[0];
  if (!session) throw new Error('Nenhuma sessão encontrada para salvar a composição.');
  assertCanCreatePhotos(db, 1);

  const sourcePhoto = (db.photos || []).find((item) => item.id === sourcePhotoId);
  if (!sourcePhoto) throw new Error('Foto de origem não encontrada.');

  const match = String(dataUrl || '').match(/^data:image\/(png|jpeg|webp);base64,(.+)$/);
  if (!match) throw new Error('Render do chroma inválido.');

  const extension = match[1] === 'jpeg' ? '.jpg' : `.${match[1]}`;
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length) throw new Error('Render do chroma vazio. Tente novamente.');

  const libraryPath = getPhotoLibraryPath();
  ensureDir(libraryPath);

  const currentSessionCount = (db.photos || []).filter((photo) => photo.sessionCode === session.code).length;
  const photoId = makeId('photo');
  const storedFileName = `${session.code}-${photoId}-chroma${extension}`;
  const storedPath = path.join(libraryPath, storedFileName);
  fs.writeFileSync(storedPath, buffer);

  const code = `F${String(currentSessionCount + 1).padStart(2, '0')}`;
  const photo = {
    id: photoId,
    code,
    label: `Chroma ${sourcePhoto.code}`,
    sessionCode: session.code,
    status: 'READY',
    kind: 'CHROMA',
    backgroundName: backgroundName || composition?.backgroundName || 'Cenário PicTour',
    sourcePhotoId,
    composition: {
      ...(composition || {}),
      mode: 'CHROMA',
      sourcePhotoId,
      backgroundName: backgroundName || composition?.backgroundName || 'Cenário PicTour',
      renderedAt: nowIso()
    },
    selected: false,
    favorite: false,
    originalFileName: storedFileName,
    storedPath,
    importedAt: nowIso()
  };

  db.photos = [...(db.photos || []), photo];
  addAuditLog(db, { category: 'PHOTO', action: 'PHOTO.CHROMA_RENDER', severity: 'INFO', entityType: 'PHOTO', entityId: photo.id, entityLabel: `${session.code} ${code}`, summary: `Chroma ${code} renderizado na sessão ${session.code}.`, details: { sessionCode: session.code, sourcePhotoId, backgroundName: photo.backgroundName, segmentationMode: photo.composition?.segmentationMode } });
  saveDatabase(db);

  return {
    photoId,
    photoCode: code,
    database: loadDatabase()
  };
}


async function exportPurchasedPhotos({ sessionCode, photoIds } = {}) {
  const db = getMutableDatabase();
  const session = (db.sessions || []).find((item) => item.code === sessionCode) || (db.sessions || [])[0];
  if (!session) throw new Error('Sessão não encontrada para exportar fotos.');

  const idFilter = Array.isArray(photoIds) && photoIds.length ? new Set(photoIds) : null;
  const purchasedPhotos = (db.photos || []).filter((photo) => {
    if (photo.sessionCode !== session.code) return false;
    if (photo.status !== 'PURCHASED') return false;
    if (idFilter && !idFilter.has(photo.id)) return false;
    return Boolean(photo.storedPath && fs.existsSync(photo.storedPath));
  });

  if (!purchasedPhotos.length) {
    return { canceled: false, exportedCount: 0 };
  }

  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Escolher pasta para salvar fotos compradas',
    properties: ['openDirectory', 'createDirectory']
  });

  if (result.canceled || !result.filePaths.length) {
    return { canceled: true, exportedCount: 0 };
  }

  const baseFolder = result.filePaths[0];
  const safeSessionName = slugify(`${session.code}-${session.customerName || 'cliente'}`);
  const exportFolder = path.join(baseFolder, `PicTour-${safeSessionName}`);
  ensureDir(exportFolder);

  let exportedCount = 0;
  purchasedPhotos.forEach((photo, index) => {
    const ext = path.extname(photo.storedPath) || '.jpg';
    const safeLabel = slugify(photo.label || photo.code || `foto-${index + 1}`);
    const fileName = `${String(index + 1).padStart(2, '0')}-${photo.code}-${safeLabel}${ext}`;
    fs.copyFileSync(photo.storedPath, path.join(exportFolder, fileName));
    exportedCount += 1;
  });

  const { shell } = require('electron');
  await shell.openPath(exportFolder);

  addAuditLog(db, { category: 'PHOTO', action: 'PHOTO.EXPORT_PURCHASED', severity: 'INFO', entityType: 'SESSION', entityId: session.id, entityLabel: session.code, summary: `${exportedCount} foto(s) comprada(s) exportada(s) da sessão ${session.code}.`, details: { exportedCount, folderPath: exportFolder, photoIds: purchasedPhotos.map((photo) => photo.id) } });
  saveDatabase(db);

  return {
    canceled: false,
    exportedCount,
    folderPath: exportFolder
  };
}


function sanitizeCloudSettings(settings = {}) {
  const cloud = settings.cloud || {};
  const rawStorage = settings.cloudStorage || cloud.storage || {};
  const storage = {
    ...defaultCloudStorageSettings(),
    ...rawStorage,
    driver: ['local', 's3', 'r2'].includes(rawStorage.driver) ? rawStorage.driver : 'local',
    bucket: String(rawStorage.bucket || '').trim(),
    endpoint: String(rawStorage.endpoint || '').trim(),
    publicBaseUrl: String(rawStorage.publicBaseUrl || defaultCloudStorageSettings().publicBaseUrl).replace(/\/$/, ''),
    signedDownloadTtlSeconds: Math.max(60, Number(rawStorage.signedDownloadTtlSeconds || 900)),
    keepOriginalsPrivate: rawStorage.keepOriginalsPrivate !== false,
    lastHealthCheckAt: rawStorage.lastHealthCheckAt,
    lastHealthMessage: rawStorage.lastHealthMessage
  };
  return {
    ...settings,
    cloudStorage: storage,
    cloud: {
      ...defaultCloudSettings(),
      ...cloud,
      storage,
      enabled: Boolean(cloud.enabled),
      apiBaseUrl: String(cloud.apiBaseUrl || defaultCloudSettings().apiBaseUrl).replace(/\/$/, ''),
      apiKey: String(cloud.apiKey || '').trim(),
      publicGalleryBaseUrl: String(cloud.publicGalleryBaseUrl || cloud.apiBaseUrl || defaultCloudSettings().publicGalleryBaseUrl).replace(/\/$/, '')
    }
  };
}

function sanitizeMercadoPagoSettings(settings = {}) {
  const mp = settings.mercadoPago || {};
  return {
    ...settings,
    mercadoPago: {
      ...defaultMercadoPagoSettings(),
      ...mp,
      enabled: Boolean(mp.enabled),
      environment: mp.environment === 'production' ? 'production' : 'sandbox',
      publicKey: String(mp.publicKey || '').trim(),
      accessToken: String(mp.accessToken || '').trim(),
      webhookUrl: String(mp.webhookUrl || '').trim(),
      webhookSecret: String(mp.webhookSecret || '').trim(),
      autoReleaseDelivery: mp.autoReleaseDelivery !== false,
      successUrl: String(mp.successUrl || defaultMercadoPagoSettings().successUrl).trim(),
      failureUrl: String(mp.failureUrl || defaultMercadoPagoSettings().failureUrl).trim(),
      pendingUrl: String(mp.pendingUrl || defaultMercadoPagoSettings().pendingUrl).trim()
    }
  };
}

function updateSettings(input = {}) {
  const db = getMutableDatabase();
  const current = sanitizeCloudSettings(sanitizeMercadoPagoSettings(db.settings || createSeedDatabase().settings));
  const currentUsers = normalizeUsers(current.users || defaultUsers(), current.users || []);
  const actor = currentUsers.find((user) => user.username === String(input.actorUsername || '').toLowerCase());
  const canManageUsers = userCanManagePermissions(actor);

  const mergedMercadoPago = input.mercadoPago
    ? { ...(current.mercadoPago || defaultMercadoPagoSettings()), ...input.mercadoPago }
    : (current.mercadoPago || defaultMercadoPagoSettings());

  const mergedCloud = input.cloud
    ? { ...(current.cloud || defaultCloudSettings()), ...input.cloud }
    : (current.cloud || defaultCloudSettings());

  const nextSettings = {
    ...current,
    ...input,
    actorUsername: undefined,
    defaultPostTourDays: Number(input.defaultPostTourDays || current.defaultPostTourDays || 7),
    mercadoPago: mergedMercadoPago,
    cloud: mergedCloud,
    locations: normalizeLocations(input.locations || current.locations || [], input || current),
    packages: normalizePackages(input.packages || current.packages || [], input || current),
    chromaAssets: normalizeChromaAssets(input.chromaAssets || current.chromaAssets || []),
    quickScenarios: normalizeQuickScenarios(input.quickScenarios || current.quickScenarios || []),
    exchangeRates: normalizeExchangeRates(input.exchangeRates || current.exchangeRates || {}),
    commission: normalizeCommissionSettings(input.commission || current.commission || defaultCommissionSettings()),
    cash: normalizeCashSettings(input.cash || current.cash || defaultCashSettings()),
    photographerPortal: { ...defaultPhotographerPortalSettings(), ...(input.photographerPortal || current.photographerPortal || {}) },
    multiStation: normalizeMultiStationSettings(input.multiStation || current.multiStation || defaultMultiStationSettings()),
    commercialSetup: normalizeCommercialSetupSettings(input.commercialSetup || current.commercialSetup || defaultCommercialSetupSettings()),
    license: normalizeLicenseSettings(input.license || current.license || defaultLicenseSettings())
  };

  if (input.users && canManageUsers) {
    nextSettings.users = normalizeUsers(input.users, currentUsers);
  } else {
    nextSettings.users = currentUsers;
  }

  delete nextSettings.actorUsername;
  const enforced = enforcePlanLimitsOnSettings(nextSettings);
  db.settings = sanitizeCloudSettings(sanitizeMercadoPagoSettings(enforced.settings));
  addAuditLog(db, { category: 'SETTINGS', action: 'SETTINGS.UPDATE', severity: 'CRITICAL', ...actorFromInput(input, 'Gestor/adm'), entityType: 'SETTINGS', entityLabel: db.settings.companyName || 'Configurações', summary: 'Configurações do PicTour foram atualizadas.', details: { changedKeys: Object.keys(input || {}).filter((key) => key !== 'actorUsername'), usersChanged: Boolean(input.users && canManageUsers), locations: (db.settings.locations || []).length, packages: (db.settings.packages || []).length, chromaAssets: (db.settings.chromaAssets || []).length, quickScenarios: (db.settings.quickScenarios || []).length, commissionMode: db.settings.commission?.mode, cashRecommendedChangeFundCents: db.settings.cash?.recommendedChangeFundCents, licensePlan: db.settings.license?.plan, licenseStatus: db.settings.license?.status, planLimitWarnings: enforced.warnings } });
  if (enforced.warnings.length) {
    addAuditLog(db, { category: 'SETTINGS', action: 'LICENSE.PLAN_LIMITS_APPLIED', severity: 'WARNING', ...actorFromInput(input, 'Gestor/adm'), entityType: 'LICENSE', entityLabel: db.settings.license?.plan, summary: enforced.warnings.join(' '), details: { warnings: enforced.warnings, maxUsers: db.settings.license?.maxUsers, maxLocations: db.settings.license?.maxLocations } });
  }
  saveDatabase(db);
  return loadDatabase();
}


function changeUserPassword(input = {}) {
  const db = getMutableDatabase();
  const users = normalizeUsers((db.settings || {}).users || defaultUsers(), (db.settings || {}).users || []);
  const username = String(input.username || '').trim().toLowerCase();
  const currentPassword = String(input.currentPassword || '');
  const newPassword = String(input.newPassword || '');
  const user = users.find((item) => item.username === username && item.active !== false);

  if (!user) return { ok: false, message: 'Usuário não encontrado.' };
  if (user.passwordHash !== hashPassword(currentPassword)) return { ok: false, message: 'Senha atual inválida.' };
  if (newPassword.length < 8) return { ok: false, message: 'A nova senha precisa ter pelo menos 8 caracteres.' };
  if (hashPassword(newPassword) === hashPassword('admin12345') && username === 'admin') {
    return { ok: false, message: 'Troque a senha padrão por uma senha própria da empresa.' };
  }

  const nextUsers = users.map((item) => item.id === user.id
    ? { ...item, passwordHash: hashPassword(newPassword), forcePasswordChange: false }
    : item
  );

  db.settings = {
    ...(db.settings || createSeedDatabase().settings),
    users: nextUsers
  };
  addAuditLog(db, { category: 'AUTH', action: 'AUTH.PASSWORD_CHANGED', severity: 'CRITICAL', actorName: user.name, actorUsername: user.username, entityType: 'USER', entityId: user.id, entityLabel: user.username, summary: `${user.name} alterou a própria senha.`, details: { forcedPasswordChangeWas: user.forcePasswordChange } });
  saveDatabase(db);
  const updatedUser = nextUsers.find((item) => item.id === user.id);
  return { ok: true, message: 'Senha alterada com sucesso.', user: publicUser(updatedUser), database: loadDatabase() };
}

function exportBackup() {
  const db = getMutableDatabase();
  const photoFiles = [];

  for (const photo of db.photos || []) {
    if (!photo.storedPath || !fs.existsSync(photo.storedPath)) continue;
    try {
      photoFiles.push({
        photoId: photo.id,
        fileName: path.basename(photo.storedPath),
        dataBase64: fs.readFileSync(photo.storedPath).toString('base64')
      });
    } catch (error) {
      // Se uma foto falhar, o backup do banco ainda continua. Melhor parcial do que nada no balcão.
    }
  }

  return dialog.showSaveDialog(mainWindow, {
    title: 'Salvar backup PicTour',
    defaultPath: `pictour-backup-${new Date().toISOString().slice(0, 10)}.pictour-backup.json`,
    filters: [{ name: 'Backup PicTour', extensions: ['json'] }]
  }).then((result) => {
    if (result.canceled || !result.filePath) return { canceled: true, message: 'Backup cancelado.' };
    const payload = {
      type: 'PICTOUR_BACKUP',
      version: 1,
      exportedAt: nowIso(),
      database: db,
      photoFiles
    };
    fs.writeFileSync(result.filePath, JSON.stringify(payload, null, 2), 'utf-8');
    db.settings = db.settings || {};
    db.settings.commercialSetup = normalizeCommercialSetupSettings({
      ...(db.settings.commercialSetup || {}),
      lastBackupAt: nowIso(),
      lastBackupPath: result.filePath,
      completedStepIds: [...new Set([...(db.settings.commercialSetup?.completedStepIds || []), 'BACKUP'])]
    });
    addAuditLog(db, { category: 'BACKUP', action: 'BACKUP.EXPORT', severity: 'CRITICAL', actorName: 'Operador', summary: `Backup exportado com ${photoFiles.length} foto(s).`, details: { photoCount: photoFiles.length, filePath: result.filePath } });
    saveDatabase(db);
    return { canceled: false, message: `Backup salvo com ${photoFiles.length} foto(s).`, filePath: result.filePath };
  });
}

async function restoreBackup() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Restaurar backup PicTour',
    properties: ['openFile'],
    filters: [{ name: 'Backup PicTour', extensions: ['json'] }]
  });

  if (result.canceled || !result.filePaths.length) return { canceled: true, message: 'Restauração cancelada.', database: loadDatabase() };

  const raw = fs.readFileSync(result.filePaths[0], 'utf-8');
  const payload = JSON.parse(raw);
  if (payload.type !== 'PICTOUR_BACKUP' || !payload.database) {
    throw new Error('Arquivo de backup inválido para o PicTour.');
  }

  ensureDir(getDataRoot());
  ensureDir(getPhotoLibraryPath());
  const restoredDb = payload.database;
  const restoredPathByPhoto = new Map();

  for (const file of payload.photoFiles || []) {
    if (!file.photoId || !file.fileName || !file.dataBase64) continue;
    const safeFileName = path.basename(file.fileName);
    const targetPath = path.join(getPhotoLibraryPath(), safeFileName);
    fs.writeFileSync(targetPath, Buffer.from(file.dataBase64, 'base64'));
    restoredPathByPhoto.set(file.photoId, targetPath);
  }

  restoredDb.photos = (restoredDb.photos || []).map((photo) => ({
    ...photo,
    storedPath: restoredPathByPhoto.get(photo.id) || photo.storedPath,
    previewUrl: undefined
  }));

  restoredDb.settings = {
    ...createSeedDatabase().settings,
    ...(restoredDb.settings || {}),
    users: normalizeUsers((restoredDb.settings || {}).users || defaultUsers(), (restoredDb.settings || {}).users || []),
    commercialSetup: normalizeCommercialSetupSettings({
      ...((restoredDb.settings || {}).commercialSetup || {}),
      lastRestoreAt: nowIso()
    })
  };

  addAuditLog(restoredDb, { category: 'BACKUP', action: 'BACKUP.RESTORE', severity: 'CRITICAL', actorName: 'Operador', summary: 'Backup restaurado no PicTour local.', details: { filePath: result.filePaths[0], restoredPhotoFiles: (payload.photoFiles || []).length } });
  saveDatabase(restoredDb);
  return { canceled: false, message: 'Backup restaurado. Dados locais recarregados.', database: loadDatabase() };
}

function csvEscape(value) {
  const text = String(value ?? '');
  if (/[";\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}


async function exportAuditLogsCsv(input = {}) {
  const logs = Array.isArray(input.logs) ? input.logs : (getMutableDatabase().auditLogs || []);
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Exportar auditoria em CSV',
    defaultPath: `pictour-auditoria-${new Date().toISOString().slice(0, 10)}.csv`,
    filters: [{ name: 'CSV', extensions: ['csv'] }]
  });
  if (result.canceled || !result.filePath) return { canceled: true, message: 'Exportação de auditoria cancelada.' };
  const header = ['Data/hora', 'Severidade', 'Categoria', 'Ação', 'Usuário', 'Login', 'Entidade', 'Resumo', 'Detalhes', 'Dispositivo', 'Versão'];
  const rows = logs.map((log) => [
    log.createdAt || '', log.severity || 'INFO', log.category || 'SYSTEM', log.action || '', log.actorName || '', log.actorUsername || '',
    [log.entityType, log.entityLabel || log.entityId].filter(Boolean).join(' '), log.summary || '', JSON.stringify(log.details || {}), log.deviceName || '', log.appVersion || ''
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvEscape).join(';')).join('\n');
  fs.writeFileSync(result.filePath, `\ufeff${csv}`, 'utf-8');
  const db = getMutableDatabase();
  addAuditLog(db, { category: 'SYSTEM', action: 'AUDIT.EXPORT_CSV', severity: 'INFO', actorName: input.actorName || 'Operador', actorUsername: input.actorUsername, summary: `${logs.length} registro(s) de auditoria exportados em CSV.`, details: { logCount: logs.length, filePath: result.filePath } });
  saveDatabase(db);
  return { canceled: false, message: `${logs.length} registro(s) de auditoria exportado(s) em CSV.`, filePath: result.filePath };
}

async function exportCashierCsv(input = {}) {
  const db = getMutableDatabase();
  const rawSales = Array.isArray(input.sales) ? input.sales : [];
  const sales = rawSales.map((sale) => sale.commissionMode ? sale : attachCommissionToSale(db, sale));
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Exportar vendas do caixa em CSV',
    defaultPath: `pictour-caixa-${new Date().toISOString().slice(0, 10)}.csv`,
    filters: [{ name: 'CSV', extensions: ['csv'] }]
  });
  if (result.canceled || !result.filePath) return { canceled: true, message: 'Exportação cancelada.' };

  const header = ['Status', 'Data/hora', 'Venda', 'Sessão', 'Vendedor', 'Canal', 'Método', 'Pagamentos', 'MoedaPrincipal', 'RecebidoCentavos', 'PagoBaseBRLCentavos', 'TrocoBaseBRLCentavos', 'BaseBRLCentavos', 'CaixaId', 'CanceladoEm', 'CanceladoPor', 'MotivoCancelamento', 'ComissaoModo', 'ComissaoCentavos', 'ComissaoDivisao'];
  const rows = sales.map((sale) => [
    sale.saleStatus || 'ACTIVE', sale.createdAt, sale.code, sale.sessionCode || '', sale.sellerName || '', sale.channel || 'DESK', sale.method, salePaymentSummary(sale), sale.currency, sale.amountCents, sale.paidBaseCents || sale.amountBaseCents, sale.changeBaseCents || 0, sale.amountBaseCents, sale.cashShiftId || '', sale.cancelledAt || '', sale.cancelledBy || '', sale.cancelReason || '', sale.commissionMode || '', sale.saleStatus === 'CANCELLED' ? 0 : (sale.commissionTotalCents || 0), JSON.stringify(sale.saleStatus === 'CANCELLED' ? [] : (sale.commissionSplits || []))
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvEscape).join(';')).join('\n');
  fs.writeFileSync(result.filePath, `\ufeff${csv}`, 'utf-8');
  addAuditLog(db, { category: 'CASHIER', action: 'CASHIER.EXPORT_CSV', severity: 'INFO', actorName: input.operator || 'Operador', summary: `${sales.length} venda(s) exportada(s) em CSV.`, details: { saleCount: sales.length, filePath: result.filePath } });
  saveDatabase(db);
  return { canceled: false, message: `${sales.length} venda(s) exportada(s) em CSV.`, filePath: result.filePath };
}

async function createCashCloseReport(input = {}) {
  const db = getMutableDatabase();
  const rawSales = Array.isArray(input.sales) ? input.sales : [];
  const sales = rawSales.map((sale) => sale.commissionMode ? sale : attachCommissionToSale(db, sale));
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Salvar fechamento de caixa',
    defaultPath: `pictour-fechamento-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`,
    filters: [{ name: 'Fechamento PicTour', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePath) return { canceled: true, message: 'Fechamento cancelado.' };

  const totalsByMethod = {};
  const totalsByCurrency = {};
  const totalsBySeller = {};
  const activeSales = sales.filter((sale) => sale.saleStatus !== 'CANCELLED');
  let totalBaseCents = 0;
  for (const sale of activeSales) {
    totalBaseCents += Number(sale.amountBaseCents || 0);
    for (const tender of getSaleTenders(sale)) {
      totalsByMethod[tender.method || 'OUTRO'] = (totalsByMethod[tender.method || 'OUTRO'] || 0) + Number(tender.amountBaseCents || 0);
      totalsByCurrency[tender.currency || 'BRL'] = (totalsByCurrency[tender.currency || 'BRL'] || 0) + Number(tender.amountCents || 0);
    }
    totalsBySeller[sale.sellerName || 'Sem vendedor'] = (totalsBySeller[sale.sellerName || 'Sem vendedor'] || 0) + Number(sale.amountBaseCents || 0);
  }

  const commissionSummary = summarizeCommissionFromSales(activeSales);
  const openShift = getOpenCashShift(db);
  const relatedShiftIds = Array.from(new Set(sales.map((sale) => sale.cashShiftId).filter(Boolean)));
  const shifts = (db.cashShifts || []).filter((shift) => relatedShiftIds.includes(shift.id) || (openShift && shift.id === openShift.id));
  const movements = (db.cashMovements || []).filter((movement) => shifts.some((shift) => shift.id === movement.shiftId));

  const report = {
    type: 'PICTOUR_CASH_CLOSE',
    version: 1,
    closedAt: nowIso(),
    operator: input.operator || 'Operador',
    filters: input.filters || {},
    saleCount: activeSales.length,
    cancelledSaleCount: sales.length - activeSales.length,
    totalBaseCents,
    totalsByMethod,
    totalsByCurrency,
    totalsBySeller,
    commissionSummary,
    shifts,
    movements,
    sales
  };

  fs.writeFileSync(result.filePath, JSON.stringify(report, null, 2), 'utf-8');
  addAuditLog(db, { category: 'CASHIER', action: 'CASHIER.CLOSE_REPORT_EXPORT', severity: 'INFO', actorName: input.operator || 'Operador', summary: `Relatório de fechamento exportado com ${sales.length} venda(s).`, details: { filePath: result.filePath, saleCount: sales.length, totalBaseCents, filters: input.filters || {} } });
  saveDatabase(db);
  return { canceled: false, message: `Fechamento salvo com ${sales.length} venda(s).`, filePath: result.filePath };
}


function demoMinutesAgo(minutes) {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

function demoDaysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function demoDaysFromNow(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function demoPreviewUrl(label = 'PicTour Demo', code = 'F01', hue = 210) {
  const bg1 = `hsl(${hue}, 76%, 28%)`;
  const bg2 = `hsl(${(hue + 52) % 360}, 86%, 52%)`;
  const accent = `hsl(${(hue + 120) % 360}, 94%, 64%)`;
  const safeLabel = String(label).replace(/[<&>]/g, '');
  const safeCode = String(code).replace(/[<&>]/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
    <defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/></linearGradient><radialGradient id="r" cx="70%" cy="18%" r="70%"><stop offset="0" stop-color="white" stop-opacity="0.22"/><stop offset="1" stop-color="white" stop-opacity="0"/></radialGradient></defs>
    <rect width="1280" height="720" fill="url(#g)"/><rect width="1280" height="720" fill="url(#r)"/><circle cx="1030" cy="145" r="110" fill="${accent}" opacity="0.28"/><circle cx="101" cy="620" r="170" fill="#000" opacity="0.16"/><path d="M0 560 C240 485 410 650 650 560 C870 480 1050 430 1280 505 L1280 720 L0 720 Z" fill="#03111f" opacity="0.62"/><rect x="72" y="72" width="1136" height="576" rx="46" fill="#020617" opacity="0.18" stroke="white" stroke-opacity="0.22" stroke-width="2"/><text x="96" y="126" fill="white" font-family="Arial, sans-serif" font-size="30" font-weight="800" opacity="0.86">PICTOUR DEMO</text><text x="96" y="366" fill="white" font-family="Arial, sans-serif" font-size="68" font-weight="900">${safeLabel}</text><text x="96" y="424" fill="white" font-family="Arial, sans-serif" font-size="30" font-weight="700" opacity="0.82">${safeCode} • Preview horizontal 16:9</text><text x="96" y="592" fill="white" font-family="Arial, sans-serif" font-size="22" font-weight="700" opacity="0.72">Imagem fictícia para demonstração comercial</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function buildCommercialDemoPayload(currentDb = {}) {
  const settings = currentDb.settings || {};
  const companyName = settings.companyName && settings.companyName !== 'Parque Aventura' ? settings.companyName : 'PicTour Demo Park';
  const locationName = settings.locationName && settings.locationName !== 'Foz do Iguaçu' ? settings.locationName : 'Foz do Iguaçu';
  const locations = [
    { id: 'loc_demo_cataratas', name: 'Cataratas View', active: true, createdAt: demoDaysAgo(30) },
    { id: 'loc_demo_passeio', name: 'Passeio Premium', active: true, createdAt: demoDaysAgo(30) },
    { id: 'loc_demo_chroma', name: 'Estúdio Chroma', active: true, createdAt: demoDaysAgo(30) }
  ];
  const sessions = [
    { id: 'sess_demo_01', code: 'PT-7601', customerName: 'Família Oliveira', locationName: 'Cataratas View', photoCount: 16, selectedCount: 6, postTourEnabled: true, expiresAt: demoDaysFromNow(2), publicSlug: 'pt-7601-familia-oliveira', accessCode: '7601', postTourUrl: 'https://galeria.pictour.app/g/pt-7601-familia-oliveira', localGalleryUrl: 'http://127.0.0.1:3888/g/pt-7601-familia-oliveira', cloudGalleryUrl: 'https://galeria.pictour.app/g/pt-7601-familia-oliveira', cloudPublishedAt: demoMinutesAgo(32), status: 'OPEN', createdAt: demoMinutesAgo(95) },
    { id: 'sess_demo_02', code: 'PT-7602', customerName: 'Casal Mendoza', locationName: 'Passeio Premium', photoCount: 10, selectedCount: 4, postTourEnabled: true, expiresAt: demoDaysFromNow(3), publicSlug: 'pt-7602-casal-mendoza', accessCode: '7602', postTourUrl: 'https://galeria.pictour.app/g/pt-7602-casal-mendoza', localGalleryUrl: 'http://127.0.0.1:3888/g/pt-7602-casal-mendoza', cloudGalleryUrl: 'https://galeria.pictour.app/g/pt-7602-casal-mendoza', cloudPublishedAt: demoMinutesAgo(74), status: 'OPEN', createdAt: demoMinutesAgo(155) },
    { id: 'sess_demo_03', code: 'PT-7599', customerName: 'Excursão Escolar Aurora', locationName: 'Estúdio Chroma', photoCount: 28, selectedCount: 12, postTourEnabled: true, expiresAt: demoDaysFromNow(5), publicSlug: 'pt-7599-excursao-aurora', accessCode: '7599', postTourUrl: 'https://galeria.pictour.app/g/pt-7599-excursao-aurora', localGalleryUrl: 'http://127.0.0.1:3888/g/pt-7599-excursao-aurora', cloudGalleryUrl: 'https://galeria.pictour.app/g/pt-7599-excursao-aurora', cloudPublishedAt: demoDaysAgo(1), status: 'SOLD', createdAt: demoDaysAgo(1) },
    { id: 'sess_demo_04', code: 'PT-7588', customerName: 'Grupo Argentina Tour', locationName: 'Cataratas View', photoCount: 22, selectedCount: 9, postTourEnabled: true, expiresAt: demoDaysFromNow(4), publicSlug: 'pt-7588-argentina-tour', accessCode: '7588', postTourUrl: 'https://galeria.pictour.app/g/pt-7588-argentina-tour', status: 'SOLD', createdAt: demoDaysAgo(3) }
  ];
  const photoDefinitions = [
    ['PT-7601','F01','Família no mirante','READY',true,204,'UPLOAD'], ['PT-7601','F02','Cataratas panorâmica','READY',true,218,'UPLOAD'], ['PT-7601','F03','Chroma aventura','SELECTED',true,236,'CHROMA'], ['PT-7601','F04','Foto espontânea','READY',false,258,'UPLOAD'], ['PT-7601','F05','Close premium','SELECTED',true,282,'UPLOAD'], ['PT-7601','F06','Souvenir digital','READY',false,304,'CHROMA'], ['PT-7601','F07','Família completa','READY',false,322,'UPLOAD'], ['PT-7601','F08','Pôr do sol','SELECTED',true,338,'UPLOAD'],
    ['PT-7602','F01','Casal no portal','READY',true,18,'UPLOAD'], ['PT-7602','F02','Noite premium','SELECTED',true,36,'CHROMA'], ['PT-7602','F03','Foto romântica','READY',false,54,'UPLOAD'], ['PT-7602','F04','Cenário luzes','SELECTED',true,72,'CHROMA'], ['PT-7602','F05','Cartão postal','READY',false,92,'UPLOAD'],
    ['PT-7599','F01','Grupo completo','PURCHASED',true,126,'UPLOAD'], ['PT-7599','F02','Chroma escolar','PURCHASED',true,144,'CHROMA'], ['PT-7599','F03','Professores','PURCHASED',true,162,'UPLOAD'], ['PT-7599','F04','Turma premium','PURCHASED',true,180,'CHROMA'], ['PT-7599','F05','Foto extra','READY',false,198,'UPLOAD'],
    ['PT-7588','F01','Grupo Argentina','PURCHASED',true,308,'UPLOAD'], ['PT-7588','F02','Cataratas wide','PURCHASED',true,328,'UPLOAD'], ['PT-7588','F03','Chroma selva','PURCHASED',true,348,'CHROMA']
  ];
  const photos = photoDefinitions.map(([sessionCode, code, label, status, selected, hue, kind], index) => ({ id: `photo_demo_${index + 1}`, code, label, sessionCode, status, kind, backgroundName: kind === 'CHROMA' ? 'Inspector profissional' : undefined, selected: Boolean(selected), originalFileName: `${sessionCode}-${code}.jpg`, importedAt: demoMinutesAgo(150 - index * 4), favorite: Boolean(selected), previewUrl: demoPreviewUrl(label, `${sessionCode} • ${code}`, Number(hue)), cloudStatus: index % 4 === 0 ? 'PENDING' : 'SYNCED', cloudSyncedAt: index % 4 === 0 ? undefined : demoMinutesAgo(80 - index) }));
  const packages = [
    { id: 'pkg_digital_01', name: '1 Foto Digital', locationName: 'Cataratas View', photoQuantity: 1, includesAllPhotos: false, priceCents: 3900, currency: 'BRL', pricingMode: 'PER_PHOTO', active: true },
    { id: 'pkg_impresso_digital', name: '1 Foto Impressa + Digital', locationName: 'Cataratas View', photoQuantity: 1, includesAllPhotos: false, priceCents: 5900, currency: 'BRL', pricingMode: 'PER_PHOTO', active: true },
    { id: 'pkg_porta_retrato', name: 'Porta-retrato premium', locationName: 'Cataratas View', photoQuantity: 1, includesAllPhotos: false, priceCents: 8900, currency: 'BRL', pricingMode: 'PER_PHOTO', active: true },
    { id: 'pkg_todas', name: 'Todas digitais da sessão', locationName: 'Cataratas View', photoQuantity: null, includesAllPhotos: true, priceCents: 14990, currency: 'BRL', pricingMode: 'FIXED', active: true },
    { id: 'pkg_online_3', name: 'Galeria Online • 3 digitais', locationName: 'Passeio Premium', photoQuantity: 3, includesAllPhotos: false, priceCents: 8990, currency: 'BRL', pricingMode: 'PER_PHOTO', active: true }
  ];
  const cashShifts = [
    { id: 'shift_demo_today', code: 'CX-220', status: 'OPEN', openedAt: demoMinutesAgo(180), openedBy: 'Marina', openingAmountCents: 30000, openingChangeFundCents: 30000, recommendedChangeFundCents: 30000, cashRegisterName: 'Caixa 01', note: 'Abertura demo comercial' },
    { id: 'shift_demo_yesterday', code: 'CX-219', status: 'CLOSED', openedAt: demoDaysAgo(1), openedBy: 'João', openingAmountCents: 30000, openingChangeFundCents: 30000, recommendedChangeFundCents: 30000, closedAt: demoDaysAgo(1), closedBy: 'João', closingAmountCents: 35900, expectedAmountCents: 35900, differenceCents: 0, cashRegisterName: 'Caixa 01', shiftChangeOnClose: true },
    { id: 'shift_demo_old', code: 'CX-214', status: 'CLOSED', openedAt: demoDaysAgo(3), openedBy: 'Camila', openingAmountCents: 30000, closedAt: demoDaysAgo(3), closedBy: 'Camila', closingAmountCents: 38990, expectedAmountCents: 38990, differenceCents: 0, cashRegisterName: 'Caixa 02' }
  ];
  const cashierSales = [
    { id: 'sale_demo_01', code: 'V-2201', sessionCode: 'PT-7599', sellerName: 'Marina', method: 'MIXED', currency: 'BRL', amountCents: 20800, amountBaseCents: 20800, paidBaseCents: 22000, changeBaseCents: 1200, paymentSummary: 'Pix R$ 100,00 + Dinheiro R$ 120,00 / troco R$ 12,00', tenders: [{ id: 'tender_demo_pix', method: 'MANUAL_PIX', currency: 'BRL', amountCents: 10000, amountBaseCents: 10000, label: 'Pix manual' }, { id: 'tender_demo_cash', method: 'CASH', currency: 'BRL', amountCents: 12000, amountBaseCents: 12000, label: 'Dinheiro' }], createdAt: demoMinutesAgo(35), channel: 'DESK', packageName: 'Checkout modular presencial', photoIds: ['photo_demo_14','photo_demo_15','photo_demo_16'], cashShiftId: 'shift_demo_today', saleStatus: 'ACTIVE', deliveryStatus: 'DELIVERED', deliveredAt: demoMinutesAgo(16), deliveryDownloadCount: 3, saleLineItems: [{ id: 'line_demo_1', packageId: 'pkg_impresso_digital', packageName: '1 Foto Impressa + Digital', photoId: 'photo_demo_14', photoCode: 'F01', priceCents: 5900, currency: 'BRL' }, { id: 'line_demo_2', packageId: 'pkg_digital_01', packageName: '1 Foto Digital', photoId: 'photo_demo_15', photoCode: 'F02', priceCents: 3900, currency: 'BRL' }, { id: 'line_demo_3', packageId: 'pkg_porta_retrato', packageName: 'Porta-retrato premium', photoId: 'photo_demo_16', photoCode: 'F03', priceCents: 8900, currency: 'BRL' }] },
    { id: 'sale_demo_02', code: 'V-2202', sessionCode: 'PT-7588', sellerName: 'João', method: 'CREDIT_CARD_ONLINE', currency: 'BRL', amountCents: 14990, amountBaseCents: 14990, createdAt: demoMinutesAgo(88), channel: 'POST_TOUR', onlineCheckoutId: 'chk_demo_01', packageName: 'Todas digitais da sessão', photoIds: ['photo_demo_19','photo_demo_20','photo_demo_21'], cashShiftId: 'shift_demo_today', saleStatus: 'ACTIVE', deliveryStatus: 'DELIVERED', deliveredAt: demoMinutesAgo(70), deliveryDownloadCount: 1 },
    { id: 'sale_demo_03', code: 'V-2198', sessionCode: 'PT-7599', sellerName: 'Marina', method: 'CASH', currency: 'BRL', amountCents: 5900, amountBaseCents: 5900, createdAt: demoDaysAgo(1), channel: 'DESK', packageName: '1 Foto Impressa + Digital', photoIds: ['photo_demo_17'], cashShiftId: 'shift_demo_yesterday', saleStatus: 'ACTIVE', deliveryStatus: 'PENDING' },
    { id: 'sale_demo_04', code: 'V-2193', sessionCode: 'PT-7588', sellerName: 'Camila', method: 'EXTERNAL_CARD_MACHINE', currency: 'BRL', amountCents: 8990, amountBaseCents: 8990, createdAt: demoDaysAgo(3), channel: 'DESK', packageName: 'Galeria Online • 3 digitais', photoIds: ['photo_demo_19','photo_demo_20'], cashShiftId: 'shift_demo_old', saleStatus: 'ACTIVE', deliveryStatus: 'DELIVERED', deliveredAt: demoDaysAgo(3), deliveryDownloadCount: 2 }
  ];
  const cashMovements = [
    { id: 'mov_demo_01', shiftId: 'shift_demo_today', type: 'OPENING', amountCents: 30000, createdAt: demoMinutesAgo(180), operatorName: 'Marina', note: 'Fundo de troco inicial' },
    { id: 'mov_demo_02', shiftId: 'shift_demo_today', type: 'WITHDRAWAL', amountCents: 10000, createdAt: demoMinutesAgo(55), operatorName: 'Marina', note: 'Sangria parcial demo' },
    { id: 'mov_demo_03', shiftId: 'shift_demo_yesterday', type: 'OPENING', amountCents: 30000, createdAt: demoDaysAgo(1), operatorName: 'João', note: 'Abertura turno tarde' },
    { id: 'mov_demo_04', shiftId: 'shift_demo_yesterday', type: 'CLOSE', amountCents: 35900, createdAt: demoDaysAgo(1), operatorName: 'João', note: 'Fechamento com troca de turno' }
  ];
  const onlineCheckouts = [
    { id: 'chk_demo_01', gateway: 'MERCADO_PAGO', environment: 'production', sessionCode: 'PT-7588', photoIds: ['photo_demo_19','photo_demo_20','photo_demo_21'], packageName: 'Todas digitais da sessão', amountCents: 14990, currency: 'BRL', buyerEmail: 'cliente.demo@email.com', preferenceId: 'pref-demo-001', externalReference: 'PT-7588-demo', checkoutUrl: 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=demo', status: 'APPROVED', gatewayStatus: 'approved', gatewayPaymentId: 'pay-demo-001', createdAt: demoMinutesAgo(105), paidAt: demoMinutesAgo(90), deliveryUrl: 'http://127.0.0.1:3888/d/demo' },
    { id: 'chk_demo_02', gateway: 'MERCADO_PAGO', environment: 'production', sessionCode: 'PT-7601', photoIds: ['photo_demo_1','photo_demo_3'], packageName: 'Galeria Online • 2 digitais', amountCents: 7800, currency: 'BRL', buyerEmail: 'familia.oliveira@email.com', preferenceId: 'pref-demo-002', externalReference: 'PT-7601-pendente', status: 'PENDING', gatewayStatus: 'pending', createdAt: demoMinutesAgo(22) }
  ];
  const deliveryAccessLogs = [
    { id: 'delog_demo_01', saleId: 'sale_demo_01', saleCode: 'V-2201', sessionCode: 'PT-7599', action: 'VIEW', createdAt: demoMinutesAgo(20), ipAddress: '192.168.0.30' },
    { id: 'delog_demo_02', saleId: 'sale_demo_01', saleCode: 'V-2201', sessionCode: 'PT-7599', action: 'DOWNLOAD_ALL', createdAt: demoMinutesAgo(16), ipAddress: '192.168.0.30' },
    { id: 'delog_demo_03', saleId: 'sale_demo_02', saleCode: 'V-2202', sessionCode: 'PT-7588', action: 'DOWNLOAD_PHOTO', photoId: 'photo_demo_19', createdAt: demoMinutesAgo(70), ipAddress: '177.44.0.10' }
  ];
  return { companyName, locationName, locations, sessions, photos, packages, cashShifts, cashierSales, cashMovements, onlineCheckouts, deliveryAccessLogs };
}

function loadCommercialDemoData(input = {}) {
  const currentDb = getMutableDatabase();
  const payload = buildCommercialDemoPayload(currentDb);
  const now = nowIso();
  const actor = actorFromInput(input, 'Gestor/adm');
  const demoDb = {
    ...createSeedDatabase(),
    settings: {
      ...createSeedDatabase().settings,
      ...(currentDb.settings || {}),
      companyName: payload.companyName,
      locationName: payload.locationName,
      defaultCurrency: 'BRL',
      locations: payload.locations,
      packages: payload.packages,
      exchangeRates: defaultExchangeRates(),
      cash: {
        ...defaultCashSettings(),
        ...((currentDb.settings || {}).cash || {}),
        cashRegisterName: ((currentDb.settings || {}).cash || {}).cashRegisterName || 'Caixa 01',
        recommendedChangeFundCents: ((currentDb.settings || {}).cash || {}).recommendedChangeFundCents || 30000,
        autoPrintCashReceipts: ((currentDb.settings || {}).cash || {}).autoPrintCashReceipts !== false
      },
      mercadoPago: { ...defaultMercadoPagoSettings(), ...((currentDb.settings || {}).mercadoPago || {}), enabled: true, environment: 'production', autoReleaseDelivery: true, webhookUrl: ((currentDb.settings || {}).mercadoPago || {}).webhookUrl || 'https://api.pictour.app/webhooks/mercado-pago' },
      cloud: { ...defaultCloudSettings(), ...((currentDb.settings || {}).cloud || {}), enabled: true, apiBaseUrl: ((currentDb.settings || {}).cloud || {}).apiBaseUrl || 'https://api.pictour.app', publicGalleryBaseUrl: ((currentDb.settings || {}).cloud || {}).publicGalleryBaseUrl || 'https://galeria.pictour.app' },
      cloudStorage: { ...defaultCloudStorageSettings(), ...((currentDb.settings || {}).cloudStorage || {}), driver: (((currentDb.settings || {}).cloudStorage || {}).driver || 'r2'), bucket: (((currentDb.settings || {}).cloudStorage || {}).bucket || 'pictour-demo'), publicBaseUrl: (((currentDb.settings || {}).cloudStorage || {}).publicBaseUrl || 'https://cdn.pictour.app') },
      antiPrint: { ...defaultAntiPrintSettings(), ...((currentDb.settings || {}).antiPrint || {}), enabled: true, watermarkText: 'PICTOUR DEMO PREVIEW', opacity: 38, density: 24 },
      photographerPortal: { ...defaultPhotographerPortalSettings(), ...((currentDb.settings || {}).photographerPortal || {}), enabled: true, mobileMode: 'FULL_OPERATION', allowMobileSelection: true, allowMobileFavorite: true, enableUploadQueue: true },
      multiStation: { ...defaultMultiStationSettings(), ...((currentDb.settings || {}).multiStation || {}), enabled: true, mode: 'PRIMARY', stationName: (((currentDb.settings || {}).multiStation || {}).stationName || 'Estação Demo 01') },
      subscription: { ...(((currentDb.settings || {}).subscription || {})), enabled: true, plan: 'PRO', status: 'TRIAL', billingCycle: 'MONTHLY', provider: 'MERCADO_PAGO', monthlyPriceCents: 49900, yearlyPriceCents: 499000, graceDays: 5, autoSuspendPastDue: true },
      saas: { ...((currentDb.settings || {}).saas || {}), tenantSlug: 'pictour-demo-park', adminPanelUrl: 'https://api.pictour.app/admin?token=demo', billingStatus: 'TRIAL', billingCycle: 'MONTHLY', seatsPurchased: 8, deviceLimit: 3, requireOnlineLicense: false },
      license: { ...normalizeLicenseSettings((currentDb.settings || {}).license || defaultLicenseSettings()), plan: 'PRO', status: 'TRIAL', activatedAt: now, expiresAt: demoDaysFromNow(14) },
      users: normalizeUsers((currentDb.settings || {}).users || defaultUsers(), (currentDb.settings || {}).users || []),
      commercialSetup: normalizeCommercialSetupSettings({ ...((currentDb.settings || {}).commercialSetup || {}), demoModeLoaded: true, demoLoadedAt: now, completedStepIds: ['COMPANY','LOCATIONS','PACKAGES','MERCADO_PAGO','SECURITY','BACKUP','DEMO_DONE'], onboardingCompleted: true, installMode: app.isPackaged ? 'PACKAGED' : 'DEV' }),
      operationChecklist: { completedItemIds: ['sessions-ready','cashier-ready','gallery-ready','mobile-ready','bi-ready'], updatedAt: now },
      quickScenarios: [
        { id: 'quick_demo_cataratas', name: 'Cataratas cinematic', isDefault: true, isActive: true, sortOrder: 1, createdAt: now, updatedAt: now },
        { id: 'quick_demo_inspector', name: 'Inspector profissional', isDefault: true, isActive: true, sortOrder: 2, createdAt: now, updatedAt: now },
        { id: 'quick_demo_por_do_sol', name: 'Passeio pôr do sol', isDefault: false, isActive: true, sortOrder: 3, createdAt: now, updatedAt: now }
      ],
      chromaAssets: [
        { id: 'asset_demo_cataratas', name: 'Cataratas cinematic oficial', description: 'Cenário oficial para demo comercial.', type: 'SCENARIO', locationName: 'Cataratas View', imageUrl: '', thumbnailUrl: '', isActive: true, isDefault: true, sortOrder: 1, createdAt: now, updatedAt: now },
        { id: 'asset_demo_inspector', name: 'Inspector profissional', description: 'Cenário para recorte/chroma premium.', type: 'SCENARIO', locationName: 'Estúdio Chroma', imageUrl: '', thumbnailUrl: '', isActive: true, sortOrder: 2, createdAt: now, updatedAt: now },
        { id: 'asset_demo_overlay', name: 'Moldura digital PicTour', description: 'Overlay digital demonstrativo.', type: 'OVERLAY', locationName: 'Cataratas View', imageUrl: '', thumbnailUrl: '', isActive: true, sortOrder: 3, createdAt: now, updatedAt: now }
      ]
    },
    sessions: payload.sessions,
    photos: payload.photos,
    cashierSales: payload.cashierSales,
    cashShifts: payload.cashShifts,
    cashMovements: payload.cashMovements,
    onlineCheckouts: payload.onlineCheckouts,
    deliveryAccessLogs: payload.deliveryAccessLogs,
    auditLogs: currentDb.auditLogs || [],
    cloudSyncQueue: [],
    version: DB_SCHEMA_VERSION,
    migrationInfo: { schemaVersion: DB_SCHEMA_VERSION, lastMigratedAt: now, migrationLog: [`Demo comercial v${APP_RELEASE_VERSION} carregada.`] }
  };

  addAuditLog(demoDb, { category: 'SYSTEM', action: 'COMMERCIAL.DEMO_LOAD', severity: 'CRITICAL', ...actor, entityType: 'DATABASE', entityLabel: 'Demo comercial guiada', summary: `Demo comercial v${APP_RELEASE_VERSION} carregada com dados fictícios bonitos.`, details: { sessions: demoDb.sessions.length, photos: demoDb.photos.length, sales: demoDb.cashierSales.length, route: 'demo-guide' } });
  saveDatabase(demoDb);
  return { ok: true, message: `Demo comercial guiada v${APP_RELEASE_VERSION} carregada: sessões, fotos horizontais, checkout modular, galeria, caixa, BI, SaaS e entrega prontos para apresentação.`, database: loadDatabase() };
}

function getSystemDiagnostics() {
  const db = getMutableDatabase();
  const packageInfo = (() => {
    try { return require(path.join(__dirname, '../package.json')); } catch { return { version: 'dev' }; }
  })();
  let backgroundRemovalInstalled = false;
  try {
    require.resolve('@imgly/background-removal');
    backgroundRemovalInstalled = true;
  } catch {
    backgroundRemovalInstalled = false;
  }

  const dbPath = getDatabasePath();
  const libraryPath = getPhotoLibraryPath();
  const backupDir = path.join(getDataRoot(), 'backups');
  const commercialSetup = normalizeCommercialSetupSettings(db.settings?.commercialSetup || {});
  let backupCount = 0;
  try {
    backupCount = fs.existsSync(backupDir) ? fs.readdirSync(backupDir).filter((name) => name.endsWith('.json')).length : 0;
  } catch {
    backupCount = 0;
  }
  return {
    appVersion: packageInfo.version || 'dev',
    isPackaged: app.isPackaged,
    platform: process.platform,
    dataRoot: getDataRoot(),
    databasePath: dbPath,
    databaseExists: fs.existsSync(dbPath),
    photoLibraryPath: libraryPath,
    photoLibraryExists: fs.existsSync(libraryPath),
    backupDirectoryPath: backupDir,
    backupCount,
    lastBackupAt: commercialSetup.lastBackupAt,
    lastBackupPath: commercialSetup.lastBackupPath,
    demoModeLoaded: Boolean(commercialSetup.demoModeLoaded),
    sessionCount: (db.sessions || []).length,
    photoCount: (db.photos || []).length,
    saleCount: (db.cashierSales || []).length,
    auditLogCount: (db.auditLogs || []).length,
    publicGallery: getPublicGalleryInfo(),
    customerDisplayOpen: Boolean(customerWindow && !customerWindow.isDestroyed()),
    mercadoPagoConfigured: Boolean(db.settings?.mercadoPago?.enabled && db.settings?.mercadoPago?.accessToken),
    cloudConfigured: Boolean(db.settings?.cloud?.enabled && db.settings?.cloud?.apiBaseUrl),
    multiStationConfigured: Boolean(db.settings?.multiStation?.enabled),
    photographerPortalEnabled: db.settings?.photographerPortal?.enabled !== false,
    packagedBuildReady: app.isPackaged,
    onboardingCompleted: Boolean(commercialSetup.onboardingCompleted),
    backgroundRemovalInstalled,
    licenseStatus: getLicenseHealth(db).license.status,
    licensePlan: getLicenseHealth(db).license.plan,
    licenseDaysLeft: getLicenseHealth(db).daysLeft,
    licenseReady: getLicenseHealth(db).ready,
    schemaVersion: Number(db.version || 1),
    lastMigratedAt: db.migrationInfo?.lastMigratedAt,
    lastMigrationBackupPath: db.migrationInfo?.lastMigrationBackupPath,
    updateCurrentVersion: db.settings?.lastUpdateCheck?.currentVersion || packageInfo.version || 'dev',
    updateLatestVersion: db.settings?.lastUpdateCheck?.latestVersion,
    updateAvailable: Boolean(db.settings?.lastUpdateCheck?.updateAvailable),
    lastUpdateCheckMessage: db.settings?.lastUpdateCheck?.message,
    defaultAdminStillNeedsPasswordChange: Boolean((db.settings?.users || []).some((user) => user.username === 'admin' && user.forcePasswordChange))
  };
}


function authenticateUser(input = {}) {
  const db = getMutableDatabase();
  db.settings = {
    ...(db.settings || createSeedDatabase().settings),
    users: normalizeUsers((db.settings || {}).users || defaultUsers(), (db.settings || {}).users || []),
    locations: normalizeLocations((db.settings || {}).locations, db.settings || {}),
    packages: normalizePackages((db.settings || {}).packages || defaultPackages(db.settings || {}), db.settings || {}),
    exchangeRates: normalizeExchangeRates((db.settings || {}).exchangeRates || defaultExchangeRates())
  };

  const username = String(input.username || '').trim().toLowerCase();
  const password = String(input.password || '');
  const user = (db.settings.users || []).find((item) => item.username === username && item.active !== false);

  if (!user || user.passwordHash !== hashPassword(password)) {
    addAuditLog(db, { category: 'AUTH', action: 'AUTH.LOGIN_FAILED', severity: 'WARNING', actorName: username || 'Desconhecido', actorUsername: username || undefined, summary: `Tentativa de login falhou para ${username || 'usuário vazio'}.`, details: { username } });
    saveDatabase(db);
    return { ok: false, message: 'Login ou senha inválidos.' };
  }

  addAuditLog(db, { category: 'AUTH', action: 'AUTH.LOGIN_SUCCESS', severity: 'INFO', actorName: user.name, actorUsername: user.username, entityType: 'USER', entityId: user.id, entityLabel: user.username, summary: `${user.name} entrou no PicTour.`, details: { role: user.role, forcePasswordChange: user.forcePasswordChange } });
  saveDatabase(db);
  return {
    ok: true,
    message: `Bem-vindo, ${user.name}.`,
    user: publicUser(user),
    database: loadDatabase()
  };
}

function centsToAmount(amountCents) {
  return Number((Number(amountCents || 0) / 100).toFixed(2));
}

function getMercadoPagoConfig() {
  const db = getMutableDatabase();
  const settings = sanitizeMercadoPagoSettings(db.settings || {}).mercadoPago;
  if (!settings.enabled) throw new Error('Mercado Pago está desativado nas Configurações.');
  if (!settings.accessToken) throw new Error('Access Token do Mercado Pago não foi configurado.');
  if (settings.environment === 'sandbox' && !settings.accessToken.startsWith('TEST-')) {
    throw new Error('Para sandbox, use um Access Token de teste começando com TEST-.');
  }
  if (settings.environment === 'production' && settings.accessToken.startsWith('TEST-')) {
    throw new Error('O ambiente está em produção, mas o token configurado parece ser de sandbox/teste.');
  }
  return settings;
}

async function mercadoPagoRequest(pathname, options = {}) {
  const settings = getMercadoPagoConfig();
  const response = await fetch(`https://api.mercadopago.com${pathname}`, {
    ...options,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      Authorization: `Bearer ${settings.accessToken}`,
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    const cause = Array.isArray(data?.cause) && data.cause.length
      ? data.cause.map((item) => item.description || item.message || item.code).join(' | ')
      : (data?.message || data?.error || response.statusText);
    throw new Error(`Mercado Pago ${response.status}: ${cause}`);
  }

  return data;
}

function mapMercadoPagoStatus(status) {
  if (status === 'approved') return 'APPROVED';
  if (status === 'rejected') return 'REJECTED';
  if (status === 'cancelled' || status === 'refunded' || status === 'charged_back') return 'CANCELLED';
  if (status === 'pending' || status === 'in_process' || status === 'authorized') return 'PENDING';
  return 'UNKNOWN';
}

function mapMercadoPagoPaymentMethod(payment = {}) {
  const method = String(payment.payment_type_id || payment.payment_method_id || '').toLowerCase();
  if (method.includes('credit')) return 'CREDIT_CARD_ONLINE';
  if (method.includes('debit')) return 'DEBIT_CARD_ONLINE';
  return 'PIX_ONLINE';
}

async function createMercadoPagoCheckout(input = {}) {
  const db = getMutableDatabase();
  const settings = getMercadoPagoConfig();
  const session = (db.sessions || []).find((item) => item.code === input.sessionCode);
  if (!session) throw new Error('Sessão não encontrada para criar checkout.');

  const photoIds = Array.isArray(input.photoIds) ? input.photoIds.filter(Boolean) : [];
  if (!photoIds.length) throw new Error('Selecione pelo menos uma foto para vender no pós-passeio.');

  const amountCents = Number(input.amountCents || 0);
  if (!Number.isFinite(amountCents) || amountCents <= 0) throw new Error('Valor do checkout inválido.');

  const externalReference = `pictour-${input.sessionCode}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const buyerEmail = String(input.buyerEmail || '').trim() || `test_user_${Date.now()}@testuser.com`;
  const currency = input.currency || 'BRL';
  const title = `PicTour ${session.code} - ${input.packageName || 'Fotos digitais'}`;

  const payload = {
    items: [
      {
        id: `pictour-${session.code}`,
        title,
        description: `${photoIds.length} foto(s) digital(is) da sessão ${session.code}`,
        quantity: 1,
        unit_price: centsToAmount(amountCents),
        currency_id: currency
      }
    ],
    payer: {
      email: buyerEmail
    },
    external_reference: externalReference,
    back_urls: {
      success: settings.successUrl || defaultMercadoPagoSettings().successUrl,
      failure: settings.failureUrl || defaultMercadoPagoSettings().failureUrl,
      pending: settings.pendingUrl || defaultMercadoPagoSettings().pendingUrl
    },
    auto_return: 'approved',
    metadata: {
      source: 'pictour_desktop',
      session_code: session.code,
      photo_ids: photoIds.join(','),
      package_name: input.packageName || 'Fotos digitais'
    }
  };

  if (settings.webhookUrl) {
    try {
      const webhook = new URL(settings.webhookUrl);
      if (settings.webhookSecret && !webhook.searchParams.get('token')) webhook.searchParams.set('token', settings.webhookSecret);
      payload.notification_url = webhook.toString();
    } catch {
      payload.notification_url = settings.webhookUrl;
    }
  }

  const preference = await mercadoPagoRequest('/checkout/preferences', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  const checkout = {
    id: makeId('checkout'),
    gateway: 'MERCADO_PAGO',
    environment: settings.environment,
    sessionCode: session.code,
    photoIds,
    packageName: input.packageName || 'Fotos digitais',
    amountCents,
    currency,
    buyerEmail,
    preferenceId: preference.id,
    externalReference,
    checkoutUrl: preference.init_point,
    sandboxCheckoutUrl: preference.sandbox_init_point,
    status: 'PENDING',
    gatewayStatus: 'preference_created',
    createdAt: nowIso()
  };

  db.onlineCheckouts = [checkout, ...(db.onlineCheckouts || [])];
  addAuditLog(db, { category: 'SALE', action: 'MERCADO_PAGO.CHECKOUT_CREATED', severity: 'INFO', ...actorFromInput(input, 'Operador'), entityType: 'CHECKOUT', entityId: checkout.id, entityLabel: checkout.externalReference, summary: `Checkout Mercado Pago criado para sessão ${session.code}.`, details: { sessionCode: session.code, amountCents, currency, photoCount: photoIds.length, packageName: checkout.packageName, environment: checkout.environment } });
  saveDatabase(db);

  return {
    ok: true,
    message: settings.environment === 'sandbox'
      ? 'Checkout sandbox criado. Abra o link sandbox para testar o pagamento.'
      : 'Checkout Mercado Pago criado. Abra o link para o cliente pagar.',
    checkout,
    database: loadDatabase()
  };
}

function approveCheckoutLocally(db, checkout, payment) {
  const selectedPhotoIds = new Set(checkout.photoIds || []);
  db.photos = (db.photos || []).map((photo) => (
    selectedPhotoIds.has(photo.id) ? { ...photo, status: 'PURCHASED', selected: false } : photo
  ));

  const alreadyRegistered = (db.cashierSales || []).some((sale) => sale.onlineCheckoutId === checkout.id || sale.externalReference === checkout.externalReference);
  if (!alreadyRegistered) {
    const approvedSale = attachCommissionToSale(db, normalizeSaleDeliveryFields({
      id: makeId('sale'),
      code: generateSaleCode(db),
      sellerName: 'Mercado Pago',
      method: mapMercadoPagoPaymentMethod(payment),
      currency: checkout.currency || 'BRL',
      amountCents: Number(checkout.amountCents || 0),
      amountBaseCents: Number(checkout.amountCents || 0),
      createdAt: nowIso(),
      channel: 'POST_TOUR',
      sessionCode: checkout.sessionCode,
      onlineCheckoutId: checkout.id,
      externalReference: checkout.externalReference,
      gatewayPaymentId: payment?.id ? String(payment.id) : undefined,
      packageName: checkout.packageName || undefined,
      photoIds: checkout.photoIds || [],
      deliveryExpiresAt: addDaysIso(7),
      deliveryStatus: 'PENDING',
      saleStatus: 'ACTIVE'
    }));
    db.cashierSales = [approvedSale, ...(db.cashierSales || [])];
    addAuditLog(db, { category: 'SALE', action: 'MERCADO_PAGO.PAYMENT_APPROVED', severity: 'CRITICAL', actorName: 'Mercado Pago', entityType: 'SALE', entityId: approvedSale.id, entityLabel: approvedSale.code, summary: `Pagamento Mercado Pago aprovado e venda ${approvedSale.code} registrada.`, details: { checkoutId: checkout.id, externalReference: checkout.externalReference, gatewayPaymentId: payment?.id, amountCents: checkout.amountCents, photoCount: (checkout.photoIds || []).length } });
  }
}

async function checkMercadoPagoCheckout(input = {}) {
  const db = getMutableDatabase();
  const checkout = (db.onlineCheckouts || []).find((item) => item.id === input.checkoutId);
  if (!checkout) throw new Error('Checkout não encontrado no banco local.');

  const search = await mercadoPagoRequest(`/v1/payments/search?external_reference=${encodeURIComponent(checkout.externalReference)}`, {
    method: 'GET',
    headers: { 'X-Idempotency-Key': makeId('idem') }
  });

  const payment = Array.isArray(search?.results) && search.results.length
    ? search.results[0]
    : null;

  const mappedStatus = mapMercadoPagoStatus(payment?.status);
  const gatewayStatus = payment?.status || 'payment_not_found';

  db.onlineCheckouts = (db.onlineCheckouts || []).map((item) => {
    if (item.id !== checkout.id) return item;
    return {
      ...item,
      status: mappedStatus,
      gatewayStatus,
      gatewayPaymentId: payment?.id ? String(payment.id) : item.gatewayPaymentId,
      paidAt: mappedStatus === 'APPROVED' ? nowIso() : item.paidAt,
      lastCheckedAt: nowIso(),
      autoReleaseTriggered: mappedStatus === 'APPROVED' ? true : item.autoReleaseTriggered
    };
  });

  const updatedCheckout = (db.onlineCheckouts || []).find((item) => item.id === checkout.id) || checkout;
  if (mappedStatus === 'APPROVED') {
    approveCheckoutLocally(db, updatedCheckout, payment);
  }

  saveDatabase(db);

  const message = mappedStatus === 'APPROVED'
    ? 'Pagamento aprovado no Mercado Pago. Fotos liberadas e venda registrada no caixa.'
    : payment
      ? `Pagamento localizado com status: ${gatewayStatus}.`
      : 'Ainda não encontrei pagamento para este checkout. Se acabou de pagar, aguarde alguns segundos e consulte novamente.';

  return {
    ok: mappedStatus === 'APPROVED',
    status: mappedStatus,
    gatewayStatus,
    message,
    database: loadDatabase()
  };
}


function getCloudConfig() {
  const db = getMutableDatabase();
  const settings = sanitizeCloudSettings(db.settings || {}).cloud;
  if (!settings.enabled) throw new Error('Backend cloud está desativado nas Configurações. Ative antes de publicar.');
  if (!settings.apiBaseUrl) throw new Error('URL da API cloud não foi configurada.');
  if (!settings.apiKey) throw new Error('Chave interna da API cloud não foi configurada.');
  return settings;
}

function removeQueryFromUrl(url) {
  try {
    const parsed = new URL(String(url));
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return String(url || '').split('?')[0].replace(/\/$/, '');
  }
}

async function cloudRequest(pathname, options = {}) {
  const settings = getCloudConfig();
  const baseUrl = String(settings.apiBaseUrl || '').replace(/\/$/, '');
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: `Bearer ${settings.apiKey}`,
      'x-pictour-api-key': settings.apiKey,
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!response.ok || data?.ok === false) {
    throw new Error(data?.message || `Cloud ${response.status}: ${response.statusText}`);
  }

  return data;
}



async function validateLicenseWithServer(input = {}) {
  const db = getMutableDatabase();
  const settings = sanitizeCloudSettings(db.settings || {});
  const currentLicense = normalizeLicenseSettings(settings.license || defaultLicenseSettings());
  const baseUrl = String(input.licenseServerUrl || currentLicense.licenseServerUrl || settings.cloud?.apiBaseUrl || 'http://127.0.0.1:8787').replace(/\/$/, '');
  const companyId = String(input.companyId || currentLicense.companyId || '').trim();
  const licenseKey = String(input.licenseKey || currentLicense.licenseKey || '').trim();

  if (!baseUrl) throw new Error('URL do servidor de licenças não configurada.');
  if (!companyId) throw new Error('ID da empresa não preenchido na licença.');
  if (!licenseKey) throw new Error('Chave da licença não preenchida.');

  const headers = { accept: 'application/json', 'content-type': 'application/json' };
  if (settings.cloud?.apiKey) {
    headers.authorization = `Bearer ${settings.cloud.apiKey}`;
    headers['x-pictour-api-key'] = settings.cloud.apiKey;
  }

  const response = await fetch(`${baseUrl}/api/licenses/validate`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      companyId,
      licenseKey,
      appVersion: getAppVersion(),
      deviceName: os.hostname(),
      deviceFingerprint: getDeviceFingerprint(),
      stationName: db.settings?.multiStation?.stationName || os.hostname(),
      checkInKind: input.silentCheckIn ? 'AUTO' : 'MANUAL',
      usage: buildLicenseUsagePayload(db)
    })
  });

  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }

  if (!response.ok || data?.ok === false) {
    const message = data?.message || `Servidor de licenças respondeu ${response.status}.`;
    const failedLicense = normalizeLicenseSettings({ ...currentLicense, companyId, licenseKey, licenseServerUrl: baseUrl, lastValidatedAt: nowIso(), lastValidationMessage: message });
    db.settings = { ...(db.settings || {}), license: failedLicense };
    addAuditLog(db, { category: 'SETTINGS', action: 'LICENSE.VALIDATION_FAILED', severity: 'WARNING', ...actorFromInput(input, 'Gestor/adm'), entityType: 'LICENSE', entityLabel: companyId, summary: `Validação da licença falhou: ${message}`, details: { companyId, baseUrl, statusCode: response.status } });
    saveDatabase(db);
    return { ok: false, message, license: failedLicense, database: loadDatabase() };
  }

  const remoteLicense = data.license || {};
  const nextLicense = normalizeLicenseSettings({
    ...currentLicense,
    ...remoteLicense,
    companyId: data.company?.id || remoteLicense.companyId || companyId,
    licenseKey: remoteLicense.licenseKey || licenseKey,
    licenseServerUrl: baseUrl,
    serverLicenseId: remoteLicense.id || remoteLicense.serverLicenseId || currentLicense.serverLicenseId || '',
    lastValidatedAt: nowIso(),
    lastValidationMessage: data.message || 'Licença validada no servidor PicTour.',
    lastCheckInAt: data.checkIn?.at || remoteLicense.lastCheckInAt || nowIso(),
    lastCheckInMessage: data.checkIn?.message || remoteLicense.lastCheckInMessage || 'Check-in sincronizado com o servidor.'
  });

  db.settings = { ...(db.settings || {}), license: nextLicense };
  addAuditLog(db, { category: 'SETTINGS', action: 'LICENSE.VALIDATED', severity: nextLicense.status === 'ACTIVE' || nextLicense.status === 'TRIAL' ? 'INFO' : 'WARNING', ...actorFromInput(input, 'Gestor/adm'), entityType: 'LICENSE', entityId: nextLicense.serverLicenseId, entityLabel: data.company?.name || nextLicense.companyId, summary: `Licença validada no servidor: ${nextLicense.status} / ${nextLicense.plan}.`, details: { company: data.company, plan: nextLicense.plan, status: nextLicense.status, expiresAt: nextLicense.expiresAt, baseUrl } });
  saveDatabase(db);
  return { ok: true, message: data.message || 'Licença validada e atualizada pelo servidor PicTour.', license: nextLicense, company: data.company, database: loadDatabase() };
}

function readPhotoBuffer(photo) {
  if (!photo?.storedPath || !fs.existsSync(photo.storedPath)) return null;
  const buffer = fs.readFileSync(photo.storedPath);
  return buffer.length ? buffer : null;
}

function bufferToDataUrl(buffer, mimeType) {
  if (!buffer?.length) return null;
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

function hashBuffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function createCloudThumbnailDataUrl(buffer) {
  try {
    const image = nativeImage.createFromBuffer(buffer);
    if (!image || image.isEmpty()) return null;
    const size = image.getSize();
    const maxWidth = 760;
    const width = Math.min(maxWidth, Math.max(1, size.width || maxWidth));
    const thumbnail = image.resize({ width, quality: 'good' });
    const jpegBuffer = thumbnail.toJPEG(72);
    return bufferToDataUrl(jpegBuffer, 'image/jpeg');
  } catch {
    return null;
  }
}

async function getCloudStorageInfo() {
  const settings = getCloudConfig();
  const result = await cloudRequest('/api/storage-info', { method: 'GET' });
  const db = getMutableDatabase();
  const storage = { ...defaultCloudStorageSettings(), ...(db.settings?.cloudStorage || db.settings?.cloud?.storage || {}), ...(result.storage || {}) };
  db.settings = sanitizeCloudSettings({ ...(db.settings || {}), cloudStorage: { ...storage, lastHealthCheckAt: nowIso(), lastHealthMessage: result.message || 'Storage cloud validado.' } });
  addAuditLog(db, { category: 'CLOUD', action: 'CLOUD.STORAGE_HEALTH', severity: result.ok ? 'INFO' : 'WARNING', summary: result.message || `Storage ${storage.driver} validado.`, details: result.storage || {} });
  saveDatabase(db);
  return { ...result, database: loadDatabase() };
}

async function publishSessionToCloud(input = {}) {
  const db = getMutableDatabase();
  const settings = getCloudConfig();
  const session = (db.sessions || []).find((item) => item.code === input.sessionCode) || (db.sessions || [])[0];
  if (!session) throw new Error('Sessão não encontrada para publicar na cloud.');

  const hydratedSession = ensurePostTourFields(session);
  const allSessionPhotos = (db.photos || []).filter((photo) => photo.sessionCode === hydratedSession.code);
  const sessionPhotos = input.mode === 'FAILED_ONLY'
    ? allSessionPhotos.filter((photo) => photo.cloudStatus === 'FAILED' || photo.cloudStatus === 'PENDING')
    : allSessionPhotos;
  if (!allSessionPhotos.length) throw new Error('Esta sessão ainda não possui fotos para publicar.');
  if (!sessionPhotos.length) throw new Error('Não há fotos com falha ou pendentes para reenviar nesta sessão.');

  const sessionPackages = normalizePackages((db.settings || {}).packages || defaultPackages(db.settings || {}), db.settings || {})
    .filter((packageOption) => {
      if (packageOption.active === false) return false;
      if (!isDigitalGalleryPackage(packageOption)) return false;
      if (!hydratedSession.locationName || !packageOption.locationName) return true;
      return packageOption.locationName === hydratedSession.locationName;
    })
    .map((packageOption) => ({
      id: packageOption.id,
      name: packageOption.name,
      locationId: packageOption.locationId || '',
      locationName: packageOption.locationName || hydratedSession.locationName || '',
      photoQuantity: packageOption.photoQuantity ?? null,
      includesAllPhotos: Boolean(packageOption.includesAllPhotos),
      priceCents: Math.max(0, Math.round(Number(packageOption.priceCents || 0))),
      currency: packageOption.currency || 'BRL',
      pricingMode: packageOption.includesAllPhotos || packageOption.pricingMode === 'FIXED' ? 'FIXED' : 'PER_PHOTO',
      active: packageOption.active !== false
    }));

  const sessionPayload = {
    company: {
      name: db.settings?.companyName || 'PicTour',
      locationName: db.settings?.locationName || hydratedSession.locationName || 'Operação PicTour'
    },
    settings: {
      defaultCurrency: db.settings?.defaultCurrency || 'BRL',
      exchangeRates: normalizeExchangeRates(db.settings?.exchangeRates || defaultExchangeRates())
    },
    packages: sessionPackages,
    session: {
      ...hydratedSession,
      companyName: db.settings?.companyName || 'PicTour',
      localGalleryUrl: undefined,
      postTourUrl: undefined,
      cloudGalleryUrl: undefined,
      cloudPublishedAt: undefined,
      cloudPhotoCount: undefined
    }
  };

  const result = await cloudRequest('/api/publish-session', {
    method: 'POST',
    body: JSON.stringify(sessionPayload)
  });

  const basePublicUrl = String(settings.publicGalleryBaseUrl || settings.apiBaseUrl || '').replace(/\/$/, '');
  const publicSlug = result.publicSlug || hydratedSession.publicSlug;
  const cloudUrl = removeQueryFromUrl(result.publicGalleryUrl || result.galleryUrl || (publicSlug ? `${basePublicUrl}/g/${publicSlug}` : ''));
  const protectedUrl = result.protectedGalleryUrl || result.galleryUrl || (cloudUrl ? `${cloudUrl}?code=${encodeURIComponent(hydratedSession.accessCode || '')}` : undefined);

  let syncedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  const syncDetails = [];
  const localSyncUpdates = new Map();
  const queueUpdates = new Map();

  for (const photo of sessionPhotos) {
    const buffer = readPhotoBuffer(photo);
    if (!buffer) {
      failedCount += 1;
      syncDetails.push({ photoId: photo.id, code: photo.code, status: 'FAILED', message: 'Arquivo local não encontrado.' });
      localSyncUpdates.set(photo.id, { cloudStatus: 'FAILED', cloudSyncError: 'Arquivo local não encontrado.', cloudSyncedAt: nowIso() });
      queueUpdates.set(photo.id, { status: 'FAILED', error: 'Arquivo local não encontrado.' });
      continue;
    }

    const mimeType = getMimeTypeForExtension(photo.storedPath);
    const contentHash = hashBuffer(buffer);
    const originalDataUrl = bufferToDataUrl(buffer, mimeType);
    const thumbnailDataUrl = createCloudThumbnailDataUrl(buffer) || originalDataUrl;

    try {
      const uploadResult = await cloudRequest('/api/publish-photo', {
        method: 'POST',
        body: JSON.stringify({
          publicSlug,
          contentHash,
          byteSize: buffer.length,
          photo: {
            id: photo.id,
            code: photo.code,
            label: photo.label,
            status: photo.status,
            kind: photo.kind,
            favorite: Boolean(photo.favorite),
            backgroundName: photo.backgroundName || ''
          },
          thumbnailDataUrl,
          previewDataUrl: thumbnailDataUrl,
          downloadDataUrl: originalDataUrl
        })
      });

      if (uploadResult.skipped) skippedCount += 1;
      else syncedCount += 1;

      localSyncUpdates.set(photo.id, {
        cloudStatus: 'SYNCED',
        cloudSyncedAt: nowIso(),
        cloudHash: contentHash,
        cloudPreviewUrl: uploadResult.photo?.previewUrl,
        cloudThumbnailUrl: uploadResult.photo?.thumbnailUrl,
        cloudSyncError: ''
      });
      queueUpdates.set(photo.id, { status: 'SYNCED' });
      syncDetails.push({ photoId: photo.id, code: photo.code, status: uploadResult.skipped ? 'SKIPPED' : 'SYNCED', message: uploadResult.message });
    } catch (error) {
      failedCount += 1;
      const message = error?.message || 'Falha ao sincronizar foto.';
      localSyncUpdates.set(photo.id, { cloudStatus: 'FAILED', cloudSyncError: message, cloudSyncedAt: nowIso() });
      queueUpdates.set(photo.id, { status: 'FAILED', error: message });
      syncDetails.push({ photoId: photo.id, code: photo.code, status: 'FAILED', message });
    }
  }

  const publishedPhotoCount = syncedCount + skippedCount;

  db.sessions = (db.sessions || []).map((item) => {
    if (item.code !== hydratedSession.code) return item;
    return {
      ...item,
      publicSlug,
      accessCode: hydratedSession.accessCode,
      postTourUrl: cloudUrl || item.postTourUrl,
      cloudGalleryUrl: cloudUrl || item.cloudGalleryUrl,
      cloudPublishedAt: nowIso(),
      cloudPhotoCount: publishedPhotoCount,
      cloudLastSyncSummary: { syncedCount, skippedCount, failedCount, at: nowIso() }
    };
  });

  db.photos = (db.photos || []).map((photo) => {
    const update = localSyncUpdates.get(photo.id);
    return update ? { ...photo, ...update } : photo;
  });

  const existingQueue = (db.cloudSyncQueue || []).filter((item) => !(item.sessionCode === hydratedSession.code && queueUpdates.get(item.photoId)?.status === 'SYNCED'));
  for (const [photoId, update] of queueUpdates.entries()) {
    if (update.status !== 'FAILED') continue;
    const previous = existingQueue.find((item) => item.photoId === photoId && item.sessionCode === hydratedSession.code);
    if (previous) {
      previous.status = 'FAILED';
      previous.attempts = Number(previous.attempts || 0) + 1;
      previous.lastError = update.error;
      previous.updatedAt = nowIso();
    } else {
      existingQueue.push({
        id: makeId('sync'),
        sessionCode: hydratedSession.code,
        photoId,
        status: 'FAILED',
        attempts: 1,
        lastError: update.error,
        updatedAt: nowIso()
      });
    }
  }
  db.cloudSyncQueue = existingQueue;

  addAuditLog(db, { category: 'CLOUD', action: input.mode === 'FAILED_ONLY' ? 'CLOUD.RETRY_FAILED_PHOTOS' : 'CLOUD.PUBLISH_SESSION', severity: failedCount ? 'WARNING' : 'INFO', ...actorFromInput(input, 'Operador'), entityType: 'SESSION', entityId: hydratedSession.id, entityLabel: hydratedSession.code, summary: `${hydratedSession.code} sincronizada com a cloud: ${syncedCount} enviada(s), ${skippedCount} ignorada(s), ${failedCount} falha(s).`, details: { mode: input.mode || 'ALL', cloudUrl, protectedUrl, syncedCount, skippedCount, failedCount, packageCount: sessionPackages.length } });
  saveDatabase(db);

  const failurePart = failedCount ? ` ${failedCount} falharam e precisam ser reenviadas.` : '';
  return {
    ok: failedCount === 0,
    message: `${input.mode === 'FAILED_ONLY' ? 'Reenvio concluído:' : 'Publicação concluída:'} ${syncedCount} foto(s) enviadas, ${skippedCount} já estavam atualizadas e ${sessionPackages.length} pacote(s) foram sincronizados para a galeria cloud.${failurePart} O QR agora aponta para a galeria cloud.`,
    cloudUrl,
    protectedUrl,
    publishedPhotoCount,
    syncedCount,
    skippedCount,
    failedCount,
    details: syncDetails,
    database: loadDatabase()
  };
}


function normalizeCloudCurrency(value) {
  const currency = String(value || 'BRL').toUpperCase();
  return ['BRL', 'USD', 'EUR', 'PYG', 'ARS'].includes(currency) ? currency : 'BRL';
}

function mapCloudMethodToTender(method) {
  const normalized = String(method || '').toUpperCase();
  if (normalized.includes('CREDIT')) return 'CREDIT_CARD_ONLINE';
  if (normalized.includes('DEBIT')) return 'DEBIT_CARD_ONLINE';
  return 'PIX_ONLINE';
}

function convertCloudAmountToBaseCents(db, amountCents, currency) {
  const numericAmount = Number(amountCents || 0);
  const normalizedCurrency = normalizeCloudCurrency(currency);
  if (normalizedCurrency === 'BRL') return numericAmount;
  const rates = normalizeExchangeRates(db.settings?.exchangeRates || defaultExchangeRates());
  const rate = Number(rates[normalizedCurrency] || 0);
  if (!Number.isFinite(rate) || rate <= 0) return numericAmount;
  return Math.round(numericAmount * rate);
}

async function syncCloudSales(input = {}) {
  const db = getMutableDatabase();
  const settings = getCloudConfig();
  const targetSessionCode = String(input.sessionCode || '').trim();
  const publishedSessions = (db.sessions || []).filter((session) => {
    if (targetSessionCode && session.code !== targetSessionCode) return false;
    return Boolean(session.publicSlug || session.cloudGalleryUrl || session.postTourUrl);
  });

  const publicSlugs = publishedSessions.map((session) => ensurePostTourFields(session).publicSlug).filter(Boolean);
  if (!publicSlugs.length) {
    return {
      ok: false,
      message: 'Nenhuma sessão publicada na cloud foi encontrada para sincronizar.',
      importedSales: 0,
      updatedPhotos: 0,
      matchedSessions: 0,
      database: loadDatabase()
    };
  }

  const params = new URLSearchParams();
  params.set('publicSlugs', publicSlugs.join(','));
  if (input.since) params.set('since', String(input.since));

  const result = await cloudRequest(`/api/sync/sales?${params.toString()}`, { method: 'GET' });
  const remoteSessions = Array.isArray(result.sessions) ? result.sessions : [];
  const remoteSales = Array.isArray(result.sales) ? result.sales : [];
  const remoteCheckouts = Array.isArray(result.checkouts) ? result.checkouts : [];
  const sessionBySlug = new Map(publishedSessions.map((session) => [ensurePostTourFields(session).publicSlug, session]));

  let updatedPhotos = 0;
  const purchasedPhotoIds = new Set();
  for (const remoteSession of remoteSessions) {
    const localSession = sessionBySlug.get(remoteSession.publicSlug);
    if (!localSession) continue;
    const remotePhotos = Array.isArray(remoteSession.photos) ? remoteSession.photos : [];
    for (const remotePhoto of remotePhotos) {
      if (String(remotePhoto.status || '').toUpperCase() !== 'PURCHASED') continue;
      const localPhoto = (db.photos || []).find((photo) => photo.sessionCode === localSession.code && photo.id === remotePhoto.id);
      if (!localPhoto) continue;
      purchasedPhotoIds.add(localPhoto.id);
      if (localPhoto.status !== 'PURCHASED' || localPhoto.selected) updatedPhotos += 1;
    }
  }

  if (purchasedPhotoIds.size) {
    db.photos = (db.photos || []).map((photo) => (
      purchasedPhotoIds.has(photo.id) ? { ...photo, status: 'PURCHASED', selected: false } : photo
    ));
  }

  let importedSales = 0;
  for (const remoteSale of remoteSales) {
    const localSession = sessionBySlug.get(remoteSale.publicSlug);
    if (!localSession) continue;
    const alreadyRegistered = (db.cashierSales || []).some((sale) => (
      (remoteSale.id && sale.cloudSaleId === remoteSale.id)
      || (remoteSale.externalReference && sale.externalReference === remoteSale.externalReference)
      || (remoteSale.checkoutId && sale.onlineCheckoutId === remoteSale.checkoutId)
    ));
    if (alreadyRegistered) continue;

    const currency = normalizeCloudCurrency(remoteSale.currency);
    const amountCents = Number(remoteSale.amountCents || 0);
    db.cashierSales = [attachCommissionToSale(db, normalizeSaleDeliveryFields({
      id: makeId('sale'),
      code: generateSaleCode(db),
      sellerName: 'Galeria cloud',
      method: mapCloudMethodToTender(remoteSale.method),
      currency,
      amountCents,
      amountBaseCents: convertCloudAmountToBaseCents(db, amountCents, currency),
      createdAt: remoteSale.createdAt || nowIso(),
      channel: 'POST_TOUR',
      sessionCode: localSession.code,
      onlineCheckoutId: remoteSale.checkoutId,
      externalReference: remoteSale.externalReference,
      gatewayPaymentId: remoteSale.paymentId,
      cloudSaleId: remoteSale.id,
      cloudSyncedAt: nowIso(),
      packageName: remoteSale.packageName,
      photoIds: Array.isArray(remoteSale.photoIds) ? remoteSale.photoIds : [],
      deliveryExpiresAt: addDaysIso(7),
      deliveryStatus: 'PENDING',
      saleStatus: 'ACTIVE'
    })), ...(db.cashierSales || [])];
    importedSales += 1;
  }

  for (const remoteCheckout of remoteCheckouts) {
    const localSession = sessionBySlug.get(remoteCheckout.publicSlug);
    if (!localSession) continue;
    const checkoutId = remoteCheckout.id || remoteCheckout.checkoutId;
    if (!checkoutId) continue;
    const exists = (db.onlineCheckouts || []).some((checkout) => checkout.id === checkoutId || checkout.externalReference === remoteCheckout.externalReference);
    if (exists) {
      db.onlineCheckouts = (db.onlineCheckouts || []).map((checkout) => {
        if (checkout.id !== checkoutId && checkout.externalReference !== remoteCheckout.externalReference) return checkout;
        return {
          ...checkout,
          status: remoteCheckout.status || checkout.status,
          gatewayStatus: remoteCheckout.gatewayStatus || checkout.gatewayStatus,
          gatewayPaymentId: remoteCheckout.paymentId || checkout.gatewayPaymentId,
          paidAt: remoteCheckout.paidAt || checkout.paidAt
        };
      });
    } else {
      db.onlineCheckouts = [{
        id: checkoutId,
        gateway: 'MERCADO_PAGO',
        environment: (db.settings?.mercadoPago?.environment || 'sandbox'),
        sessionCode: localSession.code,
        photoIds: Array.isArray(remoteCheckout.photoIds) ? remoteCheckout.photoIds : [],
        packageName: remoteCheckout.packageName || 'Pacote cloud',
        amountCents: Number(remoteCheckout.amountCents || 0),
        currency: normalizeCloudCurrency(remoteCheckout.currency),
        preferenceId: remoteCheckout.preferenceId,
        externalReference: remoteCheckout.externalReference || `cloud-${checkoutId}`,
        checkoutUrl: remoteCheckout.checkoutUrl,
        sandboxCheckoutUrl: remoteCheckout.sandboxCheckoutUrl,
        status: remoteCheckout.status || 'UNKNOWN',
        gatewayStatus: remoteCheckout.gatewayStatus || 'cloud_sync',
        gatewayPaymentId: remoteCheckout.paymentId,
        createdAt: remoteCheckout.createdAt || nowIso(),
        paidAt: remoteCheckout.paidAt,
        autoReleaseTriggered: String(remoteCheckout.status || '').toUpperCase() === 'APPROVED',
        lastCheckedAt: remoteCheckout.updatedAt || remoteCheckout.createdAt
      }, ...(db.onlineCheckouts || [])];
    }
  }

  const syncAt = nowIso();
  db.sessions = (db.sessions || []).map((session) => {
    const hydrated = ensurePostTourFields(session);
    if (!publicSlugs.includes(hydrated.publicSlug)) return session;
    return {
      ...session,
      cloudLastSalesSyncAt: syncAt,
      cloudLastSalesSyncSummary: { importedSales, updatedPhotos, at: syncAt }
    };
  });

  addAuditLog(db, { category: 'CLOUD', action: 'CLOUD.SYNC_SALES', severity: 'INFO', ...actorFromInput(input, 'Operador'), summary: `Sincronização cloud: ${importedSales} venda(s) importada(s) e ${updatedPhotos} foto(s) atualizada(s).`, details: { importedSales, updatedPhotos, matchedSessions: remoteSessions.length, targetSessionCode } });
  saveDatabase(db);

  return {
    ok: true,
    message: `Sincronização cloud concluída: ${importedSales} venda(s) importada(s) e ${updatedPhotos} foto(s) atualizada(s) como compradas no desktop.`,
    importedSales,
    updatedPhotos,
    matchedSessions: remoteSessions.length,
    database: loadDatabase()
  };
}


function getGallerySession(publicSlug) {
  const db = getMutableDatabase();
  const session = (db.sessions || [])
    .map((item) => ensurePostTourFields(item))
    .find((item) => item.publicSlug === publicSlug);
  return { db, session };
}

function getGalleryAccessCode(reqUrl, body = {}) {
  return String(reqUrl.searchParams.get('code') || body.code || '').trim();
}

function validateGalleryAccess(publicSlug, code) {
  const { db, session } = getGallerySession(publicSlug);
  if (!session) {
    const error = new Error('Galeria não encontrada.');
    error.statusCode = 404;
    throw error;
  }

  if (!session.postTourEnabled) {
    const error = new Error('Galeria pós-passeio desativada para esta sessão.');
    error.statusCode = 403;
    throw error;
  }

  if (session.expiresAt && new Date(session.expiresAt).getTime() < Date.now()) {
    const error = new Error('Esta galeria expirou. Fale com o parque para reativar o acesso.');
    error.statusCode = 410;
    throw error;
  }

  if (session.accessCode && String(code) !== String(session.accessCode)) {
    const error = new Error('Código de acesso inválido.');
    error.statusCode = 401;
    throw error;
  }

  return { db, session };
}

function getPublicGalleryPhotos(db, session, accessCode) {
  return (db.photos || [])
    .filter((photo) => photo.sessionCode === session.code)
    .map((photo) => ({
      id: photo.id,
      code: photo.code,
      label: photo.label,
      kind: photo.kind,
      status: photo.status,
      backgroundName: photo.backgroundName,
      previewUrl: `/api/gallery/${encodeURIComponent(session.publicSlug)}/photo/${encodeURIComponent(photo.id)}/preview?code=${encodeURIComponent(accessCode)}`,
      downloadUrl: photo.status === 'PURCHASED'
        ? `/api/gallery/${encodeURIComponent(session.publicSlug)}/photo/${encodeURIComponent(photo.id)}/download?code=${encodeURIComponent(accessCode)}`
        : null
    }));
}

function writeJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type,x-pictour-sync-token'
  });
  res.end(body);
}

function writeText(res, statusCode, content, contentType = 'text/html; charset=utf-8') {
  res.writeHead(statusCode, {
    'content-type': contentType,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  });
  res.end(content);
}

function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 35_000_000) {
        reject(new Error('Payload grande demais. Envie menos fotos por lote.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('JSON inválido.'));
      }
    });
    req.on('error', reject);
  });
}

function sendPhotoFile(res, photo, disposition = 'inline') {
  if (!photo?.storedPath || !fs.existsSync(photo.storedPath)) {
    return writeJson(res, 404, { ok: false, message: 'Arquivo da foto não encontrado.' });
  }

  const mimeType = getMimeTypeForExtension(photo.storedPath);
  const ext = path.extname(photo.storedPath) || '.jpg';
  const safeName = `${slugify(photo.code || 'foto')}-${slugify(photo.label || 'pictour')}${ext}`;

  res.writeHead(200, {
    'content-type': mimeType,
    'content-length': fs.statSync(photo.storedPath).size,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'content-disposition': `${disposition}; filename="${safeName}"`
  });
  fs.createReadStream(photo.storedPath).pipe(res);
}


function isDigitalGalleryPackage(packageOption = {}) {
  const name = String(packageOption.name || '').toLowerCase();
  const blocked = ['impress', 'porta-retrato', 'porta retrato', 'moldura', 'frame', 'print ', 'printed', 'fisic', 'físic'];
  return !blocked.some((term) => name.includes(term));
}

function getGalleryPackages(db, session) {
  const settings = db.settings || {};
  const sessionLocation = String(session.locationName || settings.locationName || '').trim().toLowerCase();
  return normalizePackages(settings.packages || defaultPackages(settings), settings)
    .filter((packageOption) => packageOption.active !== false)
    .filter(isDigitalGalleryPackage)
    .filter((packageOption) => {
      const pkgLocation = String(packageOption.locationName || '').trim().toLowerCase();
      return !pkgLocation || !sessionLocation || pkgLocation === sessionLocation || pkgLocation === String(settings.locationName || '').trim().toLowerCase();
    })
    .sort((a, b) => Number(a.priceCents || 0) - Number(b.priceCents || 0))
    .map((packageOption) => ({
      id: packageOption.id,
      name: packageOption.name,
      locationName: packageOption.locationName,
      photoQuantity: packageOption.photoQuantity,
      includesAllPhotos: Boolean(packageOption.includesAllPhotos),
      priceCents: Number(packageOption.priceCents || 0),
      currency: packageOption.currency || 'BRL',
      pricingMode: packageOption.pricingMode || (packageOption.includesAllPhotos ? 'FIXED' : 'PER_PHOTO')
    }));
}

function calculateGalleryPackageTotal(packageOption, selectedPhotoCount, totalSessionPhotos) {
  const count = Math.max(0, Number(selectedPhotoCount || 0));
  if (!count || !packageOption) return 0;
  if (packageOption.includesAllPhotos || packageOption.pricingMode === 'FIXED') return Math.max(0, Number(packageOption.priceCents || 0));
  return Math.max(0, Number(packageOption.priceCents || 0)) * count;
}

function pickGalleryPackage(db, session, packageId, selectedCount) {
  const packages = getGalleryPackages(db, session);
  const selected = packages.find((packageOption) => packageOption.id === packageId)
    || packages.find((packageOption) => !packageOption.includesAllPhotos && Number(packageOption.photoQuantity || 0) >= selectedCount)
    || packages[0];
  return { packages, selected };
}

function publicGalleryHtml() {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PicTour — Galeria Premium</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #050b14; color: #f9fafb; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: radial-gradient(circle at top left, rgba(33,150,255,.22), transparent 31%), radial-gradient(circle at bottom right, rgba(34,197,94,.12), transparent 26%), #050b14; }
    .app { width: min(1180px, calc(100% - 28px)); margin: 0 auto; padding: 22px 0 44px; }
    .hero { background: linear-gradient(135deg, rgba(11,116,255,.26), rgba(11,18,32,.94)); border: 1px solid rgba(255,255,255,.1); border-radius: 30px; padding: 24px; box-shadow: 0 24px 70px rgba(0,0,0,.34); }
    .brand { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
    .logo { width: 46px; height: 46px; border-radius: 17px; background: #0b74ff; display: grid; place-items: center; font-weight: 900; box-shadow: 0 14px 40px rgba(11,116,255,.3); }
    .pill { border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.08); color: #dbeafe; padding: 8px 12px; border-radius: 999px; font-size: 12px; font-weight: 900; }
    h1 { margin: 0; font-size: clamp(30px, 6vw, 52px); letter-spacing: -.05em; line-height: .96; }
    h2, h3 { margin: 0; letter-spacing: -.03em; }
    p { color: #b8c3d9; line-height: 1.55; }
    .access { display: grid; grid-template-columns: 1fr auto; gap: 10px; margin-top: 18px; }
    input, select { width: 100%; border: 1px solid rgba(255,255,255,.14); border-radius: 16px; background: rgba(255,255,255,.08); color: #fff; padding: 14px 14px; font: inherit; outline: none; }
    option { background:#0b1220; color:#fff; }
    button { border: 0; border-radius: 16px; padding: 14px 16px; font: inherit; font-weight: 900; color: #fff; background: #0b74ff; cursor: pointer; box-shadow: 0 16px 34px rgba(11,116,255,.28); }
    button.secondary { background: rgba(255,255,255,.09); border: 1px solid rgba(255,255,255,.14); box-shadow: none; }
    button.upsell { background: linear-gradient(135deg,#0b74ff,#22c55e); }
    button:disabled { opacity: .5; cursor: not-allowed; }
    .status { margin-top: 12px; min-height: 24px; color: #dbeafe; font-weight: 800; }
    .layout { display:grid; grid-template-columns: minmax(0,1fr) 360px; gap:16px; margin-top:20px; align-items:start; }
    .toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
    .total { font-size: 18px; font-weight: 950; color: #fff; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 14px; }
    .photo { position: relative; overflow: hidden; border-radius: 24px; border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.06); min-height: 250px; display: flex; flex-direction: column; }
    .photo.selected { border-color: rgba(33,150,255,.95); box-shadow: 0 0 0 3px rgba(33,150,255,.18); }
    .photo.purchased { border-color: rgba(34,197,94,.65); }
    .photo img { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; display: block; user-select: none; -webkit-user-drag: none; filter: saturate(.82) contrast(.91); }
    .wm { pointer-events: none; position: absolute; inset: -20%; display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; align-items: center; justify-items: center; transform: rotate(var(--wm-rotation,-24deg)); opacity: var(--wm-opacity,.74); color: rgba(255,255,255,.9); font-size: 10px; font-weight: 950; text-shadow: 0 2px 10px rgba(0,0,0,.9); }
    .wm span { white-space: nowrap; padding: 6px 12px; border: 1px solid rgba(255,255,255,.18); background: rgba(0,0,0,.14); border-radius: 999px; }
    .meta { padding: 12px; display: grid; gap: 3px; }
    .meta span { color: #9ca3af; font-size: 12px; }
    .actions { padding: 0 12px 12px; margin-top: auto; }
    .actions button { width: 100%; padding: 11px 12px; }
    .side { display:grid; gap:14px; position:sticky; top:14px; }
    .card { border:1px solid rgba(255,255,255,.1); border-radius:24px; background:rgba(255,255,255,.06); padding:16px; box-shadow:0 20px 60px rgba(0,0,0,.22); }
    .packages { display:grid; gap:10px; margin-top:12px; }
    .pkg { text-align:left; display:flex; justify-content:space-between; gap:10px; align-items:center; width:100%; background:rgba(255,255,255,.07); border:1px solid rgba(255,255,255,.12); box-shadow:none; }
    .pkg.active { border-color:#0b74ff; box-shadow:0 0 0 3px rgba(11,116,255,.18); }
    .pkg.recommended { border-color:rgba(34,197,94,.8); }
    .pkg b { min-width:34px;height:34px;border-radius:12px;background:#0b74ff;display:grid;place-items:center;font-size:20px; }
    .slotList { display:grid; gap:10px; margin-top:12px; }
    .slot { border:1px solid rgba(255,255,255,.12); border-radius:18px; padding:11px; background:rgba(255,255,255,.06); cursor:pointer; }
    .slot.active { border-color:#0b74ff; box-shadow:0 0 0 3px rgba(11,116,255,.16); }
    .slot strong, .slot span, .slot em { display:block; }
    .slot span { color:#93c5fd;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.1em; }
    .slot em { color:#b8c3d9;font-size:12px;margin-top:4px;font-style:normal; }
    .slot .slotActions { display:flex;gap:8px;margin-top:9px; }
    .slot .slotActions button { padding:8px 9px;border-radius:10px;font-size:12px;box-shadow:none; }
    .paymentMethods { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:12px; }
    .payMethod { background:rgba(255,255,255,.07); border:1px solid rgba(255,255,255,.12); box-shadow:none; }
    .payMethod.active { background:linear-gradient(135deg,#0b74ff,#22c55e); border:0; }
    .pkg small { display:block; color:#b8c3d9; font-weight:700; margin-top:3px; }
    .summary { display:grid; gap:10px; color:#cbd5e1; margin:12px 0; }
    .summary div { display:flex; justify-content:space-between; gap:10px; }
    .summary strong { color:#fff; }
    .notice { border-radius:18px; background:rgba(34,197,94,.1); border:1px solid rgba(34,197,94,.24); padding:12px; color:#dcfce7; font-weight:800; }
    .empty { grid-column: 1 / -1; padding: 28px; border: 1px dashed rgba(255,255,255,.18); border-radius: 24px; text-align: center; color: #b8c3d9; }
    .foot { color:#7d8aa3; font-size:12px; text-align:center; margin-top:22px; }
    .hidden { display:none !important; }
    a { color: inherit; text-decoration: none; }
    @media (max-width: 860px) { .layout { grid-template-columns: 1fr; } .side { position: static; } .access { grid-template-columns: 1fr; } .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; } .photo { min-height: 0; border-radius: 18px; } .photo img { aspect-ratio: 16 / 9; } .meta { padding: 9px; } .meta strong { font-size: 12px; } .meta span { font-size: 10px; } .actions { padding: 0 9px 9px; } .actions button { font-size: 11px; padding: 9px 8px; } }
  </style>
</head>
<body oncontextmenu="return false">
  <main class="app">
    <section class="hero">
      <div class="brand"><div style="display:flex;align-items:center;gap:12px"><div class="logo">PT</div><strong>PicTour Premium Gallery</strong></div><span class="pill" id="expiryPill">Acesso protegido</span></div>
      <h1 id="title">Sua galeria está quase pronta</h1>
      <p id="subtitle">Digite o código recebido no parque para visualizar previews protegidos e comprar apenas produtos digitais disponíveis online.</p>
      <div class="access"><input id="codeInput" placeholder="Código de acesso" inputmode="numeric" autocomplete="one-time-code" /><button id="loadButton">Abrir galeria</button></div>
      <div class="status" id="status">Aguardando acesso.</div>
    </section>

    <section class="layout">
      <div>
        <section class="toolbar">
          <div class="total" id="total">0 foto(s) selecionada(s)</div>
          <div style="display:flex; gap:10px; flex-wrap:wrap">
            <button class="secondary" id="selectAllButton">Selecionar pendentes</button>
            <button class="secondary" id="clearButton">Limpar</button>
          </div>
        </section>
        <section class="grid" id="grid"></section>
      </div>
      <aside class="side">
        <section class="card">
          <p class="pill" style="display:inline-block;margin:0 0 12px">Upsell inteligente</p>
          <h2>Adicione itens ao carrinho</h2>
          <p>Clique no “+” para criar slots digitais independentes. Produtos impressos e porta-retratos continuam disponíveis somente no parque.</p>
          <div class="packages" id="packages"></div>
        </section>
        <section class="card">
          <h2>Carrinho</h2>
          <div class="summary">
            <div><span>Itens preenchidos</span><strong id="cartCount">0</strong></div>
            <div><span>Produtos</span><strong id="cartPackage">—</strong></div>
            <div><span>Total</span><strong id="cartTotal">R$ 0,00</strong></div>
          </div>
          <div class="slotList" id="slotList"></div>
          <div class="notice" id="upsellNotice">Adicione um item no “+” e toque em uma foto para preencher o slot.</div>
          <div class="paymentMethods"><button class="payMethod active" data-payment="PIX_ONLINE">Pix</button><button class="payMethod" data-payment="CREDIT_CARD_ONLINE">Cartão</button></div>
          <button class="upsell" id="purchaseButton" style="width:100%;margin-top:12px">Finalizar checkout</button>
          <p style="font-size:12px;margin-bottom:0">O checkout online libera apenas fotos digitais. Impressos, molduras e porta-retratos são vendidos presencialmente no parque.</p>
        </section>
      </aside>
    </section>
    <div class="foot">Preview com marca d’água dinâmica, resolução reduzida e sessão identificável. Fotos finais ficam disponíveis somente após pagamento/liberação.</div>
  </main>
  <script>
    const parts = location.pathname.split('/').filter(Boolean);
    const slug = parts[1] || '';
    const params = new URLSearchParams(location.search);
    const codeInput = document.getElementById('codeInput');
    const loadButton = document.getElementById('loadButton');
    const statusEl = document.getElementById('status');
    const titleEl = document.getElementById('title');
    const subtitleEl = document.getElementById('subtitle');
    const expiryPill = document.getElementById('expiryPill');
    const gridEl = document.getElementById('grid');
    const totalEl = document.getElementById('total');
    const packagesEl = document.getElementById('packages');
    const slotListEl = document.getElementById('slotList');
    const cartCountEl = document.getElementById('cartCount');
    const cartPackageEl = document.getElementById('cartPackage');
    const cartTotalEl = document.getElementById('cartTotal');
    const upsellNoticeEl = document.getElementById('upsellNotice');
    const purchaseButton = document.getElementById('purchaseButton');
    const selectAllButton = document.getElementById('selectAllButton');
    const clearButton = document.getElementById('clearButton');
    let gallery = null;
    let slots = [];
    let activeSlotId = '';
    let paymentMethod = 'PIX_ONLINE';
    codeInput.value = params.get('code') || '';

    function setStatus(text) { statusEl.textContent = text; }
    function getCode() { return codeInput.value.trim(); }
    function money(cents, currency = 'BRL') { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(Number(cents || 0) / 100); }
    function makeSlotId(){ return 'slot_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8); }
    async function requestJson(url, options) { const res = await fetch(url, options); const data = await res.json(); if (!res.ok || data.ok === false) throw new Error(data.message || 'Erro na galeria.'); return data; }
    function antiPrintConfig(){ return gallery?.antiPrint || {}; }
    function wmText(photo) {
      const ap = antiPrintConfig();
      const parts = [ap.watermarkText || 'PICTOUR PREVIEW'];
      if (ap.includeSessionCode !== false) parts.push(gallery?.session?.code || 'SESSÃO');
      if (ap.includePhotoCode !== false) parts.push(photo.code || 'FOTO');
      if (ap.includeTimestamp) parts.push(new Date().toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' }));
      return parts.join(' • ');
    }
    function packageTotal(pkg) { return pkg ? Math.max(0, Number(pkg.priceCents || 0)) : 0; }
    function findPackage(id){ return (gallery?.packages || []).find((item) => item.id === id); }
    function selectedPhotoIds(){ return Array.from(new Set(slots.map((slot) => slot.photoId).filter(Boolean))); }
    function filledSlots(){ return slots.filter((slot) => slot.photoId); }
    function cartTotal(){ return filledSlots().reduce((sum, slot) => sum + packageTotal(findPackage(slot.packageId)), 0); }
    function cartCurrency(){ return findPackage(filledSlots()[0]?.packageId)?.currency || 'BRL'; }
    function cartSummary(){
      const counts = new Map();
      filledSlots().forEach((slot) => counts.set(slot.packageId, (counts.get(slot.packageId) || 0) + 1));
      return Array.from(counts.entries()).map(([packageId,count]) => (findPackage(packageId)?.name || 'Item') + ' ×' + count).join(' + ') || '—';
    }
    function addSlot(packageId){
      const id = makeSlotId();
      slots.push({ id, packageId, photoId: null });
      activeSlotId = id;
      render();
    }
    function removeSlot(id){ slots = slots.filter((slot) => slot.id !== id); if (activeSlotId === id) activeSlotId = slots[0]?.id || ''; render(); }
    function clearSlot(id){ slots = slots.map((slot) => slot.id === id ? { ...slot, photoId: null } : slot); activeSlotId = id; render(); }
    function assignPhoto(photoId){
      const photo = (gallery?.photos || []).find((item) => item.id === photoId);
      if (!photo || photo.status === 'PURCHASED') return;
      let targetId = activeSlotId && slots.some((slot) => slot.id === activeSlotId) ? activeSlotId : '';
      if (!targetId) {
        const firstPackage = (gallery?.packages || [])[0];
        if (!firstPackage) return;
        targetId = makeSlotId();
        slots.push({ id: targetId, packageId: firstPackage.id, photoId: null });
      }
      slots = slots.map((slot) => slot.id === targetId ? { ...slot, photoId } : slot);
      activeSlotId = targetId;
      render();
    }
    function renderPackages() {
      const packages = gallery?.packages || [];
      packagesEl.innerHTML = packages.map((pkg) => '<button class="pkg" data-add="' + pkg.id + '"><span><strong>' + pkg.name + '</strong><small>' + money(pkg.priceCents, pkg.currency) + ' • ' + (pkg.photoQuantity ? pkg.photoQuantity + ' foto(s)' : 'item') + '</small></span><b>+</b></button>').join('');
      packagesEl.querySelectorAll('[data-add]').forEach((button) => button.addEventListener('click', () => addSlot(button.getAttribute('data-add'))));
    }
    function renderSlots(){
      slotListEl.innerHTML = slots.length ? slots.map((slot, index) => {
        const pkg = findPackage(slot.packageId);
        const photo = (gallery?.photos || []).find((item) => item.id === slot.photoId);
        return '<article class="slot ' + (slot.id === activeSlotId ? 'active' : '') + '" data-slot="' + slot.id + '"><span>Slot ' + (index + 1) + '</span><strong>' + (pkg?.name || 'Produto') + '</strong><em>' + (photo ? photo.code + ' • ' + photo.label : 'Toque em uma foto para preencher') + '</em><em>' + money(pkg?.priceCents || 0, pkg?.currency || 'BRL') + '</em><div class="slotActions"><button class="secondary" data-clear="' + slot.id + '">Trocar</button><button class="secondary" data-remove="' + slot.id + '">Remover</button></div></article>';
      }).join('') : '<div class="empty" style="padding:16px">Nenhum item adicionado.</div>';
      slotListEl.querySelectorAll('[data-slot]').forEach((item) => item.addEventListener('click', () => { activeSlotId = item.getAttribute('data-slot'); render(); }));
      slotListEl.querySelectorAll('[data-clear]').forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); clearSlot(button.getAttribute('data-clear')); }));
      slotListEl.querySelectorAll('[data-remove]').forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); removeSlot(button.getAttribute('data-remove')); }));
    }
    function renderCart() {
      const filled = filledSlots();
      const total = cartTotal();
      totalEl.textContent = filled.length + ' item(ns) • ' + selectedPhotoIds().length + ' foto(s) única(s) • ' + money(total, cartCurrency());
      cartCountEl.textContent = String(filled.length);
      cartPackageEl.textContent = cartSummary();
      cartTotalEl.textContent = money(total, cartCurrency());
      purchaseButton.disabled = filled.length === 0 || total <= 0;
      upsellNoticeEl.textContent = slots.length ? (filled.length + ' de ' + slots.length + ' slot(s) preenchido(s). Pagamento: ' + (paymentMethod === 'PIX_ONLINE' ? 'Pix' : 'Cartão') + '.') : 'Adicione um item no “+” e toque em uma foto para preencher o slot.';
      document.querySelectorAll('[data-payment]').forEach((button) => button.classList.toggle('active', button.getAttribute('data-payment') === paymentMethod));
      renderSlots();
    }
    function render() {
      const photos = gallery?.photos || [];
      const pending = photos.filter((photo) => photo.status !== 'PURCHASED');
      selectAllButton.disabled = pending.length === 0;
      clearButton.disabled = slots.length === 0;
      renderPackages();
      renderCart();
      const chosen = new Set(selectedPhotoIds());
      if (!photos.length) { gridEl.innerHTML = '<div class="empty">Esta sessão ainda não tem fotos disponíveis.</div>'; return; }
      gridEl.innerHTML = photos.map((photo) => {
        const isPurchased = photo.status === 'PURCHASED';
        const isSelected = chosen.has(photo.id);
        const ap = antiPrintConfig();
        const marks = Array.from({ length: Math.max(8, Math.min(48, Number(ap.density || 24))) }, () => '<span>' + wmText(photo) + '</span>').join('');
        const wmStyle = '--wm-opacity:' + (Math.max(5, Math.min(85, Number(ap.opacity || 38))) / 100) + ';--wm-rotation:' + Number(ap.rotationDeg || -24) + 'deg;';
        return '<article class="photo ' + (isSelected ? 'selected ' : '') + (isPurchased ? 'purchased' : '') + '">' +
          '<div style="position:relative"><img draggable="false" src="' + photo.previewUrl + '" alt="' + photo.code + '"/>' + (ap.enabled === false ? '' : '<div class="wm" style="' + wmStyle + '">' + marks + '</div>') + '</div>' +
          '<div class="meta"><strong>' + photo.code + ' — ' + photo.label + '</strong><span>' + (isPurchased ? 'Liberada para download' : (isSelected ? 'Selecionada em item do carrinho' : 'Preview protegido')) + '</span></div>' +
          '<div class="actions">' +
            (isPurchased ? '<a href="' + photo.downloadUrl + '"><button>Baixar foto</button></a>' : '<button class="secondary" data-select="' + photo.id + '">' + (activeSlotId ? 'Enviar para slot ativo' : 'Selecionar em novo slot') + '</button>') +
          '</div></article>';
      }).join('');
      gridEl.querySelectorAll('[data-select]').forEach((button) => button.addEventListener('click', () => assignPhoto(button.getAttribute('data-select'))));
    }
    async function loadGallery() {
      try {
        setStatus('Carregando galeria premium...');
        gallery = await requestJson('/api/gallery/' + encodeURIComponent(slug) + '?code=' + encodeURIComponent(getCode()));
        history.replaceState(null, '', '/g/' + encodeURIComponent(slug) + '?code=' + encodeURIComponent(getCode()));
        titleEl.textContent = gallery.session.customerName;
        subtitleEl.textContent = gallery.session.locationName + ' • Sessão ' + gallery.session.code;
        expiryPill.textContent = gallery.session.expiresAt ? ('Expira em ' + new Date(gallery.session.expiresAt).toLocaleDateString('pt-BR')) : 'Sem expiração';
        slots = [];
        activeSlotId = '';
        setStatus('Galeria carregada. Adicione itens no carrinho e escolha uma foto para cada slot.');
        render();
      } catch (error) {
        setStatus(error.message || 'Não consegui carregar a galeria.');
        gridEl.innerHTML = '<div class="empty">Confira o código de acesso com o vendedor.</div>';
      }
    }
    selectAllButton.addEventListener('click', () => {
      const firstPackage = (gallery?.packages || [])[0];
      if (!firstPackage) return;
      (gallery?.photos || []).forEach((photo) => { if (photo.status !== 'PURCHASED') slots.push({ id: makeSlotId(), packageId: firstPackage.id, photoId: photo.id }); });
      activeSlotId = slots[slots.length - 1]?.id || '';
      render();
    });
    clearButton.addEventListener('click', () => { slots = []; activeSlotId = ''; render(); });
    document.querySelectorAll('[data-payment]').forEach((button) => button.addEventListener('click', () => { paymentMethod = button.getAttribute('data-payment') || 'PIX_ONLINE'; render(); }));
    purchaseButton.addEventListener('click', async () => {
      try {
        const lineItems = filledSlots().map((slot) => { const pkg = findPackage(slot.packageId); const photo = (gallery?.photos || []).find((item) => item.id === slot.photoId); return { id: slot.id, packageId: slot.packageId, packageName: pkg?.name || 'Item', photoId: slot.photoId, photoCode: photo?.code, priceCents: Number(pkg?.priceCents || 0), currency: pkg?.currency || 'BRL' }; });
        setStatus('Processando checkout modular...');
        await requestJson('/api/gallery/' + encodeURIComponent(slug) + '/purchase', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: getCode(), saleLineItems: lineItems, paymentMethod }) });
        setStatus('Compra liberada. Fotos disponíveis para download.');
        await loadGallery();
      } catch (error) { setStatus(error.message || 'Falha ao finalizar checkout.'); }
    });
    loadButton.addEventListener('click', loadGallery);
    codeInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') loadGallery(); });
    if (codeInput.value) loadGallery();
  </script>
</body>
</html>`;
}



function crc32Buffer(buffer) {
  let crc = ~0;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let j = 0; j < 8; j += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (~crc) >>> 0;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosTime, dosDate };
}

function createZipBuffer(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const { dosTime, dosDate } = dosDateTime();
  for (const file of files) {
    const nameBuffer = Buffer.from(file.name, 'utf8');
    const data = fs.readFileSync(file.path);
    const crc = crc32Buffer(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, nameBuffer, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuffer);
    offset += local.length + nameBuffer.length + data.length;
  }
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, ...centralParts, end]);
}

function getDeliveryPhotos(db, sale) {
  const ids = new Set(getSalePhotoIds(sale));
  return (db.photos || []).filter((photo) => ids.has(photo.id));
}

function getDeliverablePhotos(db, sale) {
  return getDeliveryPhotos(db, sale).filter((photo) => photo.storedPath && fs.existsSync(photo.storedPath));
}

function validateDeliveryAccess(deliverySlug) {
  const db = getMutableDatabase();
  const sale = getSaleByDeliverySlug(db, deliverySlug);
  if (!sale) {
    const error = new Error('Entrega não encontrada. Confira o link com o operador.');
    error.statusCode = 404;
    throw error;
  }
  if (sale.deliveryExpiresAt && new Date(sale.deliveryExpiresAt).getTime() < Date.now()) {
    const error = new Error('Este link de entrega expirou. Fale com o parque para gerar um novo link.');
    error.statusCode = 410;
    throw error;
  }
  const photos = getDeliveryPhotos(db, sale);
  return { db, sale: normalizeSaleDeliveryFields(sale), photos, session: getSaleSession(db, sale) };
}

function deliveryPortalHtml() {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PicTour — Entrega das fotos</title>
  <style>
    :root{color-scheme:dark;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#050b14;color:#f8fafc}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at top left,rgba(11,116,255,.24),transparent 34%),radial-gradient(circle at bottom right,rgba(34,197,94,.16),transparent 28%),#050b14}.app{width:min(1120px,calc(100% - 28px));margin:0 auto;padding:26px 0 46px}.hero{border:1px solid rgba(255,255,255,.12);background:linear-gradient(135deg,rgba(11,116,255,.24),rgba(8,14,28,.96));border-radius:30px;padding:24px;box-shadow:0 24px 70px rgba(0,0,0,.36)}.brand{display:flex;justify-content:space-between;gap:12px;align-items:center}.logo{width:48px;height:48px;border-radius:18px;background:#0b74ff;display:grid;place-items:center;font-weight:950}.pill{border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.08);border-radius:999px;padding:8px 12px;color:#dbeafe;font-size:12px;font-weight:900}h1{margin:16px 0 0;font-size:clamp(32px,7vw,58px);letter-spacing:-.06em;line-height:.95}p{color:#b7c4d8;line-height:1.55}.status{margin-top:14px;color:#dbeafe;font-weight:850}.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px}button,a.button{border:0;border-radius:16px;padding:14px 16px;font:inherit;font-weight:900;color:#fff;background:linear-gradient(135deg,#0b74ff,#22c55e);box-shadow:0 18px 38px rgba(11,116,255,.28);cursor:pointer;text-decoration:none;display:inline-block}.secondary{background:rgba(255,255,255,.09)!important;border:1px solid rgba(255,255,255,.14)!important;box-shadow:none!important}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px;margin-top:20px}.photo{border:1px solid rgba(255,255,255,.1);border-radius:24px;overflow:hidden;background:rgba(255,255,255,.06)}.photo img{width:100%;height:230px;object-fit:cover;display:block}.meta{padding:13px;display:grid;gap:5px}.meta span{font-size:12px;color:#9ca3af}.empty{border:1px dashed rgba(255,255,255,.18);border-radius:24px;padding:24px;background:rgba(255,255,255,.05);color:#cbd5e1}.summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:18px}.summary div{border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.07);border-radius:18px;padding:14px}.summary strong{display:block;font-size:22px}.summary span{font-size:12px;color:#9fb0c7}@media(max-width:720px){.summary{grid-template-columns:repeat(2,1fr)}.actions{display:grid}.photo img{height:210px}}
  </style>
</head>
<body>
  <main class="app">
    <section class="hero">
      <div class="brand"><div class="logo">PT</div><span class="pill" id="expirePill">Entrega segura</span></div>
      <h1>Suas fotos estão prontas 🎉</h1>
      <p id="subtitle">Carregando entrega profissional PicTour...</p>
      <div class="summary"><div><strong id="saleCode">—</strong><span>pedido</span></div><div><strong id="photoCount">0</strong><span>fotos</span></div><div><strong id="downloadCount">0</strong><span>downloads</span></div><div><strong id="sessionCode">—</strong><span>sessão</span></div></div>
      <div class="actions"><button id="downloadAll">Baixar todas em ZIP</button><button class="secondary" id="reload">Atualizar</button></div>
      <div class="status" id="status">Carregando...</div>
    </section>
    <section class="grid" id="grid"></section>
  </main>
<script>
const parts = location.pathname.split('/').filter(Boolean); const slug = parts[1] || '';
const statusEl=document.getElementById('status'), grid=document.getElementById('grid'), subtitle=document.getElementById('subtitle'), expirePill=document.getElementById('expirePill'), saleCode=document.getElementById('saleCode'), photoCount=document.getElementById('photoCount'), downloadCount=document.getElementById('downloadCount'), sessionCode=document.getElementById('sessionCode');
async function requestJson(url){const sep=url.includes('?')?'&':'?';const res=await fetch(url+sep+'_ts='+Date.now(),{cache:'no-store'});const data=await res.json();if(!res.ok||data.ok===false)throw new Error(data.message||'Falha na entrega.');return data;}
function setStatus(t){statusEl.textContent=t;}
async function load(){try{setStatus('Carregando fotos liberadas...');const data=await requestJson('/api/delivery/'+encodeURIComponent(slug));saleCode.textContent=data.sale.code;sessionCode.textContent=data.sale.sessionCode||'—';photoCount.textContent=String(data.photos.length);downloadCount.textContent=String(data.sale.deliveryDownloadCount||0);subtitle.textContent=(data.session?.customerName||'Cliente')+' • '+(data.session?.locationName||data.companyName||'PicTour')+' • fotos sem marca d\'água';expirePill.textContent=data.sale.deliveryExpiresAt?'Expira em '+new Date(data.sale.deliveryExpiresAt).toLocaleDateString('pt-BR'):'Sem expiração';grid.innerHTML=data.photos.length?data.photos.map(p=>'<article class="photo">'+(p.available?'<img src="'+p.previewUrl+'" alt="'+p.code+'">':'<div class="empty" style="min-height:210px;display:grid;place-items:center">Arquivo não encontrado nesta estação</div>')+'<div class="meta"><strong>'+p.code+' — '+p.label+'</strong><span>'+(p.available?'Arquivo liberado para download':'Sincronize/importe a foto nesta estação para liberar')+'</span>'+(p.available?'<a class="button" href="'+p.downloadUrl+'">Baixar foto</a>':'')+'</div></article>').join(''):'<div class="empty">Nenhuma foto vinculada a esta entrega.</div>';setStatus(data.photos.length?'Entrega atualizada. Baixe no celular ou salve tudo em ZIP.':'Entrega sem fotos vinculadas. Gere/atualize o link no caixa.');}catch(e){setStatus(e.message||'Não consegui carregar a entrega.');grid.innerHTML='<div class="empty">Confira o link com o operador.</div>';}}
document.getElementById('downloadAll').addEventListener('click',()=>{location.href='/api/delivery/'+encodeURIComponent(slug)+'/download-all'});document.getElementById('reload').addEventListener('click',load);window.addEventListener('focus',load);document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});load();
</script>
</body>
</html>`;
}

function photographerPortalHtml() {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>PicTour Mobile v4.6.2</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #06101d; color: #f8fafc; }
    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    body { margin: 0; min-height: 100vh; background: radial-gradient(circle at top left, rgba(14,165,233,.25), transparent 34%), radial-gradient(circle at 90% 10%, rgba(34,197,94,.16), transparent 28%), #06101d; }
    header { padding: max(18px, env(safe-area-inset-top)) 18px 16px; border-bottom: 1px solid rgba(255,255,255,.08); background: rgba(6,16,29,.84); backdrop-filter: blur(18px); position: sticky; top: 0; z-index: 10; }
    h1 { margin: 6px 0 4px; font-size: clamp(25px, 8vw, 42px); letter-spacing: -.045em; line-height: .95; }
    h2 { margin: 0 0 6px; letter-spacing: -.03em; }
    p { color: #aeb9c9; line-height: 1.5; margin: 0; }
    main { width: min(1100px, 100%); margin: 0 auto; padding: 14px; display: grid; gap: 14px; padding-bottom: 88px; }
    .pill { display: inline-flex; align-items:center; gap:6px; padding: 6px 10px; border-radius: 999px; background: rgba(34,197,94,.14); color: #bbf7d0; font-size: 12px; font-weight: 900; border:1px solid rgba(34,197,94,.18); }
    .card { border: 1px solid rgba(255,255,255,.1); border-radius: 24px; padding: 16px; background: linear-gradient(180deg, rgba(15,28,48,.92), rgba(8,18,33,.86)); box-shadow: 0 22px 60px rgba(0,0,0,.28); }
    .status { padding: 13px 14px; border-radius: 18px; background: rgba(56,189,248,.12); border: 1px solid rgba(56,189,248,.24); color: #bae6fd; font-weight: 700; }
    .tabs { position: sticky; top: 89px; z-index: 8; display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; padding: 8px 0; background: linear-gradient(180deg, rgba(6,16,29,.96), rgba(6,16,29,.72)); backdrop-filter: blur(12px); }
    .tab { border: 1px solid rgba(255,255,255,.1); border-radius: 14px; padding: 11px 8px; background: rgba(255,255,255,.05); color: #cbd5e1; font-size: 12px; font-weight: 900; cursor: pointer; }
    .tab.active { background: linear-gradient(135deg,#38bdf8,#22c55e); color: #03101c; border:0; }
    label { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .12em; color: #7dd3fc; margin: 12px 0 8px; font-weight: 900; }
    select, input, textarea { width: 100%; border: 1px solid rgba(255,255,255,.12); background: #0b1728; color: #fff; border-radius: 16px; padding: 14px; font: inherit; outline: none; }
    input[type="file"] { border-style: dashed; padding: 18px; min-height: 62px; }
    button { border: 0; border-radius: 16px; padding: 14px 16px; font-weight: 900; background: linear-gradient(135deg,#38bdf8,#22c55e); color: #03101c; cursor: pointer; width: 100%; }
    button.secondary { background: transparent; color: #e2e8f0; border: 1px solid rgba(255,255,255,.16); }
    button.warn { background: rgba(251,191,36,.12); color:#fde68a; border: 1px solid rgba(251,191,36,.25); }
    button:disabled { opacity: .52; cursor: not-allowed; }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .actions { display:grid; gap:10px; margin-top:14px; }
    .metrics { display: grid; grid-template-columns: repeat(4,1fr); gap: 8px; margin-top: 12px; }
    .metric { border-radius: 18px; padding: 12px; background: rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.08); }
    .metric span { display:block; font-size: 10px; text-transform: uppercase; letter-spacing: .11em; color:#94a3b8; font-weight:900; }
    .metric strong { display:block; margin-top: 4px; font-size: 22px; letter-spacing:-.04em; }
    .preview { display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 10px; margin-top: 12px; }
    .preview article, .photoCard { overflow: hidden; border-radius: 18px; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.08); position: relative; }
    .preview img, .photoCard img { width: 100%; aspect-ratio: 1; object-fit: cover; display: block; background:#111827; }
    .preview span, .photoMeta { display: block; padding: 8px; font-size: 12px; color: #cbd5e1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .photoGrid { display:grid; grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)); gap: 10px; }
    .photoCard.selected { outline: 2px solid #22c55e; background: rgba(34,197,94,.09); }
    .photoCard.purchased:after { content:'VENDIDA'; position:absolute; top:8px; right:8px; padding:5px 8px; border-radius:999px; background:rgba(34,197,94,.9); color:#052e16; font-size:10px; font-weight:900; }
    .photoToolbar { display:grid; grid-template-columns: 1fr 1fr; gap:6px; padding: 0 8px 8px; }
    .photoToolbar button { padding: 9px 6px; font-size: 11px; border-radius: 11px; }
    .empty { padding: 22px; border:1px dashed rgba(255,255,255,.14); border-radius: 18px; color:#94a3b8; text-align:center; }
    .queueItem { display:flex; align-items:center; justify-content:space-between; gap:10px; padding: 11px; border-radius:16px; background:rgba(255,255,255,.06); margin-top:8px; }
    .queueItem small { color:#94a3b8; }
    .hide { display:none !important; }
    .stickyUpload { position: fixed; left: 12px; right: 12px; bottom: 12px; bottom: max(12px, env(safe-area-inset-bottom)); z-index: 20; display:grid; grid-template-columns: 1fr 1fr; gap:10px; max-width: 720px; margin:0 auto; }
    .toast { position: fixed; left: 14px; right: 14px; bottom: 84px; z-index: 30; padding: 13px 14px; border-radius: 16px; background: rgba(15,23,42,.96); color:#e2e8f0; border:1px solid rgba(255,255,255,.12); box-shadow:0 18px 50px rgba(0,0,0,.35); display:none; }
    @media (max-width: 760px) { .row, .metrics { grid-template-columns: 1fr 1fr; } main { padding: 12px; padding-bottom: 92px; } header { padding-left:14px; padding-right:14px; } .tabs { top: 86px; } .tab { font-size: 11px; padding: 10px 5px; } }
  </style>
</head>
<body>
  <header>
    <span class="pill">PicTour v4.6.2 • Mobile</span>
    <h1>App do fotógrafo</h1>
    <p>Captura, envio, fila e pré-seleção direto do celular conectado ao PicTour Desktop.</p>
  </header>
  <main>
    <div id="status" class="status">Carregando operação...</div>
    <nav class="tabs">
      <button class="tab active" data-tab="capture">Captura</button>
      <button class="tab" data-tab="session">Sessão</button>
      <button class="tab" data-tab="photos">Fotos</button>
      <button class="tab" data-tab="queue">Fila</button>
    </nav>

    <section class="card" data-panel="capture">
      <h2>Enviar fotos</h2>
      <p>Escolha a sessão, fotografe ou selecione imagens e envie para o desktop.</p>
      <label>Sessão aberta</label>
      <select id="sessionSelect"></select>
      <div class="row">
        <div><label>Código de acesso</label><input id="accessCode" placeholder="Ex: 4821" inputmode="numeric" autocomplete="one-time-code" /></div>
        <div><label>Nome/observação</label><input id="label" placeholder="Ex: Entrada, João, Família" /></div>
      </div>
      <label>Fotos</label>
      <input id="fileInput" type="file" accept="image/*" multiple capture="environment" />
      <div class="preview" id="preview"></div>
      <div class="actions">
        <button id="uploadButton" disabled>Enviar agora</button>
        <button id="saveQueueButton" class="secondary" disabled>Salvar na fila local</button>
      </div>
    </section>

    <section class="card hide" data-panel="session">
      <h2>Sessão ativa</h2>
      <div class="metrics" id="sessionMetrics"></div>
      <div class="actions">
        <button id="reloadButton" class="secondary">Recarregar sessões</button>
        <button id="refreshSessionButton" class="secondary">Atualizar sessão</button>
      </div>
      <div id="sessionInfo" style="margin-top:12px"></div>
    </section>

    <section class="card hide" data-panel="photos">
      <h2>Fotos da sessão</h2>
      <p>Marque favoritas ou pré-selecione no celular. A venda no desktop já recebe esse sinal.</p>
      <div class="photoGrid" id="photoGrid"></div>
    </section>

    <section class="card hide" data-panel="queue">
      <h2>Fila offline</h2>
      <p>Se a rede cair, salve os envios aqui e tente novamente quando o Wi‑Fi voltar.</p>
      <div class="actions"><button id="retryQueueButton">Enviar fila pendente</button><button id="clearQueueButton" class="warn">Limpar fila local</button></div>
      <div id="queueList"></div>
    </section>
  </main>
  <div class="toast" id="toast"></div>
  <div class="stickyUpload"><button id="quickCamera">Abrir câmera</button><button id="quickReload" class="secondary">Sincronizar</button></div>
<script>
  const statusEl = document.getElementById('status');
  const sessionSelect = document.getElementById('sessionSelect');
  const accessCode = document.getElementById('accessCode');
  const labelInput = document.getElementById('label');
  const fileInput = document.getElementById('fileInput');
  const preview = document.getElementById('preview');
  const uploadButton = document.getElementById('uploadButton');
  const saveQueueButton = document.getElementById('saveQueueButton');
  const reloadButton = document.getElementById('reloadButton');
  const refreshSessionButton = document.getElementById('refreshSessionButton');
  const sessionMetrics = document.getElementById('sessionMetrics');
  const sessionInfo = document.getElementById('sessionInfo');
  const photoGrid = document.getElementById('photoGrid');
  const retryQueueButton = document.getElementById('retryQueueButton');
  const clearQueueButton = document.getElementById('clearQueueButton');
  const queueList = document.getElementById('queueList');
  const toast = document.getElementById('toast');
  let selectedFiles = [];
  let sessions = [];
  let activeSessionDetail = null;
  const QUEUE_KEY = 'pictour_mobile_upload_queue_v44';
  function setStatus(message) { statusEl.textContent = message; }
  function showToast(message) { toast.textContent = message; toast.style.display = 'block'; setTimeout(() => { toast.style.display = 'none'; }, 3200); }
  async function requestJson(url, options) { const res = await fetch(url, options); const data = await res.json(); if (!res.ok || data.ok === false) throw new Error(data.message || 'Falha na operação.'); return data; }
  function currentSession() { return sessions.find(s => s.code === sessionSelect.value) || sessions[0]; }
  function queue() { try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch { return []; } }
  function saveQueue(items) { localStorage.setItem(QUEUE_KEY, JSON.stringify(items)); renderQueue(); }
  function setActiveTab(name) { document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === name)); document.querySelectorAll('[data-panel]').forEach(p => p.classList.toggle('hide', p.dataset.panel !== name)); if (name === 'photos') loadSessionDetail(); if (name === 'queue') renderQueue(); }
  document.querySelectorAll('.tab').forEach(btn => btn.addEventListener('click', () => setActiveTab(btn.dataset.tab)));
  async function loadSessions() {
    try {
      const data = await requestJson('/api/photographer/sessions');
      sessions = data.sessions || [];
      sessionSelect.innerHTML = sessions.map(s => '<option value="' + s.code + '">' + s.code + ' • ' + s.customerName + ' • ' + s.locationName + '</option>').join('');
      if (sessions[0] && !accessCode.value) accessCode.value = sessions[0].accessCode || '';
      setStatus(sessions.length ? 'Sessões abertas carregadas. Operação mobile pronta.' : 'Nenhuma sessão aberta no momento.');
      await loadSessionDetail(false);
    } catch (error) { setStatus(error.message || 'Não consegui carregar sessões.'); }
  }
  async function loadSessionDetail(showMessage = true) {
    const s = currentSession();
    if (!s) { renderSession(null); return; }
    try {
      const data = await requestJson('/api/photographer/session/' + encodeURIComponent(s.code) + '?accessCode=' + encodeURIComponent(accessCode.value || s.accessCode || ''));
      activeSessionDetail = data;
      renderSession(data);
      if (showMessage) setStatus('Sessão ' + s.code + ' atualizada.');
    } catch (error) { if (showMessage) setStatus(error.message || 'Falha ao atualizar sessão.'); }
  }
  function renderSession(data) {
    const s = data?.session || currentSession();
    const photos = data?.photos || [];
    const selected = photos.filter(p => p.selected).length;
    const purchased = photos.filter(p => p.status === 'PURCHASED').length;
    sessionMetrics.innerHTML = ['Fotos|' + photos.length, 'Selecionadas|' + selected, 'Vendidas|' + purchased, 'Fila|' + queue().length].map(x => { const parts=x.split('|'); return '<div class="metric"><span>'+parts[0]+'</span><strong>'+parts[1]+'</strong></div>'; }).join('');
    sessionInfo.innerHTML = s ? '<div class="status"><strong>'+s.code+'</strong><br>'+s.customerName+' • '+s.locationName+'<br>Código: '+(s.accessCode || '')+'</div>' : '<div class="empty">Nenhuma sessão aberta.</div>';
    photoGrid.innerHTML = photos.length ? photos.map(p => '<article class="photoCard '+(p.selected?'selected ':'')+(p.status==='PURCHASED'?'purchased':'')+'"><img src="'+p.previewUrl+'" loading="lazy"/><div class="photoMeta"><strong>'+p.code+'</strong><br>'+(p.label||'Foto')+(p.favorite?' ⭐':'')+'</div><div class="photoToolbar"><button class="secondary" data-action="select" data-id="'+p.id+'">'+(p.selected?'Remover':'Selecionar')+'</button><button class="secondary" data-action="favorite" data-id="'+p.id+'">'+(p.favorite?'★ Fav':'☆ Fav')+'</button></div></article>').join('') : '<div class="empty">Ainda não há fotos nessa sessão.</div>';
  }
  photoGrid.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]'); if (!button) return;
    try {
      await requestJson('/api/photographer/photo-action', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ sessionCode: sessionSelect.value, accessCode: accessCode.value, photoId: button.dataset.id, action: button.dataset.action === 'favorite' ? 'TOGGLE_FAVORITE' : 'TOGGLE_SELECTED' }) });
      await loadSessionDetail(false);
      showToast('Foto atualizada no desktop.');
    } catch (error) { showToast(error.message || 'Não foi possível atualizar a foto.'); }
  });
  function renderPreview() { uploadButton.disabled = !selectedFiles.length || !sessionSelect.value; saveQueueButton.disabled = uploadButton.disabled; preview.innerHTML = selectedFiles.map(item => '<article><img src="' + item.dataUrl + '"/><span>' + item.name + '</span></article>').join(''); }
  function readFile(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve({ name: file.name, dataUrl: reader.result }); reader.onerror = reject; reader.readAsDataURL(file); }); }
  fileInput.addEventListener('change', async () => { const files = Array.from(fileInput.files || []).slice(0, 24); setStatus('Preparando ' + files.length + ' foto(s)...'); selectedFiles = await Promise.all(files.map(readFile)); setStatus(selectedFiles.length + ' foto(s) prontas.'); renderPreview(); });
  sessionSelect.addEventListener('change', async () => { const s = currentSession(); accessCode.value = s?.accessCode || ''; await loadSessionDetail(false); });
  async function uploadPayload(payload) { return requestJson('/api/photographer/upload', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(payload) }); }
  async function uploadSelected() {
    try { uploadButton.disabled = true; setStatus('Enviando fotos para o desktop...'); const data = await uploadPayload({ sessionCode: sessionSelect.value, accessCode: accessCode.value, label: labelInput.value, files: selectedFiles }); setStatus(data.message || 'Upload concluído.'); selectedFiles=[]; fileInput.value=''; renderPreview(); await loadSessionDetail(false); }
    catch(error) { setStatus(error.message || 'Falha no upload. Salve na fila local se a rede estiver instável.'); renderPreview(); }
  }
  uploadButton.addEventListener('click', uploadSelected);
  saveQueueButton.addEventListener('click', () => { const items = queue(); items.push({ id: Date.now() + '_' + Math.random().toString(16).slice(2), createdAt: new Date().toISOString(), sessionCode: sessionSelect.value, accessCode: accessCode.value, label: labelInput.value, files: selectedFiles }); saveQueue(items); selectedFiles=[]; fileInput.value=''; renderPreview(); showToast('Envio salvo na fila local.'); });
  async function retryQueue() { const items = queue(); const pending=[]; let ok=0; for (const item of items) { try { await uploadPayload(item); ok++; } catch { pending.push(item); } } saveQueue(pending); setStatus(ok + ' envio(s) da fila concluído(s). Pendentes: ' + pending.length); await loadSessionDetail(false); }
  function renderQueue() { const items = queue(); queueList.innerHTML = items.length ? items.map(item => '<div class="queueItem"><div><strong>'+item.files.length+' foto(s)</strong><br><small>'+item.sessionCode+' • '+new Date(item.createdAt).toLocaleString('pt-BR')+'</small></div><span class="pill">pendente</span></div>').join('') : '<div class="empty">Fila vazia. Se a rede cair, os envios salvos aparecem aqui.</div>'; sessionMetrics.innerHTML = sessionMetrics.innerHTML; }
  retryQueueButton.addEventListener('click', retryQueue);
  clearQueueButton.addEventListener('click', () => { saveQueue([]); showToast('Fila local limpa.'); });
  reloadButton.addEventListener('click', loadSessions); refreshSessionButton.addEventListener('click', () => loadSessionDetail(true));
  document.getElementById('quickCamera').addEventListener('click', () => fileInput.click());
  document.getElementById('quickReload').addEventListener('click', async () => { await loadSessions(); showToast('Sincronizado com o desktop.'); });
  loadSessions(); renderQueue();
</script>
</body>
</html>`;
}

function validatePhotographerSessionAccess(db, sessionCode, accessCode) {
  const session = (db.sessions || []).find((item) => item.code === sessionCode && item.status === 'OPEN');
  if (!session) {
    const error = new Error('Sessão aberta não encontrada.');
    error.statusCode = 404;
    throw error;
  }
  const settings = db.settings?.photographerPortal || defaultPhotographerPortalSettings();
  const expected = session.accessCode || generateAccessCode(session.code);
  if (settings.requireSessionAccessCode !== false && String(accessCode || '').trim() !== String(expected).trim()) {
    const error = new Error('Código de acesso inválido para esta sessão.');
    error.statusCode = 403;
    throw error;
  }
  return session;
}

function savePhotographerWebUploads({ sessionCode, accessCode, files = [], label = '' } = {}) {
  const db = getMutableDatabase();
  const session = validatePhotographerSessionAccess(db, sessionCode, accessCode);
  const settings = db.settings?.photographerPortal || defaultPhotographerPortalSettings();
  const maxFiles = Math.max(1, Math.min(30, Number(settings.maxFilesPerUpload || 12)));
  const incoming = (Array.isArray(files) ? files : []).slice(0, maxFiles);
  if (!incoming.length) {
    const error = new Error('Selecione pelo menos uma foto.');
    error.statusCode = 400;
    throw error;
  }
  assertCanCreatePhotos(db, incoming.length);
  const libraryPath = getPhotoLibraryPath();
  ensureDir(libraryPath);
  const importedPhotos = [];
  const currentSessionCount = (db.photos || []).filter((photo) => photo.sessionCode === session.code).length;

  incoming.forEach((file, index) => {
    const match = String(file.dataUrl || '').match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/);
    if (!match) return;
    const extension = match[1] === 'jpeg' || match[1] === 'jpg' ? '.jpg' : `.${match[1]}`;
    const buffer = Buffer.from(match[2], 'base64');
    if (!buffer.length) return;
    const photoId = makeId('photo');
    const storedFileName = `${session.code}-${photoId}-photographer-web${extension}`;
    const storedPath = path.join(libraryPath, storedFileName);
    fs.writeFileSync(storedPath, buffer);
    const code = `F${String(currentSessionCount + importedPhotos.length + 1).padStart(2, '0')}`;
    importedPhotos.push({
      id: photoId,
      code,
      label: String(label || settings.defaultLabelPrefix || 'Fotógrafo externo').trim() || `Fotógrafo externo ${code}`,
      sessionCode: session.code,
      status: 'READY',
      kind: 'CAMERA',
      selected: false,
      favorite: false,
      originalFileName: `${String(file.name || storedFileName).slice(0, 80)} • photographer-web`,
      storedPath,
      importedAt: nowIso()
    });
  });

  if (!importedPhotos.length) {
    const error = new Error('Nenhuma imagem válida foi enviada.');
    error.statusCode = 400;
    throw error;
  }
  db.photos = [...(db.photos || []), ...importedPhotos];
  addAuditLog(db, { category: 'PHOTO', action: 'PHOTO.PHOTOGRAPHER_WEB_UPLOAD', severity: 'INFO', entityType: 'SESSION', entityId: session.id, entityLabel: session.code, summary: `${importedPhotos.length} foto(s) enviada(s) pelo Fotógrafo Web para ${session.code}.`, details: { sessionCode: session.code, importedCount: importedPhotos.length, label } });
  saveDatabase(db);
  return { ok: true, message: `${importedPhotos.length} foto(s) enviadas para a sessão ${session.code}.`, importedCount: importedPhotos.length };
}


function getPhotographerSessionDetail(sessionCode, accessCode) {
  const db = getMutableDatabase();
  const session = validatePhotographerSessionAccess(db, sessionCode, accessCode);
  const settings = { ...defaultPhotographerPortalSettings(), ...(db.settings?.photographerPortal || {}) };
  const photos = (db.photos || [])
    .filter((photo) => photo.sessionCode === session.code)
    .filter((photo) => settings.showPurchasedOnMobile !== false || photo.status !== 'PURCHASED')
    .sort((a, b) => String(b.importedAt || '').localeCompare(String(a.importedAt || '')))
    .map((photo) => ({
      id: photo.id,
      code: photo.code,
      label: photo.label,
      status: photo.status,
      selected: Boolean(photo.selected),
      favorite: Boolean(photo.favorite),
      kind: photo.kind,
      importedAt: photo.importedAt,
      previewUrl: `/api/photographer/photo/${encodeURIComponent(photo.id)}/preview?sessionCode=${encodeURIComponent(session.code)}&accessCode=${encodeURIComponent(accessCode || session.accessCode || generateAccessCode(session.code))}`
    }));
  return {
    ok: true,
    settings: {
      mobileMode: settings.mobileMode || 'FULL_OPERATION',
      allowMobileSelection: settings.allowMobileSelection !== false,
      allowMobileFavorite: settings.allowMobileFavorite !== false,
      enableUploadQueue: settings.enableUploadQueue !== false
    },
    session: {
      id: session.id,
      code: session.code,
      customerName: session.customerName,
      locationName: session.locationName,
      accessCode: session.accessCode || generateAccessCode(session.code),
      status: session.status,
      expiresAt: session.expiresAt,
      photoCount: photos.length,
      selectedCount: photos.filter((photo) => photo.selected).length,
      purchasedCount: photos.filter((photo) => photo.status === 'PURCHASED').length
    },
    photos
  };
}

function setPhotographerPhotoAction({ sessionCode, accessCode, photoId, action } = {}) {
  const db = getMutableDatabase();
  const session = validatePhotographerSessionAccess(db, sessionCode, accessCode);
  const settings = { ...defaultPhotographerPortalSettings(), ...(db.settings?.photographerPortal || {}) };
  const target = (db.photos || []).find((photo) => photo.id === photoId && photo.sessionCode === session.code);
  if (!target) {
    const error = new Error('Foto não encontrada nesta sessão.');
    error.statusCode = 404;
    throw error;
  }
  if (action === 'TOGGLE_SELECTED') {
    if (settings.allowMobileSelection === false) {
      const error = new Error('Pré-seleção mobile está desativada nas configurações.');
      error.statusCode = 403;
      throw error;
    }
    target.selected = !target.selected;
    target.status = target.selected && target.status === 'READY' ? 'SELECTED' : target.status === 'SELECTED' ? 'READY' : target.status;
  } else if (action === 'TOGGLE_FAVORITE') {
    if (settings.allowMobileFavorite === false) {
      const error = new Error('Favoritos mobile estão desativados nas configurações.');
      error.statusCode = 403;
      throw error;
    }
    target.favorite = !target.favorite;
  } else {
    const error = new Error('Ação mobile inválida.');
    error.statusCode = 400;
    throw error;
  }
  addAuditLog(db, { category: 'PHOTO', action: 'PHOTO.MOBILE_ACTION', severity: 'INFO', entityType: 'PHOTO', entityId: target.id, entityLabel: target.code, summary: `Ação mobile ${action} aplicada na foto ${target.code} da sessão ${session.code}.`, details: { sessionCode: session.code, photoId: target.id, action } });
  saveDatabase(db);
  return { ok: true, message: 'Foto atualizada no desktop.', photo: { id: target.id, selected: target.selected, favorite: target.favorite, status: target.status } };
}

async function handlePublicGalleryRequest(req, res) {
  const reqUrl = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
  const pathname = decodeURIComponent(reqUrl.pathname);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type,x-pictour-sync-token'
    });
    res.end();
    return;
  }

  try {
    if (req.method === 'GET' && pathname === '/api/station/status') {
      writeJson(res, 200, { ok: true, station: getMultiStationInfo() });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/station/snapshot') {
      if (!isValidStationSyncToken(req, Object.fromEntries(reqUrl.searchParams.entries()))) {
        writeJson(res, 401, { ok: false, message: 'Token local de sincronização inválido ou multi-estação desativado.' });
        return;
      }
      writeJson(res, 200, buildStationSnapshot(getMutableDatabase()));
      return;
    }

    const stationPhotoMatch = pathname.match(/^\/api\/station\/photo\/([^/]+)$/i);
    if (req.method === 'GET' && stationPhotoMatch) {
      if (!isValidStationSyncToken(req, Object.fromEntries(reqUrl.searchParams.entries()))) {
        writeJson(res, 401, { ok: false, message: 'Token local de sincronização inválido.' });
        return;
      }
      const photoId = stationPhotoMatch[1];
      const photo = (getMutableDatabase().photos || []).find((item) => item.id === photoId);
      if (!photo || !photo.storedPath || !fs.existsSync(photo.storedPath)) {
        writeJson(res, 404, { ok: false, message: 'Arquivo de foto não encontrado nesta estação.' });
        return;
      }
      sendPhotoFile(res, photo, 'attachment');
      return;
    }

    if (req.method === 'GET' && (pathname === '/' || /^\/g\/[a-z0-9-]+$/i.test(pathname))) {
      writeText(res, 200, publicGalleryHtml());
      return;
    }


    if (req.method === 'GET' && pathname === '/photo') {
      writeText(res, 200, photographerPortalHtml());
      return;
    }


    if (req.method === 'GET' && /^\/d\/[a-z0-9-]+$/i.test(pathname)) {
      writeText(res, 200, deliveryPortalHtml());
      return;
    }

    const apiDeliveryMatch = pathname.match(/^\/api\/delivery\/([^/]+)$/i);
    if (req.method === 'GET' && apiDeliveryMatch) {
      const deliverySlug = apiDeliveryMatch[1];
      const { db, sale, photos, session } = validateDeliveryAccess(deliverySlug);
      logDeliveryAccess(db, sale, req, 'VIEW');
      saveDatabase(db);
      writeJson(res, 200, {
        ok: true,
        companyName: db.settings?.companyName || 'PicTour',
        sale: {
          id: sale.id,
          code: sale.code,
          sessionCode: sale.sessionCode,
          packageName: sale.packageName,
          deliveryExpiresAt: sale.deliveryExpiresAt,
          deliveryDownloadCount: sale.deliveryDownloadCount || 0,
          lastDeliveryAccessAt: sale.lastDeliveryAccessAt
        },
        session: session ? { code: session.code, customerName: session.customerName, locationName: session.locationName } : null,
        photos: photos.map((photo) => ({
          id: photo.id,
          code: photo.code,
          label: photo.label,
          available: Boolean(photo.storedPath && fs.existsSync(photo.storedPath)),
          previewUrl: `/api/delivery/${encodeURIComponent(sale.deliverySlug)}/photo/${encodeURIComponent(photo.id)}/preview`,
          downloadUrl: `/api/delivery/${encodeURIComponent(sale.deliverySlug)}/photo/${encodeURIComponent(photo.id)}/download`
        }))
      });
      return;
    }

    const deliveryPhotoMatch = pathname.match(/^\/api\/delivery\/([^/]+)\/photo\/([^/]+)\/(preview|download)$/i);
    if (req.method === 'GET' && deliveryPhotoMatch) {
      const [, deliverySlug, photoId, mode] = deliveryPhotoMatch;
      const { db, sale, photos } = validateDeliveryAccess(deliverySlug);
      const photo = photos.find((item) => item.id === photoId);
      if (!photo) return writeJson(res, 404, { ok: false, message: 'Foto não encontrada nesta entrega.' });
      if (mode === 'download') {
        logDeliveryAccess(db, sale, req, 'DOWNLOAD_PHOTO', photo.id);
        saveDatabase(db);
      }
      sendPhotoFile(res, photo, mode === 'download' ? 'attachment' : 'inline');
      return;
    }

    const deliveryZipMatch = pathname.match(/^\/api\/delivery\/([^/]+)\/download-all$/i);
    if (req.method === 'GET' && deliveryZipMatch) {
      const deliverySlug = deliveryZipMatch[1];
      const { db, sale, photos } = validateDeliveryAccess(deliverySlug);
      const deliverablePhotos = photos.filter((photo) => photo.storedPath && fs.existsSync(photo.storedPath));
      if (!deliverablePhotos.length) return writeJson(res, 404, { ok: false, message: 'Nenhuma foto disponível para ZIP nesta estação.' });
      const zipFiles = deliverablePhotos.map((photo) => {
        const ext = path.extname(photo.storedPath) || '.jpg';
        return { path: photo.storedPath, name: `${slugify(photo.code || 'foto')}-${slugify(photo.label || 'pictour')}${ext}` };
      });
      const zipBuffer = createZipBuffer(zipFiles);
      logDeliveryAccess(db, sale, req, 'DOWNLOAD_ALL');
      saveDatabase(db);
      res.writeHead(200, {
        'content-type': 'application/zip',
        'content-length': zipBuffer.length,
        'cache-control': 'no-store',
        'content-disposition': `attachment; filename="pictour-entrega-${slugify(sale.code)}.zip"`
      });
      res.end(zipBuffer);
      return;
    }

    if (req.method === 'GET' && pathname === '/api/photographer/sessions') {
      const db = loadDatabase();
      const sessions = (db.sessions || [])
        .filter((session) => session.status === 'OPEN')
        .map((session) => ({
          code: session.code,
          customerName: session.customerName,
          locationName: session.locationName,
          accessCode: session.accessCode || generateAccessCode(session.code),
          photoCount: (db.photos || []).filter((photo) => photo.sessionCode === session.code).length
        }));
      writeJson(res, 200, { ok: true, sessions });
      return;
    }

    const photographerSessionMatch = pathname.match(/^\/api\/photographer\/session\/([^/]+)$/i);
    if (req.method === 'GET' && photographerSessionMatch) {
      const sessionCode = photographerSessionMatch[1];
      const accessCode = reqUrl.searchParams.get('accessCode') || '';
      writeJson(res, 200, getPhotographerSessionDetail(sessionCode, accessCode));
      return;
    }

    const photographerPhotoPreviewMatch = pathname.match(/^\/api\/photographer\/photo\/([^/]+)\/preview$/i);
    if (req.method === 'GET' && photographerPhotoPreviewMatch) {
      const photoId = photographerPhotoPreviewMatch[1];
      const sessionCode = reqUrl.searchParams.get('sessionCode') || '';
      const accessCode = reqUrl.searchParams.get('accessCode') || '';
      const db = getMutableDatabase();
      const session = validatePhotographerSessionAccess(db, sessionCode, accessCode);
      const photo = (db.photos || []).find((item) => item.id === photoId && item.sessionCode === session.code);
      if (!photo) return writeJson(res, 404, { ok: false, message: 'Foto não encontrada.' });
      sendPhotoFile(res, photo, 'inline');
      return;
    }

    if (req.method === 'POST' && pathname === '/api/photographer/photo-action') {
      const body = await parseRequestBody(req);
      writeJson(res, 200, setPhotographerPhotoAction(body));
      return;
    }

    if (req.method === 'POST' && pathname === '/api/photographer/upload') {
      const body = await parseRequestBody(req);
      const result = savePhotographerWebUploads(body);
      writeJson(res, 200, result);
      return;
    }

    const apiGalleryMatch = pathname.match(/^\/api\/gallery\/([^/]+)$/i);
    if (req.method === 'GET' && apiGalleryMatch) {
      const publicSlug = apiGalleryMatch[1];
      const accessCode = getGalleryAccessCode(reqUrl);
      const { db, session } = validateGalleryAccess(publicSlug, accessCode);
      writeJson(res, 200, {
        ok: true,
        session: {
          code: session.code,
          customerName: session.customerName,
          locationName: session.locationName,
          expiresAt: session.expiresAt,
          publicSlug: session.publicSlug
        },
        photos: getPublicGalleryPhotos(db, session, accessCode),
        packages: getGalleryPackages(db, session),
        antiPrint: normalizeAntiPrintSettings(db.settings?.antiPrint || {})
      });
      return;
    }

    const photoMatch = pathname.match(/^\/api\/gallery\/([^/]+)\/photo\/([^/]+)\/(preview|download)$/i);
    if (req.method === 'GET' && photoMatch) {
      const [, publicSlug, photoId, mode] = photoMatch;
      const accessCode = getGalleryAccessCode(reqUrl);
      const { db, session } = validateGalleryAccess(publicSlug, accessCode);
      const photo = (db.photos || []).find((item) => item.id === photoId && item.sessionCode === session.code);
      if (!photo) return writeJson(res, 404, { ok: false, message: 'Foto não encontrada.' });
      if (mode === 'download' && photo.status !== 'PURCHASED') {
        return writeJson(res, 403, { ok: false, message: 'Foto ainda não foi comprada.' });
      }
      sendPhotoFile(res, photo, mode === 'download' ? 'attachment' : 'inline');
      return;
    }

    const purchaseMatch = pathname.match(/^\/api\/gallery\/([^/]+)\/purchase$/i);
    if (req.method === 'POST' && purchaseMatch) {
      const publicSlug = purchaseMatch[1];
      const body = await parseRequestBody(req);
      const accessCode = getGalleryAccessCode(reqUrl, body);
      const { db, session } = validateGalleryAccess(publicSlug, accessCode);
      const allSessionPhotos = (db.photos || []).filter((photo) => photo.sessionCode === session.code && photo.status !== 'PURCHASED');
      const sessionPhotoIds = new Set(allSessionPhotos.map((photo) => photo.id));
      const packages = getGalleryPackages(db, session);
      const lineItems = Array.isArray(body.saleLineItems) && body.saleLineItems.length
        ? body.saleLineItems
          .filter((item) => item?.photoId && sessionPhotoIds.has(item.photoId))
          .map((item) => {
            const packageOption = packages.find((pkg) => pkg.id === item.packageId) || packages[0];
            const photo = allSessionPhotos.find((photoItem) => photoItem.id === item.photoId);
            return {
              id: item.id || makeId('line'),
              packageId: packageOption?.id,
              packageName: packageOption?.name || item.packageName || 'Item da galeria',
              photoId: item.photoId,
              photoCode: photo?.code || item.photoCode,
              priceCents: Number(packageOption?.priceCents ?? item.priceCents ?? 0),
              currency: packageOption?.currency || item.currency || 'BRL'
            };
          })
        : [];

      if (!lineItems.length) {
        const photoIds = Array.isArray(body.photoIds) ? body.photoIds.filter(Boolean) : [];
        const validPhotoIds = Array.from(new Set(photoIds.filter((id) => sessionPhotoIds.has(id))));
        const { selected: selectedPackage } = pickGalleryPackage(db, session, body.packageId, validPhotoIds.length);
        validPhotoIds.forEach((photoId) => lineItems.push({
          id: makeId('line'),
          packageId: selectedPackage?.id,
          packageName: selectedPackage?.name || 'Galeria premium',
          photoId,
          photoCode: allSessionPhotos.find((photo) => photo.id === photoId)?.code,
          priceCents: calculateGalleryPackageTotal(selectedPackage, 1, allSessionPhotos.length) || Number(selectedPackage?.priceCents || 0),
          currency: selectedPackage?.currency || 'BRL'
        }));
      }

      const validPhotoIds = new Set(lineItems.map((item) => item.photoId).filter(Boolean));
      if (!validPhotoIds.size) return writeJson(res, 400, { ok: false, message: 'Nenhuma foto pendente válida foi enviada.' });
      const amountCents = lineItems.reduce((sum, item) => sum + Number(item.priceCents || 0), 0) || Number(body.amountCents || validPhotoIds.size * 3000);
      const paymentMethod = ['PIX_ONLINE', 'CREDIT_CARD_ONLINE', 'DEBIT_CARD_ONLINE'].includes(body.paymentMethod) ? body.paymentMethod : 'PIX_ONLINE';
      const packageName = Array.from(lineItems.reduce((map, item) => map.set(item.packageName, (map.get(item.packageName) || 0) + 1), new Map()).entries()).map(([name, count]) => `${name} ×${count}`).join(' + ');

      db.photos = (db.photos || []).map((photo) => (
        validPhotoIds.has(photo.id) ? { ...photo, status: 'PURCHASED', selected: false } : photo
      ));
      const gallerySale = normalizeSaleDeliveryFields({
        id: makeId('sale'),
        code: generateSaleCode(db),
        sellerName: 'Galeria local',
        method: paymentMethod,
        currency: lineItems[0]?.currency || 'BRL',
        amountCents,
        amountBaseCents: amountCents,
        createdAt: nowIso(),
        channel: 'POST_TOUR',
        sessionCode: session.code,
        packageName: packageName || 'Galeria premium modular',
        photoIds: Array.from(validPhotoIds),
        saleLineItems: lineItems,
        saleStatus: 'ACTIVE',
        deliveryExpiresAt: addDaysIso(7),
        deliveryStatus: 'PENDING'
      });
      db.cashierSales = [attachCommissionToSale(db, gallerySale), ...(db.cashierSales || [])];
      saveDatabase(db);
      writeJson(res, 200, { ok: true, message: 'Checkout modular aprovado.', purchasedCount: validPhotoIds.size, sale: gallerySale });
      return;
    }

    writeJson(res, 404, { ok: false, message: 'Rota não encontrada.' });
  } catch (error) {
    writeJson(res, error.statusCode || 500, { ok: false, message: error.message || 'Erro interno na galeria local.' });
  }
}

function startPublicGalleryServer() {
  if (publicGalleryServer) return Promise.resolve(getPublicGalleryInfo());

  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      handlePublicGalleryRequest(req, res).catch((error) => {
        writeJson(res, 500, { ok: false, message: error.message || 'Erro interno na galeria local.' });
      });
    });

    server.on('error', () => {
      if (publicGalleryServerPort !== 0) {
        publicGalleryServerPort = 0;
        server.listen(0, '0.0.0.0');
      } else {
        resolve(getPublicGalleryInfo());
      }
    });

    server.on('listening', () => {
      const address = server.address();
      publicGalleryServerPort = typeof address === 'object' && address?.port ? address.port : publicGalleryServerPort;
      publicGalleryServer = server;
      resolve(getPublicGalleryInfo());
    });

    server.listen(publicGalleryServerPort, '0.0.0.0');
  });
}

function loadRenderer(win, hashRoute = '') {
  if (isDev) {
    const hash = hashRoute ? `#/${hashRoute.replace(/^\//, '')}` : '';
    win.loadURL(`${devServerUrl}/${hash}`);
    return;
  }

  win.loadFile(path.join(__dirname, '../dist/index.html'), {
    hash: hashRoute.replace(/^\//, '')
  });
}

function createMainWindow() {
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1180,
    minHeight: 760,
    title: 'PicTour Desktop',
    icon: path.join(__dirname, '../build/PicTourIcon.png'),
    backgroundColor: '#050B14',
    autoHideMenuBar: true,
    menuBarVisible: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  loadRenderer(mainWindow);

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (customerWindow && !customerWindow.isDestroyed()) {
      customerWindow.close();
    }
  });
}

function createCustomerWindow(snapshot) {
  latestCustomerSnapshot = snapshot || latestCustomerSnapshot;

  if (customerWindow && !customerWindow.isDestroyed()) {
    customerWindow.focus();
    customerWindow.webContents.send('customer-display:update', latestCustomerSnapshot);
    return { opened: true, reused: true };
  }

  const displays = screen.getAllDisplays();
  const externalDisplay = displays.find((display) => display.bounds.x !== 0 || display.bounds.y !== 0);
  const bounds = externalDisplay ? externalDisplay.bounds : { x: 80, y: 80, width: 1280, height: 720 };

  customerWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: Math.max(1024, bounds.width),
    height: Math.max(720, bounds.height),
    title: 'PicTour - Monitor do Cliente',
    icon: path.join(__dirname, '../build/PicTourIcon.png'),
    backgroundColor: '#050B14',
    fullscreen: Boolean(externalDisplay),
    autoHideMenuBar: true,
    menuBarVisible: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  loadRenderer(customerWindow, 'customer-display');

  customerWindow.webContents.once('did-finish-load', () => {
    customerWindow.webContents.send('customer-display:update', latestCustomerSnapshot);
  });

  customerWindow.on('closed', () => {
    customerWindow = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('customer-display:closed');
    }
  });

  return { opened: true, reused: false };
}

app.whenReady().then(async () => {
  await startPublicGalleryServer();
  loadDatabase();
  resetMultiStationAutoPull();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (multiStationAutoPullTimer) {
    clearInterval(multiStationAutoPullTimer);
    multiStationAutoPullTimer = null;
  }
  if (publicGalleryServer) {
    publicGalleryServer.close();
    publicGalleryServer = null;
  }
});

ipcMain.handle('app-data:load', () => {
  return loadDatabase();
});

ipcMain.handle('auth:login', (_event, input = {}) => {
  return authenticateUser(input);
});

ipcMain.handle('auth:change-password', (_event, input = {}) => {
  return changeUserPassword(input);
});

ipcMain.handle('public-gallery:info', () => {
  return getPublicGalleryInfo();
});

ipcMain.handle('public-gallery:open-session', async (_event, input = {}) => {
  const { shell } = require('electron');
  const db = getMutableDatabase();
  const session = (db.sessions || []).find((item) => item.code === input.sessionCode) || (db.sessions || [])[0];
  if (!session) throw new Error('Sessão não encontrada para abrir a galeria local.');
  const hydrated = ensurePostTourFields(session);
  const url = `${hydrated.localGalleryUrl}?code=${encodeURIComponent(hydrated.accessCode || '')}`;
  await shell.openExternal(url);
  return { opened: true, url };
});


ipcMain.handle('photographer-portal:open', async () => {
  const { shell } = require('electron');
  const info = getPublicGalleryInfo();
  const url = `${info.primaryUrl || info.localUrl}/photo`;
  await shell.openExternal(url);
  return { ok: true, url, message: 'Portal do fotógrafo aberto no navegador.' };
});

ipcMain.handle('cloud:storage-info', async () => {
  try {
    return await getCloudStorageInfo();
  } catch (error) {
    return { ok: false, message: error?.message || 'Falha ao validar storage cloud.', storage: { driver: 'local' }, checkedAt: nowIso(), database: loadDatabase() };
  }
});

ipcMain.handle('cloud:publish-session', async (_event, input = {}) => {
  try {
    return await publishSessionToCloud(input);
  } catch (error) {
    return { ok: false, message: error.message || 'Falha ao publicar sessão na cloud.', database: loadDatabase() };
  }
});


ipcMain.handle('cloud:sync-sales', async (_event, input = {}) => {
  try {
    return await syncCloudSales(input);
  } catch (error) {
    return { ok: false, message: error.message || 'Falha ao sincronizar vendas da cloud.', importedSales: 0, updatedPhotos: 0, matchedSessions: 0, database: loadDatabase() };
  }
});


ipcMain.handle('multi-station:info', () => {
  return getMultiStationInfo();
});

ipcMain.handle('multi-station:pull', async (_event, input = {}) => {
  return pullFromPrimaryStation(input || {});
});

ipcMain.handle('license:validate-server', async (_event, input = {}) => {
  try {
    return await validateLicenseWithServer(input);
  } catch (error) {
    return { ok: false, message: error.message || 'Falha ao validar licença no servidor.', database: loadDatabase() };
  }
});

ipcMain.handle('app-data:backup-export', async () => {
  return exportBackup();
});

ipcMain.handle('app-data:backup-restore', async () => {
  return restoreBackup();
});

ipcMain.handle('app-data:diagnostics', () => {
  return getSystemDiagnostics();
});

ipcMain.handle('app-data:load-demo', (_event, input = {}) => {
  return loadCommercialDemoData(input);
});


function isCashShiftInRange(shift = {}, days = 30) {
  const limitMs = Math.max(1, Number(days || 30)) * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const opened = new Date(shift.openedAt || nowIso()).getTime();
  const closed = shift.closedAt ? new Date(shift.closedAt).getTime() : opened;
  return shift.status === 'OPEN' || now - opened <= limitMs || now - closed <= limitMs;
}

function cashMovementLabel(type = '') {
  if (type === 'OPENING') return 'Abertura';
  if (type === 'WITHDRAWAL') return 'Sangria';
  if (type === 'SALE_CANCEL') return 'Cancelamento';
  if (type === 'CLOSE') return 'Fechamento';
  return type || 'Movimento';
}

function getCashHistorySnapshot(db, days = 30) {
  const shifts = (db.cashShifts || [])
    .filter((shift) => isCashShiftInRange(shift, days))
    .sort((a, b) => new Date(b.openedAt || 0).getTime() - new Date(a.openedAt || 0).getTime());
  const shiftIds = new Set(shifts.map((shift) => shift.id));
  const movements = (db.cashMovements || [])
    .filter((movement) => shiftIds.has(movement.shiftId))
    .sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
  const sales = (db.cashierSales || [])
    .filter((sale) => shiftIds.has(sale.cashShiftId))
    .sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
  return { shifts, movements, sales };
}

function buildCashHistoryTxt(db, days = 30) {
  const settings = db.settings || {};
  const cashSettings = normalizeCashSettings(settings.cash || defaultCashSettings());
  const { shifts, movements } = getCashHistorySnapshot(db, days);
  const width = Math.max(42, cashSettings.receiptPaperWidthChars || 42);
  const lines = [];
  lines.push(centerReceiptLine(settings.companyName || 'PICTOUR', width));
  lines.push(centerReceiptLine(`HISTORICO DE CAIXA - ${days} DIAS`, width));
  lines.push(receiptSeparator(width));
  lines.push(padReceiptLine('Gerado em:', formatReceiptDate(nowIso()), width));
  lines.push(padReceiptLine('Estacao:', os.hostname(), width));
  lines.push(padReceiptLine('Caixa padrao:', cashSettings.cashRegisterName || 'Caixa 01', width));
  lines.push(padReceiptLine('Turnos:', String(shifts.length), width));
  lines.push(receiptSeparator(width));
  for (const shift of shifts) {
    const summary = getCashShiftSummary(db, shift);
    const shiftMovements = movements.filter((movement) => movement.shiftId === shift.id);
    lines.push(centerReceiptLine(`${shift.code} - ${shift.status === 'OPEN' ? 'ABERTO' : 'FECHADO'}`, width));
    lines.push(padReceiptLine('Caixa/PDV:', shift.cashRegisterName || cashSettings.cashRegisterName || 'Caixa 01', width));
    lines.push(padReceiptLine('Aberto:', `${formatReceiptDate(shift.openedAt)} por ${shift.openedBy || '—'}`, width));
    if (shift.closedAt) lines.push(padReceiptLine('Fechado:', `${formatReceiptDate(shift.closedAt)} por ${shift.closedBy || '—'}`, width));
    lines.push(padReceiptLine('Troca turno:', shift.shiftChangeOnClose ? 'SIM' : 'NAO', width));
    lines.push(padReceiptLine('Fundo abertura:', formatCashMoney(shift.openingAmountCents || 0), width));
    lines.push(padReceiptLine('Vendas:', `${summary.activeSales.length} / ${formatCashMoney(summary.salesTotalCents)}`, width));
    lines.push(padReceiptLine('Recebido:', formatCashMoney(summary.paidBaseCents || summary.salesTotalCents), width));
    lines.push(padReceiptLine('Troco:', formatCashMoney(summary.changeBaseCents || 0), width));
    lines.push(padReceiptLine('Dinheiro gaveta:', formatCashMoney(summary.cashDrawerCents || 0), width));
    lines.push(padReceiptLine('Sangrias:', `${summary.withdrawals.length} / ${formatCashMoney(summary.withdrawalTotalCents)}`, width));
    lines.push(padReceiptLine('Esperado:', formatCashMoney(shift.expectedAmountCents ?? calculateExpectedCashAmount(db, shift.id)), width));
    if (shift.closingAmountCents !== undefined) lines.push(padReceiptLine('Contado:', formatCashMoney(shift.closingAmountCents), width));
    if (shift.differenceCents !== undefined) lines.push(padReceiptLine('Diferenca:', formatCashMoney(shift.differenceCents), width));
    lines.push('Movimentos:');
    if (!shiftMovements.length) lines.push('  - Sem movimentos registrados.');
    for (const movement of shiftMovements) {
      lines.push(`  - ${formatReceiptDate(movement.createdAt)} | ${cashMovementLabel(movement.type)} | ${formatCashMoney(movement.amountCents)} | ${movement.operatorName || '—'} | ${movement.note || '—'}`.slice(0, width + 40));
    }
    lines.push('Assinatura conferencia:');
    lines.push('________________________________________'.slice(0, width));
    lines.push(receiptSeparator(width));
  }
  if (!shifts.length) lines.push('Nenhum turno de caixa encontrado no periodo.');
  return lines.join('\n');
}

function buildCashHistoryCsv(db, days = 30) {
  const { shifts, movements } = getCashHistorySnapshot(db, days);
  const rows = [];
  rows.push(['TipoLinha', 'Turno', 'Status', 'CaixaPDV', 'AbertoEm', 'AbertoPor', 'FechadoEm', 'FechadoPor', 'TrocaTurno', 'MovimentoTipo', 'MovimentoEm', 'OperadorMovimento', 'ValorCentavos', 'ValorFormatado', 'Observacao', 'VendasAtivas', 'TotalVendasCentavos', 'RecebidoBaseCentavos', 'TrocoBaseCentavos', 'DinheiroGavetaCentavos', 'SangriasCentavos', 'EsperadoCentavos', 'ContadoCentavos', 'DiferencaCentavos']);
  for (const shift of shifts) {
    const summary = getCashShiftSummary(db, shift);
    rows.push(['TURNO', shift.code, shift.status, shift.cashRegisterName || '', shift.openedAt || '', shift.openedBy || '', shift.closedAt || '', shift.closedBy || '', shift.shiftChangeOnClose ? 'SIM' : 'NAO', '', '', '', '', '', shift.note || shift.closeNote || '', summary.activeSales.length, summary.salesTotalCents, summary.paidBaseCents || summary.salesTotalCents, summary.changeBaseCents || 0, summary.cashDrawerCents || 0, summary.withdrawalTotalCents, shift.expectedAmountCents ?? calculateExpectedCashAmount(db, shift.id), shift.closingAmountCents ?? '', shift.differenceCents ?? '']);
    const shiftMovements = movements.filter((movement) => movement.shiftId === shift.id);
    for (const movement of shiftMovements) {
      rows.push(['MOVIMENTO', shift.code, shift.status, shift.cashRegisterName || '', shift.openedAt || '', shift.openedBy || '', shift.closedAt || '', shift.closedBy || '', shift.shiftChangeOnClose ? 'SIM' : 'NAO', cashMovementLabel(movement.type), movement.createdAt || '', movement.operatorName || '', movement.amountCents || 0, formatCashMoney(movement.amountCents || 0), movement.note || '', '', '', '', '', '', '', '', '']);
    }
  }
  return rows.map((row) => row.map(csvEscape).join(';')).join('\n');
}

async function exportCashHistory(input = {}) {
  const db = getMutableDatabase();
  const format = String(input.format || 'CSV').toUpperCase() === 'TXT' ? 'TXT' : 'CSV';
  const days = Math.max(1, Math.min(365, Math.round(Number(input.days || 30))));
  const ext = format === 'TXT' ? 'txt' : 'csv';
  const result = await dialog.showSaveDialog(mainWindow, {
    title: `Salvar histórico de caixa (${days} dias)`,
    defaultPath: `pictour-historico-caixa-${days}d-${new Date().toISOString().slice(0, 10)}.${ext}`,
    filters: [{ name: format === 'TXT' ? 'Texto' : 'CSV', extensions: [ext] }]
  });
  if (result.canceled || !result.filePath) return { canceled: true, message: 'Exportação do histórico de caixa cancelada.' };
  const content = format === 'TXT' ? buildCashHistoryTxt(db, days) : `\ufeff${buildCashHistoryCsv(db, days)}`;
  fs.writeFileSync(result.filePath, content, 'utf-8');
  const snapshot = getCashHistorySnapshot(db, days);
  addAuditLog(db, { category: 'CASHIER', action: `CASHIER.HISTORY_EXPORT_${format}`, severity: 'INFO', actorName: input.operator || 'Operador', actorUsername: input.actorUsername, summary: `Histórico de caixa dos últimos ${days} dia(s) exportado em ${format}.`, details: { days, format, filePath: result.filePath, shifts: snapshot.shifts.length, movements: snapshot.movements.length, sales: snapshot.sales.length } });
  saveDatabase(db);
  return { canceled: false, message: `Histórico de caixa exportado em ${format}: ${snapshot.shifts.length} turno(s), ${snapshot.movements.length} movimento(s).`, filePath: result.filePath };
}

ipcMain.handle('audit:export-csv', async (_event, input = {}) => {
  return exportAuditLogsCsv(input);
});

ipcMain.handle('cashier:export-csv', async (_event, input = {}) => {
  return exportCashierCsv(input);
});

ipcMain.handle('cashier:close-report', async (_event, input = {}) => {
  return createCashCloseReport(input);
});

ipcMain.handle('cashier:export-history', async (_event, input = {}) => {
  return exportCashHistory(input);
});

ipcMain.handle('cashier:open-shift', (_event, input = {}) => {
  return openCashShift(input);
});

ipcMain.handle('cashier:withdrawal', (_event, input = {}) => {
  return registerCashWithdrawal(input);
});

ipcMain.handle('cashier:close-shift', (_event, input = {}) => {
  return closeCashShift(input);
});


ipcMain.handle('cashier:list-printers', async () => {
  try {
    if (!mainWindow?.webContents?.getPrintersAsync) return [];
    const printers = await mainWindow.webContents.getPrintersAsync();
    return (printers || []).map((printer) => ({ name: printer.name, displayName: printer.displayName || printer.name, status: printer.status || '' }));
  } catch {
    return [];
  }
});

ipcMain.handle('sales:cancel', (_event, input = {}) => {
  return cancelSale(input);
});

ipcMain.handle('sales:mark-delivered', (_event, input = {}) => {
  return markSaleDelivered(input);
});

ipcMain.handle('sales:export-receipt', async (_event, input = {}) => {
  return exportSaleReceipt(input);
});

ipcMain.handle('sales:export-photos', async (_event, input = {}) => {
  return exportSalePhotos(input);
});

ipcMain.handle('sales:create-delivery', (_event, input = {}) => {
  return createSaleDelivery(input);
});

ipcMain.handle('sales:open-delivery', (_event, input = {}) => {
  return openSaleDelivery(input);
});

ipcMain.handle('app:update-check', async () => {
  return checkForUpdates();
});

ipcMain.handle('app-data:open-data-folder', async () => {
  const { shell } = require('electron');
  ensureDir(getDataRoot());
  await shell.openPath(getDataRoot());
  return { opened: true, path: getDataRoot() };
});

ipcMain.handle('settings:update', (_event, input = {}) => {
  const nextDb = updateSettings(input);
  resetMultiStationAutoPull();
  return nextDb;
});

ipcMain.handle('shell:open-external-url', async (_event, url) => {
  const { shell } = require('electron');
  if (!url || !/^https?:\/\//i.test(String(url))) {
    throw new Error('URL externa inválida.');
  }
  await shell.openExternal(String(url));
  return { opened: true };
});

ipcMain.handle('sessions:create', (_event, input = {}) => {
  const db = getMutableDatabase();
  const sessionCode = generateSessionCode(db);
  const baseSession = {
    id: makeId('sess'),
    code: sessionCode,
    customerName: input.customerName || 'Cliente sem nome',
    locationName: input.locationName || db.settings?.locationName || 'Operação PicTour',
    photoCount: 0,
    selectedCount: 0,
    postTourEnabled: input.postTourEnabled ?? true,
    expiresAt: input.expiresAt || addDaysIso(db.settings?.defaultPostTourDays || 7),
    status: 'OPEN',
    createdAt: nowIso()
  };

  const session = ensurePostTourFields(baseSession);

  db.sessions = [session, ...(db.sessions || [])];
  addAuditLog(db, { category: 'SESSION', action: 'SESSION.CREATE', severity: 'INFO', ...actorFromInput(input, 'Operador'), entityType: 'SESSION', entityId: session.id, entityLabel: session.code, summary: `Sessão ${session.code} criada para ${session.customerName}.`, details: { customerName: session.customerName, locationName: session.locationName, expiresAt: session.expiresAt } });
  saveDatabase(db);
  return loadDatabase();
});

ipcMain.handle('sessions:set-status', (_event, input = {}) => {
  const db = getMutableDatabase();
  const sessionCode = String(input.sessionCode || '');
  const nextStatus = input.status === 'CLOSED' ? 'CLOSED' : 'OPEN';
  const session = (db.sessions || []).find((item) => item.code === sessionCode);
  if (!session) return loadDatabase();

  const previousStatus = session.status || 'OPEN';
  db.sessions = (db.sessions || []).map((item) => item.code === sessionCode ? {
    ...item,
    status: nextStatus,
    closedAt: nextStatus === 'CLOSED' ? nowIso() : undefined,
    reopenedAt: nextStatus === 'OPEN' ? nowIso() : item.reopenedAt
  } : item);

  if (nextStatus === 'CLOSED') {
    const ids = new Set((db.photos || []).filter((photo) => photo.sessionCode === sessionCode).map((photo) => photo.id));
    db.photos = (db.photos || []).map((photo) => ids.has(photo.id) ? { ...photo, selected: false } : photo);
  }

  addAuditLog(db, {
    category: 'SESSION',
    action: nextStatus === 'CLOSED' ? 'SESSION.CLOSE' : 'SESSION.REOPEN',
    severity: nextStatus === 'CLOSED' ? 'WARNING' : 'INFO',
    ...actorFromInput(input, 'Operador'),
    entityType: 'SESSION',
    entityId: session.id,
    entityLabel: session.code,
    summary: nextStatus === 'CLOSED' ? `Sessão ${session.code} encerrada.` : `Sessão ${session.code} reaberta.`,
    details: { previousStatus, nextStatus, customerName: session.customerName, locationName: session.locationName }
  });
  saveDatabase(db);
  return loadDatabase();
});

ipcMain.handle('photos:import-dialog', async (_event, input = {}) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Importar fotos para a sessão',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Imagens', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp'] }]
  });

  if (result.canceled || !result.filePaths.length) {
    return { canceled: true, importedCount: 0, database: loadDatabase() };
  }

  return importPhotoFiles({ sessionCode: input.sessionCode, files: result.filePaths });
});

ipcMain.handle('photos:import-folder-dialog', async (_event, input = {}) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Importar pasta de fotos para a sessão',
    properties: ['openDirectory']
  });

  if (result.canceled || !result.filePaths.length) {
    return { canceled: true, importedCount: 0, database: loadDatabase() };
  }

  return importPhotoFiles({ sessionCode: input.sessionCode, files: result.filePaths });
});

ipcMain.handle('photos:toggle-selected', (_event, photoId) => {
  const db = getMutableDatabase();
  const target = (db.photos || []).find((photo) => photo.id === photoId);
  db.photos = (db.photos || []).map((photo) => (
    photo.id === photoId ? { ...photo, selected: !photo.selected } : photo
  ));
  if (target) addAuditLog(db, { category: 'PHOTO', action: 'PHOTO.TOGGLE_SELECTION', severity: 'INFO', entityType: 'PHOTO', entityId: target.id, entityLabel: `${target.sessionCode} ${target.code}`, summary: `Seleção da foto ${target.code} alterada.`, details: { sessionCode: target.sessionCode, photoCode: target.code, selected: !target.selected } });
  saveDatabase(db);
  return loadDatabase();
});

ipcMain.handle('photos:toggle-favorite', (_event, photoId) => {
  const db = getMutableDatabase();
  const target = (db.photos || []).find((photo) => photo.id === photoId);
  db.photos = (db.photos || []).map((photo) => (
    photo.id === photoId ? { ...photo, favorite: !photo.favorite } : photo
  ));
  if (target) addAuditLog(db, { category: 'PHOTO', action: 'PHOTO.TOGGLE_FAVORITE', severity: 'INFO', entityType: 'PHOTO', entityId: target.id, entityLabel: `${target.sessionCode} ${target.code}`, summary: `Favorito da foto ${target.code} alterado.`, details: { sessionCode: target.sessionCode, photoCode: target.code, favorite: !target.favorite } });
  saveDatabase(db);
  return loadDatabase();
});

ipcMain.handle('photos:set-selection', (_event, input = {}) => {
  const db = getMutableDatabase();
  const ids = new Set(input.photoIds || []);
  db.photos = (db.photos || []).map((photo) => (
    ids.has(photo.id) && photo.status !== 'PURCHASED'
      ? { ...photo, selected: Boolean(input.selected) }
      : photo
  ));
  addAuditLog(db, { category: 'PHOTO', action: 'PHOTO.BATCH_SELECTION', severity: 'INFO', ...actorFromInput(input, 'Operador'), summary: `${ids.size} foto(s) tiveram seleção alterada.`, details: { selected: Boolean(input.selected), photoCount: ids.size } });
  saveDatabase(db);
  return loadDatabase();
});

ipcMain.handle('sales:register-manual', (_event, input = {}) => {
  const db = getMutableDatabase();
  const openShift = getOpenCashShift(db);
  const channel = input.channel || 'DESK';
  if (channel === 'DESK' && !openShift && !input.cashShiftId) {
    addAuditLog(db, { category: 'SALE', action: 'SALE.BLOCKED_CASH_CLOSED', severity: 'WARNING', ...actorFromInput(input, input.sellerName || 'Operador'), summary: 'Tentativa de venda presencial bloqueada porque o caixa estava fechado.', details: { sessionCode: input.sessionCode, amountBaseCents: input.amountBaseCents || input.amountCents || 0, method: input.method || 'MANUAL_PIX' } });
    saveDatabase(db);
    return loadDatabase();
  }
  const session = (db.sessions || []).find((item) => item.code === input.sessionCode);
  if (channel === 'DESK' && session?.status === 'CLOSED') {
    addAuditLog(db, { category: 'SALE', action: 'SALE.BLOCKED_SESSION_CLOSED', severity: 'WARNING', ...actorFromInput(input, input.sellerName || 'Operador'), entityType: 'SESSION', entityId: session.id, entityLabel: session.code, summary: `Tentativa de venda bloqueada porque a sessão ${session.code} estava encerrada.`, details: { sessionCode: input.sessionCode, amountBaseCents: input.amountBaseCents || input.amountCents || 0 } });
    saveDatabase(db);
    return loadDatabase();
  }
  const photoIds = Array.isArray(input.photoIds) ? input.photoIds.filter(Boolean) : [];
  const amountBaseCents = Math.max(0, Math.round(Number(input.amountBaseCents || input.amountCents || 0)));
  const rawTenders = Array.isArray(input.tenders) && input.tenders.length
    ? input.tenders
    : [{ method: input.method || 'MANUAL_PIX', currency: input.currency || 'BRL', amountCents: input.amountCents || amountBaseCents, amountBaseCents: input.paidBaseCents || amountBaseCents }];
  const tenders = rawTenders
    .map((tender, index) => normalizeSaleTender(tender, `tender_${index + 1}`))
    .filter((tender) => tender.amountCents > 0 || tender.amountBaseCents > 0);
  const paidBaseCents = Math.max(0, Math.round(Number(input.paidBaseCents ?? tenders.reduce((sum, tender) => sum + Number(tender.amountBaseCents || 0), 0))));
  const changeBaseCents = Math.max(0, Math.round(Number(input.changeBaseCents ?? Math.max(0, paidBaseCents - amountBaseCents))));
  const primaryTender = tenders[0] || { method: input.method || 'MANUAL_PIX', currency: input.currency || 'BRL', amountCents: input.amountCents || amountBaseCents };
  const sale = {
    id: makeId('sale'),
    code: generateSaleCode(db),
    sellerName: input.sellerName || 'Operador',
    method: tenders.length > 1 ? 'MIXED' : (input.method || primaryTender.method || 'MANUAL_PIX'),
    currency: tenders.length > 1 ? 'BRL' : (input.currency || primaryTender.currency || 'BRL'),
    amountCents: Number(input.amountCents || (tenders.length > 1 ? amountBaseCents : amountBaseCents)),
    amountBaseCents,
    paidBaseCents,
    changeBaseCents,
    paymentSummary: input.paymentSummary || undefined,
    tenders,
    createdAt: nowIso(),
    channel,
    sessionCode: input.sessionCode || undefined,
    onlineCheckoutId: input.onlineCheckoutId || undefined,
    externalReference: input.externalReference || undefined,
    gatewayPaymentId: input.gatewayPaymentId || undefined,
    cloudSaleId: input.cloudSaleId || undefined,
    cloudSyncedAt: input.cloudSyncedAt || undefined,
    packageName: input.packageName || undefined,
    cashShiftId: input.cashShiftId || openShift?.id || undefined,
    photoIds,
    saleLineItems: Array.isArray(input.saleLineItems) ? input.saleLineItems : undefined,
    saleStatus: 'ACTIVE'
  };

  const selectedPhotoIds = new Set(photoIds);
  db.photos = (db.photos || []).map((photo) => (
    selectedPhotoIds.has(photo.id) ? { ...photo, status: 'PURCHASED', selected: false } : photo
  ));
  const saleWithDelivery = photoIds.length ? normalizeSaleDeliveryFields({ ...sale, deliveryExpiresAt: addDaysIso(7), deliveryStatus: 'PENDING' }) : sale;
  const finalSale = attachCommissionToSale(db, saleWithDelivery);
  db.cashierSales = [finalSale, ...(db.cashierSales || [])];
  addAuditLog(db, { category: 'SALE', action: 'SALE.REGISTER', severity: 'CRITICAL', ...actorFromInput(input, sale.sellerName), entityType: 'SALE', entityId: sale.id, entityLabel: sale.code, summary: `Venda ${sale.code} registrada por ${sale.sellerName}.`, details: { sessionCode: sale.sessionCode, amountBaseCents: sale.amountBaseCents, amountCents: sale.amountCents, paidBaseCents: sale.paidBaseCents, changeBaseCents: sale.changeBaseCents, currency: sale.currency, method: sale.method, tenders: sale.tenders, paymentSummary: salePaymentSummary(sale), channel: sale.channel, packageName: sale.packageName, saleLineItems: sale.saleLineItems, photoCount: photoIds.length, cashShiftId: sale.cashShiftId, commissionTotalCents: finalSale.commissionTotalCents } });
  saveDatabase(db);
  return loadDatabase();
});

ipcMain.handle('photos:capture-save', (_event, input = {}) => {
  return saveCapturedPhoto(input);
});

ipcMain.handle('photos:read-data-url', (_event, photoId) => {
  return readPhotoDataUrl(photoId);
});

ipcMain.handle('photos:save-chroma-render', (_event, input = {}) => {
  return saveChromaRender(input);
});

ipcMain.handle('photos:export-purchased', (_event, input = {}) => {
  return exportPurchasedPhotos(input);
});

ipcMain.handle('mercado-pago:create-checkout', async (_event, input = {}) => {
  try {
    return await createMercadoPagoCheckout(input);
  } catch (error) {
    return { ok: false, message: error.message || 'Falha ao criar checkout Mercado Pago.', database: loadDatabase() };
  }
});

ipcMain.handle('mercado-pago:check-checkout', async (_event, input = {}) => {
  try {
    return await checkMercadoPagoCheckout(input);
  } catch (error) {
    return { ok: false, status: 'UNKNOWN', message: error.message || 'Falha ao consultar checkout Mercado Pago.', database: loadDatabase() };
  }
});

ipcMain.handle('customer-display:open', (_event, snapshot) => {
  const result = createCustomerWindow(snapshot);
  const db = getMutableDatabase();
  addAuditLog(db, { category: 'CUSTOMER_DISPLAY', action: 'CUSTOMER_DISPLAY.OPEN', severity: 'INFO', actorName: 'Operador', summary: 'Monitor do cliente aberto/atualizado.', details: { sessionCode: snapshot?.sessionCode, photoCode: snapshot?.photoCode, selectedCount: snapshot?.selectedCount, totalCents: snapshot?.totalCents } });
  saveDatabase(db);
  return result;
});

ipcMain.handle('customer-display:update', (_event, snapshot) => {
  latestCustomerSnapshot = snapshot;
  if (customerWindow && !customerWindow.isDestroyed()) {
    customerWindow.webContents.send('customer-display:update', snapshot);
    return { updated: true };
  }
  return { updated: false };
});

ipcMain.handle('customer-display:status', () => {
  return { open: Boolean(customerWindow && !customerWindow.isDestroyed()) };
});

ipcMain.handle('customer-display:close', () => {
  if (customerWindow && !customerWindow.isDestroyed()) {
    customerWindow.close();
    customerWindow = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('customer-display:closed');
    }
    const db = getMutableDatabase();
    addAuditLog(db, { category: 'CUSTOMER_DISPLAY', action: 'CUSTOMER_DISPLAY.CLOSE', severity: 'INFO', actorName: 'Operador', summary: 'Monitor do cliente fechado.', details: { lastSessionCode: latestCustomerSnapshot?.sessionCode, lastPhotoCode: latestCustomerSnapshot?.photoCode } });
    saveDatabase(db);
    return { closed: true };
  }
  return { closed: false };
});
