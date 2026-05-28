export type ThemeMode = 'light' | 'dark';

export type NavKey =
  | 'dashboard'
  | 'operation'
  | 'readiness'
  | 'demo-guide'
  | 'saas'
  | 'sessions'
  | 'capture'
  | 'chroma'
  | 'quick-sale'
  | 'post-tour'
  | 'reports'
  | 'photographer'
  | 'cashier'
  | 'audit'
  | 'diagnostics'
  | 'settings';

export type CurrencyCode = 'BRL' | 'USD' | 'EUR' | 'PYG' | 'ARS';

export type PhotoStatus = 'READY' | 'SELECTED' | 'PURCHASED' | 'PROCESSING';

export type AppRole = 'MANAGER' | 'STAFF';

export type AppPermission =
  | 'DASHBOARD'
  | 'OPERATION_STATUS'
  | 'COMMERCIAL_READINESS'
  | 'COMMERCIAL_DEMO'
  | 'SESSIONS'
  | 'CAPTURE'
  | 'CHROMA'
  | 'QUICK_SALE'
  | 'POST_TOUR'
  | 'PHOTOGRAPHER_PORTAL'
  | 'CASHIER'
  | 'REPORTS'
  | 'CASH_CONTROL'
  | 'CANCEL_SALE'
  | 'CLOUD_PUBLISH'
  | 'BACKUP'
  | 'AUDIT_LOG'
  | 'SETTINGS'
  | 'SAAS_ADMIN';

export type PermissionMap = Partial<Record<AppPermission, boolean>>;

export type CommissionMode = 'NONE' | 'INDIVIDUAL' | 'COLLECTIVE';

export type CommissionSettings = {
  mode: CommissionMode;
  defaultRatePercent: number;
  individualRates?: Record<string, number>;
  collectiveUsernames?: string[];
  includeManagers?: boolean;
};

export type CashSettings = {
  recommendedChangeFundCents: number;
  requireOpeningChangeFund?: boolean;
  warnIfClosingChangeFundDifferent?: boolean;
  cashRegisterName?: string;
  receiptPrinterName?: string;
  receiptPaperWidthChars?: number;
  autoPrintCashReceipts?: boolean;
};

export type SubscriptionPlan = 'STARTER' | 'PRO' | 'ENTERPRISE';

export type BillingCycle = 'MONTHLY' | 'YEARLY';
export type BillingProvider = 'MANUAL' | 'MERCADO_PAGO' | 'STRIPE' | 'PIX';
export type SubscriptionStatus = 'NOT_CONFIGURED' | 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'SUSPENDED';

export type SubscriptionSettings = {
  enabled?: boolean;
  plan?: SubscriptionPlan;
  status?: SubscriptionStatus;
  billingCycle?: BillingCycle;
  provider?: BillingProvider;
  monthlyPriceCents?: number;
  yearlyPriceCents?: number;
  nextBillingAt?: string;
  lastInvoiceAt?: string;
  lastPaymentAt?: string;
  graceDays?: number;
  autoSuspendPastDue?: boolean;
  invoiceEmail?: string;
  notes?: string;
};

export type LicenseStatus = 'TRIAL' | 'ACTIVE' | 'EXPIRED' | 'SUSPENDED' | 'OFFLINE_GRACE';

export type LicenseFeatures = {
  cloudGallery: boolean;
  mercadoPago: boolean;
  aiBackgroundRemoval: boolean;
  auditLogs: boolean;
  multiLocation: boolean;
  advancedReports: boolean;
};

export type LicenseSettings = {
  companyId?: string;
  licenseKey?: string;
  licenseServerUrl?: string;
  serverLicenseId?: string;
  lastValidationMessage?: string;
  lastCheckInAt?: string;
  lastCheckInMessage?: string;
  plan: SubscriptionPlan;
  status: LicenseStatus;
  activatedAt?: string;
  expiresAt?: string;
  lastValidatedAt?: string;
  offlineGraceDays: number;
  maxUsers: number;
  maxLocations: number;
  monthlyPhotoLimit: number;
  features: LicenseFeatures;
  notes?: string;
};

export type LicenseValidationInput = {
  companyId?: string;
  licenseKey?: string;
  licenseServerUrl?: string;
  actorUsername?: string;
  silentCheckIn?: boolean;
};

export type LicenseValidationResult = {
  ok: boolean;
  message: string;
  license?: LicenseSettings;
  company?: { id: string; name: string; status?: string };
  database: LocalDatabase;
};

export type CommissionSplit = {
  username: string;
  name: string;
  role: AppRole;
  amountBaseCents: number;
  ratePercent?: number;
  sharePercent?: number;
};

export type AppUser = {
  id: string;
  name: string;
  username: string;
  role: AppRole;
  adminPermissions?: boolean;
  permissions?: PermissionMap;
  active?: boolean;
  passwordHash?: string;
  password?: string;
  forcePasswordChange?: boolean;
  createdAt?: string;
};

export type AuthUser = Omit<AppUser, 'passwordHash' | 'password'>;

export type LoginInput = {
  username: string;
  password: string;
};

export type LoginResult = {
  ok: boolean;
  message: string;
  user?: AuthUser;
  database?: LocalDatabase;
};

export type ChangePasswordInput = {
  username: string;
  currentPassword: string;
  newPassword: string;
};

export type ChangePasswordResult = {
  ok: boolean;
  message: string;
  user?: AuthUser;
  database?: LocalDatabase;
};


export type AppLocation = {
  id: string;
  name: string;
  active?: boolean;
  createdAt?: string;
};

export type ChromaAssetType = 'SCENARIO' | 'TEMPLATE' | 'OVERLAY';


export type QuickScenario = {
  id: string;
  name: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  isDefault?: boolean;
  isActive?: boolean;
  sortOrder?: number;
  createdAt?: string;
  updatedAt?: string;
};

export type ChromaAsset = {
  id: string;
  name: string;
  description?: string;
  type: ChromaAssetType;
  locationName?: string;
  imageUrl: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  isActive?: boolean;
  isDefault?: boolean;
  sortOrder?: number;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
};

export type ChromaComposition = {
  mode: 'CHROMA';
  segmentationMode?: 'CHROMA_COLOR' | 'AI_PERSON';
  sourcePhotoId: string;
  backgroundId: string;
  backgroundName: string;
  templateId?: string;
  templateName?: string;
  outputPresetId?: string;
  outputWidth?: number;
  outputHeight?: number;
  overlayStyle?: string;
  customBackgroundName?: string;
  chromaAssetId?: string;
  chromaAssetName?: string;
  chromaAssetType?: ChromaAssetType;
  overlayAssetId?: string;
  overlayAssetName?: string;
  overlayAssetType?: ChromaAssetType;
  subjectX: number;
  subjectY: number;
  subjectScale: number;
  subjectRotation?: number;
  backgroundX: number;
  backgroundY: number;
  backgroundScale: number;
  backgroundBlur?: number;
  keyThreshold: number;
  keySoftness: number;
  spillReduction: number;
  edgeCleanup?: number;
  edgeFeather?: number;
  brightness: number;
  contrast: number;
  saturation?: number;
  temperature?: number;
  shadow: number;
  overlayIntensity?: number;
  overlayX?: number;
  overlayY?: number;
  overlayScale?: number;
  overlayRotation?: number;
  renderedAt?: string;
};

export type Photo = {
  id: string;
  code: string;
  label: string;
  sessionCode: string;
  status: PhotoStatus;
  kind: 'UPLOAD' | 'CHROMA' | 'CAMERA';
  backgroundName?: string;
  sourcePhotoId?: string;
  composition?: ChromaComposition;
  selected: boolean;
  originalFileName?: string;
  storedPath?: string;
  previewUrl?: string;
  importedAt?: string;
  favorite?: boolean;
  cloudStatus?: 'PENDING' | 'SYNCED' | 'FAILED';
  cloudSyncedAt?: string;
  cloudHash?: string;
  cloudPreviewUrl?: string;
  cloudThumbnailUrl?: string;
  cloudSyncError?: string;
};

export type PhotoSession = {
  id: string;
  code: string;
  customerName: string;
  locationName: string;
  photoCount: number;
  selectedCount: number;
  postTourEnabled: boolean;
  expiresAt: string;
  publicSlug?: string;
  accessCode?: string;
  postTourUrl?: string;
  cloudGalleryUrl?: string;
  cloudPublishedAt?: string;
  cloudPhotoCount?: number;
  cloudLastSyncSummary?: { syncedCount: number; skippedCount: number; failedCount: number; at: string };
  cloudLastSalesSyncAt?: string;
  cloudLastSalesSyncSummary?: { importedSales: number; updatedPhotos: number; at: string };
  localGalleryUrl?: string;
  status: 'OPEN' | 'SOLD' | 'EXPIRED' | 'CLOSED';
  createdAt?: string;
};

export type PackagePricingMode = 'PER_PHOTO' | 'FIXED';

export type PackageOption = {
  id: string;
  name: string;
  locationId?: string;
  locationName?: string;
  photoQuantity: number | null;
  includesAllPhotos: boolean;
  priceCents: number;
  currency: CurrencyCode;
  pricingMode?: PackagePricingMode;
  active?: boolean;
  createdAt?: string;
};

export type PaymentGatewayEnvironment = 'sandbox' | 'production';

export type MercadoPagoSettings = {
  enabled: boolean;
  environment: PaymentGatewayEnvironment;
  publicKey?: string;
  accessToken?: string;
  webhookUrl?: string;
  webhookSecret?: string;
  autoReleaseDelivery?: boolean;
  successUrl?: string;
  failureUrl?: string;
  pendingUrl?: string;
};

export type TenderMethod =
  | 'PIX_ONLINE'
  | 'CREDIT_CARD_ONLINE'
  | 'DEBIT_CARD_ONLINE'
  | 'CASH'
  | 'MIXED'
  | 'MANUAL_PIX'
  | 'EXTERNAL_CARD_MACHINE';

export type SaleLineItem = {
  id: string;
  packageId?: string;
  packageName: string;
  photoId?: string;
  photoCode?: string;
  priceCents: number;
  currency: CurrencyCode;
};

export type SaleTender = {
  id: string;
  method: TenderMethod;
  currency: CurrencyCode;
  amountCents: number;
  amountBaseCents: number;
  label?: string;
};

export type CashierSale = {
  id: string;
  code: string;
  sellerName: string;
  method: TenderMethod;
  currency: CurrencyCode;
  amountCents: number;
  amountBaseCents: number;
  createdAt: string;
  channel?: 'DESK' | 'POST_TOUR';
  onlineCheckoutId?: string;
  externalReference?: string;
  gatewayPaymentId?: string;
  sessionCode?: string;
  cloudSaleId?: string;
  cloudSyncedAt?: string;
  packageName?: string;
  photoIds?: string[];
  saleLineItems?: SaleLineItem[];
  tenders?: SaleTender[];
  paidBaseCents?: number;
  changeBaseCents?: number;
  paymentSummary?: string;
  cashShiftId?: string;
  commissionMode?: CommissionMode;
  commissionBaseCents?: number;
  commissionRatePercent?: number;
  commissionTotalCents?: number;
  commissionSplits?: CommissionSplit[];

  deliverySlug?: string;
  deliveryUrl?: string;
  deliveryExpiresAt?: string;
  deliveryDownloadCount?: number;
  lastDeliveryAccessAt?: string;
  deliveredAt?: string;
  deliveredBy?: string;
  deliveryStatus?: 'PENDING' | 'DELIVERED';
  receiptExportedAt?: string;
  receiptCode?: string;
  saleStatus?: 'ACTIVE' | 'CANCELLED';
  cancelledAt?: string;
  cancelledBy?: string;
  cancelReason?: string;
};

export type CashShiftStatus = 'OPEN' | 'CLOSED';

export type CashShift = {
  id: string;
  code: string;
  status: CashShiftStatus;
  openedAt: string;
  openedBy: string;
  openingAmountCents: number;
  openingChangeFundCents?: number;
  recommendedChangeFundCents?: number;
  note?: string;
  closedAt?: string;
  closedBy?: string;
  closingAmountCents?: number;
  expectedAmountCents?: number;
  differenceCents?: number;
  closingChangeFundCents?: number;
  expectedChangeFundCents?: number;
  changeFundDifferenceCents?: number;
  closeNote?: string;
  cashRegisterName?: string;
  shiftChangeOnClose?: boolean;
};

export type CashMovementType = 'OPENING' | 'WITHDRAWAL' | 'CLOSE' | 'SALE_CANCEL';

export type CashMovement = {
  id: string;
  shiftId?: string;
  type: CashMovementType;
  amountCents: number;
  createdAt: string;
  operatorName: string;
  note?: string;
  saleId?: string;
  saleCode?: string;
};

export type AuditSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export type AuditCategory =
  | 'AUTH'
  | 'SETTINGS'
  | 'SESSION'
  | 'PHOTO'
  | 'SALE'
  | 'CASHIER'
  | 'CLOUD'
  | 'BACKUP'
  | 'CUSTOMER_DISPLAY'
  | 'SYSTEM';

export type AuditLog = {
  id: string;
  createdAt: string;
  category: AuditCategory;
  action: string;
  severity: AuditSeverity;
  actorName?: string;
  actorUsername?: string;
  entityType?: string;
  entityId?: string;
  entityLabel?: string;
  summary: string;
  details?: Record<string, unknown>;
  deviceName?: string;
  appVersion?: string;
};

export type AuditLogFilters = {
  query?: string;
  category?: AuditCategory | 'ALL';
  severity?: AuditSeverity | 'ALL';
  actorUsername?: string;
  period?: '1H' | '3H' | 'DAY' | 'WEEK' | 'MONTH' | 'ALL';
};

export type ExportAuditLogsInput = {
  logs: AuditLog[];
  actorName?: string;
  actorUsername?: string;
};

export type ExportAuditLogsResult = {
  canceled?: boolean;
  message: string;
  filePath?: string;
};

export type OpenCashShiftInput = {
  operatorName: string;
  openingAmountCents: number;
  openingChangeFundCents?: number;
  recommendedChangeFundCents?: number;
  note?: string;
};

export type CashWithdrawalInput = {
  shiftId?: string;
  operatorName: string;
  amountCents: number;
  reason?: string;
};

export type CloseCashShiftInput = {
  shiftId?: string;
  operatorName: string;
  closingAmountCents: number;
  closingChangeFundCents?: number;
  note?: string;
  shiftChange?: boolean;
};

export type CancelSaleInput = {
  saleId: string;
  operatorName: string;
  reason: string;
};

export type CashOperationResult = {
  ok: boolean;
  message: string;
  database: LocalDatabase;
  receiptMessage?: string;
  receiptPath?: string;
};


export type MultiStationMode = 'PRIMARY' | 'SECONDARY';

export type AntiPrintSettings = {
  enabled: boolean;
  watermarkText?: string;
  includeSessionCode?: boolean;
  includePhotoCode?: boolean;
  includeTimestamp?: boolean;
  includeStationName?: boolean;
  opacity?: number;
  density?: number;
  rotationDeg?: number;
  noiseIntensity?: number;
  previewBlur?: number;
  resolutionGuard?: boolean;
  blockContextMenu?: boolean;
  blockDrag?: boolean;
  shieldOnBlur?: boolean;
  shieldAfterInactivitySeconds?: number;
  showSessionMeta?: boolean;
};

export type MultiStationSettings = {
  enabled: boolean;
  mode: MultiStationMode;
  stationName?: string;
  syncToken?: string;
  primaryUrl?: string;
  autoPullSeconds?: number;
  lastSyncAt?: string;
  lastSyncMessage?: string;
};

export type MultiStationInfo = {
  enabled: boolean;
  mode: MultiStationMode;
  stationName: string;
  appVersion: string;
  schemaVersion: number;
  primaryUrl?: string;
  localUrl?: string;
  networkUrls?: string[];
  sessionCount?: number;
  photoCount?: number;
  saleCount?: number;
  lastSyncAt?: string;
  lastSyncMessage?: string;
};

export type MultiStationSyncResult = {
  ok: boolean;
  message: string;
  importedSessions?: number;
  importedPhotos?: number;
  importedSales?: number;
  downloadedPhotos?: number;
  failedPhotos?: number;
  database: LocalDatabase;
};

export type PhotographerPortalSettings = {
  enabled: boolean;
  requireSessionAccessCode?: boolean;
  maxFilesPerUpload?: number;
  defaultLabelPrefix?: string;
  mobileMode?: 'CAPTURE_ONLY' | 'FULL_OPERATION';
  allowMobileSelection?: boolean;
  allowMobileFavorite?: boolean;
  showPurchasedOnMobile?: boolean;
  enableUploadQueue?: boolean;
};


export type CommercialOnboardingStep =
  | 'COMPANY'
  | 'LOCATIONS'
  | 'PACKAGES'
  | 'MERCADO_PAGO'
  | 'SECURITY'
  | 'BACKUP'
  | 'DEMO_DONE';

export type CommercialSetupSettings = {
  onboardingCompleted?: boolean;
  completedStepIds?: CommercialOnboardingStep[];
  demoModeLoaded?: boolean;
  demoLoadedAt?: string;
  lastBackupAt?: string;
  lastBackupPath?: string;
  lastRestoreAt?: string;
  installMode?: 'DEV' | 'PACKAGED';
  installerNotesAcknowledged?: boolean;
};

export type CloudStorageDriver = 'local' | 's3' | 'r2';

export type CloudStorageSettings = {
  driver: CloudStorageDriver;
  bucket?: string;
  endpoint?: string;
  publicBaseUrl?: string;
  signedDownloadTtlSeconds?: number;
  keepOriginalsPrivate?: boolean;
  lastHealthCheckAt?: string;
  lastHealthMessage?: string;
};

export type CloudSettings = {
  enabled: boolean;
  apiBaseUrl?: string;
  apiKey?: string;
  publicGalleryBaseUrl?: string;
  storage?: CloudStorageSettings;
};

export type CloudSyncQueueItem = {
  id: string;
  sessionCode: string;
  photoId: string;
  status: 'PENDING' | 'FAILED';
  attempts: number;
  lastError?: string;
  updatedAt: string;
};

export type ExchangeRates = Record<CurrencyCode, number>;

export type OperationChecklist = {
  completedItemIds: string[];
  dismissedOnboarding?: boolean;
  updatedAt?: string;
};


export type SaaSSettings = {
  tenantSlug?: string;
  adminPanelUrl?: string;
  billingStatus?: 'NOT_CONFIGURED' | 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED';
  billingCycle?: BillingCycle;
  seatsPurchased?: number;
  deviceLimit?: number;
  lastCloudSnapshotAt?: string;
  requireOnlineLicense?: boolean;
  graceModeStartedAt?: string;
};

export type AppSettings = {
  companyName: string;
  locationName: string;
  defaultPostTourDays: number;
  defaultCurrency?: CurrencyCode;
  locations?: AppLocation[];
  users?: AppUser[];
  packages?: PackageOption[];
  exchangeRates?: ExchangeRates;
  mercadoPago?: MercadoPagoSettings;
  cloud?: CloudSettings;
  cloudStorage?: CloudStorageSettings;
  saas?: SaaSSettings;
  subscription?: SubscriptionSettings;
  photographerPortal?: PhotographerPortalSettings;
  multiStation?: MultiStationSettings;
  antiPrint?: AntiPrintSettings;
  commercialSetup?: CommercialSetupSettings;
  commission?: CommissionSettings;
  cash?: CashSettings;
  operationChecklist?: OperationChecklist;
  license?: LicenseSettings;
  updateFeedUrl?: string;
  lastUpdateCheck?: AppUpdateInfo;
  chromaAssets?: ChromaAsset[];
  quickScenarios?: QuickScenario[];
};

export type OnlineCheckoutStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'UNKNOWN';

export type OnlineCheckout = {
  id: string;
  gateway: 'MERCADO_PAGO';
  environment: PaymentGatewayEnvironment;
  sessionCode: string;
  photoIds: string[];
  packageName: string;
  amountCents: number;
  currency: CurrencyCode;
  buyerEmail?: string;
  preferenceId?: string;
  externalReference: string;
  checkoutUrl?: string;
  sandboxCheckoutUrl?: string;
  status: OnlineCheckoutStatus;
  gatewayStatus?: string;
  gatewayPaymentId?: string;
  createdAt: string;
  paidAt?: string;
  lastCheckedAt?: string;
  autoReleaseTriggered?: boolean;
  deliveryUrl?: string;
};

export type CloudPublishSessionInput = {
  sessionCode: string;
  mode?: 'ALL' | 'FAILED_ONLY';
};

export type CloudStorageInfo = {
  ok: boolean;
  message?: string;
  storage?: {
    driver: CloudStorageDriver;
    bucket?: string;
    endpoint?: string;
    publicBaseUrl?: string;
    objectCount?: number;
    byteSize?: number;
    signedDownloads?: boolean;
    ttlSeconds?: number;
  };
  checkedAt?: string;
};

export type CloudPublishSessionResult = {
  ok: boolean;
  message: string;
  cloudUrl?: string;
  protectedUrl?: string;
  publishedPhotoCount?: number;
  syncedCount?: number;
  skippedCount?: number;
  failedCount?: number;
  details?: Array<{ photoId: string; code?: string; status: string; message?: string }>;
  database: LocalDatabase;
};


export type CloudSyncSalesInput = {
  sessionCode?: string;
  since?: string;
};

export type CloudSyncSalesResult = {
  ok: boolean;
  message: string;
  importedSales: number;
  updatedPhotos: number;
  matchedSessions: number;
  database: LocalDatabase;
};

export type UpdateSettingsInput = Partial<AppSettings> & { actorUsername?: string };

export type CreateMercadoPagoCheckoutInput = {
  sessionCode: string;
  photoIds: string[];
  packageName: string;
  amountCents: number;
  currency?: CurrencyCode;
  buyerEmail?: string;
};

export type CreateMercadoPagoCheckoutResult = {
  ok: boolean;
  message: string;
  checkout?: OnlineCheckout;
  database: LocalDatabase;
};

export type CheckMercadoPagoCheckoutInput = {
  checkoutId: string;
};

export type CheckMercadoPagoCheckoutResult = {
  ok: boolean;
  status: OnlineCheckoutStatus;
  gatewayStatus?: string;
  message: string;
  database: LocalDatabase;
  receiptMessage?: string;
  receiptPath?: string;
};

export type PhotographerPortalInfo = PublicGalleryInfo & {
  photographerUrl: string;
  primaryPhotographerUrl: string;
};

export type PublicGalleryInfo = {
  enabled: boolean;
  port: number;
  localUrl: string;
  networkUrls: string[];
  primaryUrl: string;
};

export type OpenPhotographerPortalResult = {
  ok: boolean;
  url?: string;
  message: string;
};


export type DeliveryAccessLog = {
  id: string;
  saleId: string;
  saleCode?: string;
  sessionCode?: string;
  action: 'VIEW' | 'DOWNLOAD_PHOTO' | 'DOWNLOAD_ALL';
  photoId?: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
};

export type CreateSaleDeliveryInput = {
  saleId: string;
  expiresInDays?: number;
  operatorName?: string;
  actorUsername?: string;
};

export type CreateSaleDeliveryResult = {
  ok: boolean;
  message: string;
  sale?: CashierSale;
  url?: string;
  database: LocalDatabase;
};

export type LocalDatabase = {
  version: number;
  settings: AppSettings;
  sessions: PhotoSession[];
  photos: Photo[];
  cashierSales: CashierSale[];
  cashShifts?: CashShift[];
  cashMovements?: CashMovement[];
  auditLogs?: AuditLog[];
  onlineCheckouts: OnlineCheckout[];
  cloudSyncQueue?: CloudSyncQueueItem[];
  deliveryAccessLogs?: DeliveryAccessLog[];
  publicGallery?: PublicGalleryInfo;
  migrationInfo?: MigrationInfo;
};

export type CreateSessionInput = {
  customerName?: string;
  locationName?: string;
  postTourEnabled?: boolean;
  expiresAt?: string;
};


export type SetSessionStatusInput = {
  sessionCode: string;
  status: 'OPEN' | 'CLOSED';
  actorName?: string;
  actorUsername?: string;
};

export type ImportPhotosInput = {
  sessionCode: string;
};

export type ImportPhotosResult = {
  canceled?: boolean;
  importedCount: number;
  database: LocalDatabase;
};

export type SaveCameraCaptureInput = {
  sessionCode: string;
  dataUrl: string;
  label?: string;
};

export type SaveCameraCaptureResult = {
  photoId: string;
  photoCode: string;
  database: LocalDatabase;
};

export type ReadPhotoDataUrlResult = {
  photoId: string;
  dataUrl: string;
};

export type SaveChromaRenderInput = {
  sessionCode: string;
  sourcePhotoId: string;
  dataUrl: string;
  backgroundName: string;
  composition: ChromaComposition;
};

export type SaveChromaRenderResult = {
  photoId: string;
  photoCode: string;
  database: LocalDatabase;
};

export type RegisterManualSaleInput = {
  sellerName?: string;
  method: TenderMethod;
  currency: CurrencyCode;
  amountCents: number;
  amountBaseCents: number;
  photoIds: string[];
  saleLineItems?: SaleLineItem[];
  tenders?: SaleTender[];
  paidBaseCents?: number;
  changeBaseCents?: number;
  paymentSummary?: string;
  channel?: 'DESK' | 'POST_TOUR';
  onlineCheckoutId?: string;
  externalReference?: string;
  gatewayPaymentId?: string;
  sessionCode?: string;
  cloudSaleId?: string;
  cloudSyncedAt?: string;
  packageName?: string;
  cashShiftId?: string;
  commissionMode?: CommissionMode;
  commissionBaseCents?: number;
  commissionRatePercent?: number;
  commissionTotalCents?: number;
  commissionSplits?: CommissionSplit[];
};

export type ExportPurchasedPhotosInput = {
  sessionCode: string;
  photoIds?: string[];
};

export type ExportPurchasedPhotosResult = {
  canceled?: boolean;
  exportedCount: number;
  folderPath?: string;
};

export type SetPhotoSelectionInput = {
  photoIds: string[];
  selected: boolean;
};




export type MarkSaleDeliveredInput = {
  saleId: string;
  operatorName?: string;
  actorUsername?: string;
};

export type SaleReceiptInput = {
  saleId: string;
  operatorName?: string;
  actorUsername?: string;
};

export type SaleReceiptResult = {
  ok: boolean;
  message: string;
  filePath?: string;
  database: LocalDatabase;
};

export type AppUpdateInfo = {
  currentVersion: string;
  latestVersion?: string;
  updateAvailable: boolean;
  releaseNotes?: string[];
  downloadUrl?: string;
  checkedAt: string;
  source: 'LOCAL' | 'CLOUD';
  message: string;
};

export type MigrationInfo = {
  schemaVersion: number;
  lastMigratedAt?: string;
  lastMigrationFrom?: number;
  lastMigrationBackupPath?: string;
  migrationLog?: string[];
};

export type DemoDataResult = {
  ok: boolean;
  message: string;
  database: LocalDatabase;
  receiptMessage?: string;
  receiptPath?: string;
};

export type BackupResult = {
  canceled?: boolean;
  message: string;
  filePath?: string;
  database?: LocalDatabase;
};

export type CashierExportResult = {
  canceled?: boolean;
  message: string;
  filePath?: string;
};

export type SystemDiagnostics = {
  appVersion: string;
  isPackaged: boolean;
  platform: string;
  dataRoot: string;
  databasePath: string;
  databaseExists: boolean;
  photoLibraryPath: string;
  photoLibraryExists: boolean;
  backupDirectoryPath?: string;
  backupCount?: number;
  lastBackupAt?: string;
  lastBackupPath?: string;
  demoModeLoaded?: boolean;
  sessionCount: number;
  photoCount: number;
  saleCount: number;
  publicGallery: PublicGalleryInfo;
  customerDisplayOpen: boolean;
  mercadoPagoConfigured: boolean;
  cloudConfigured: boolean;
  backgroundRemovalInstalled: boolean;
  defaultAdminStillNeedsPasswordChange: boolean;
  packagedBuildReady?: boolean;
  onboardingCompleted?: boolean;
  multiStationConfigured?: boolean;
  photographerPortalEnabled?: boolean;
  licenseStatus?: LicenseStatus;
  licensePlan?: SubscriptionPlan;
  licenseDaysLeft?: number | null;
  licenseReady?: boolean;
  schemaVersion?: number;
  lastMigratedAt?: string;
  lastMigrationBackupPath?: string;
  updateCurrentVersion?: string;
  updateLatestVersion?: string;
  updateAvailable?: boolean;
  lastUpdateCheckMessage?: string;
};
