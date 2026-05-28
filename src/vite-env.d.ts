/// <reference types="vite/client" />

import type {
  CreateSessionInput,
  ImportPhotosInput,
  ImportPhotosResult,
  ExportPurchasedPhotosInput,
  ExportPurchasedPhotosResult,
  LocalDatabase,
  PublicGalleryInfo,
  OpenPhotographerPortalResult,
  RegisterManualSaleInput,
  SaveCameraCaptureInput,
  SaveCameraCaptureResult,
  ReadPhotoDataUrlResult,
  SaveChromaRenderInput,
  SaveChromaRenderResult,
  SetPhotoSelectionInput,
  UpdateSettingsInput,
  CreateMercadoPagoCheckoutInput,
  CreateMercadoPagoCheckoutResult,
  CheckMercadoPagoCheckoutInput,
  CheckMercadoPagoCheckoutResult,
  CloudPublishSessionInput,
  CloudPublishSessionResult,
  CloudSyncSalesInput,
  CloudSyncSalesResult, CloudStorageInfo,
  LoginInput,
  LoginResult,
  ChangePasswordInput,
  ChangePasswordResult,
  BackupResult,
  CashierExportResult,
  SystemDiagnostics,
  CashierSale,
  OpenCashShiftInput,
  CashWithdrawalInput,
  CloseCashShiftInput,
  CancelSaleInput,
  CashOperationResult,
  AuditLog,
  ExportAuditLogsInput,
  ExportAuditLogsResult,
  LicenseValidationInput,
  LicenseValidationResult,
  SetSessionStatusInput,
  MarkSaleDeliveredInput,
  SaleReceiptInput,
  SaleReceiptResult,
  AppUpdateInfo,
  CreateSaleDeliveryInput,
  CreateSaleDeliveryResult,
  MultiStationInfo,
  MultiStationSyncResult,
  DemoDataResult
} from './lib/types';

declare global {
  type CustomerDisplaySnapshot = {
    companyName: string;
    sessionCode: string;
    packageName: string;
    selectedCount: number;
    totalCents: number;
    currency: string;
    customerMessage: string;
    photoCode?: string;
    photoLabel?: string;
    photoPreviewUrl?: string;
    displayMode?: 'SINGLE' | 'TRIPLE' | 'GRID';
    photos?: Array<{ id: string; code?: string; label?: string; previewUrl?: string; selected?: boolean; status?: string }>;
    focusedPhotoId?: string;
    watermarkText: string;
    qrLabel: string;
  };

  interface Window {
    pictourDesktop?: {
      loadAppData: () => Promise<LocalDatabase>;
      authenticateUser: (input: LoginInput) => Promise<LoginResult>;
      changePassword: (input: ChangePasswordInput) => Promise<ChangePasswordResult>;
      getPublicGalleryInfo: () => Promise<PublicGalleryInfo>;
      openPublicGallery: (input: { sessionCode: string }) => Promise<{ opened: boolean; url: string }>;
      openPhotographerPortal: () => Promise<OpenPhotographerPortalResult>;
      publishSessionToCloud: (input: CloudPublishSessionInput) => Promise<CloudPublishSessionResult>;
      syncCloudSales: (input?: CloudSyncSalesInput) => Promise<CloudSyncSalesResult>;
      getCloudStorageInfo: () => Promise<CloudStorageInfo>;
      validateLicenseWithServer: (input?: LicenseValidationInput) => Promise<LicenseValidationResult>;
      getMultiStationInfo: () => Promise<MultiStationInfo>;
      pullFromPrimaryStation: (input?: { actorUsername?: string }) => Promise<MultiStationSyncResult>;
      openDataFolder: () => Promise<{ opened: boolean; path: string }>;
      exportBackup: () => Promise<BackupResult>;
      restoreBackup: () => Promise<BackupResult>;
      getDiagnostics: () => Promise<SystemDiagnostics>;
      loadDemoData: (input?: { actorUsername?: string }) => Promise<DemoDataResult>;
      exportAuditLogsCsv: (input: ExportAuditLogsInput) => Promise<ExportAuditLogsResult>;
      exportCashierCsv: (input: { sales: CashierSale[]; operator?: string; actorUsername?: string }) => Promise<CashierExportResult>;
      createCashCloseReport: (input: { sales: CashierSale[]; operator?: string; filters?: Record<string, string> }) => Promise<CashierExportResult>;
      exportCashHistory: (input: { format: 'TXT' | 'CSV'; days?: number; operator?: string; actorUsername?: string }) => Promise<CashierExportResult>;
      openCashShift: (input: OpenCashShiftInput) => Promise<CashOperationResult>;
      registerCashWithdrawal: (input: CashWithdrawalInput) => Promise<CashOperationResult>;
      closeCashShift: (input: CloseCashShiftInput) => Promise<CashOperationResult>;
      listCashPrinters: () => Promise<Array<{ name: string; displayName?: string; status?: string }>>;
      cancelSale: (input: CancelSaleInput) => Promise<CashOperationResult>;
      markSaleDelivered: (input: MarkSaleDeliveredInput) => Promise<LocalDatabase>;
      exportSaleReceipt: (input: SaleReceiptInput) => Promise<SaleReceiptResult>;
      exportSalePhotos: (input: SaleReceiptInput) => Promise<SaleReceiptResult>;
      createSaleDelivery: (input: CreateSaleDeliveryInput) => Promise<CreateSaleDeliveryResult>;
      openSaleDelivery: (input: { saleId: string }) => Promise<{ ok: boolean; url?: string; message: string }>;
      checkForUpdates: () => Promise<AppUpdateInfo>;
      updateSettings: (input: UpdateSettingsInput) => Promise<LocalDatabase>;
      createSession: (input: CreateSessionInput) => Promise<LocalDatabase>;
      setSessionStatus: (input: SetSessionStatusInput) => Promise<LocalDatabase>;
      importPhotos: (input: ImportPhotosInput) => Promise<ImportPhotosResult>;
      importPhotoFolder: (input: ImportPhotosInput) => Promise<ImportPhotosResult>;
      saveCameraCapture: (input: SaveCameraCaptureInput) => Promise<SaveCameraCaptureResult>;
      readPhotoDataUrl: (photoId: string) => Promise<ReadPhotoDataUrlResult>;
      saveChromaRender: (input: SaveChromaRenderInput) => Promise<SaveChromaRenderResult>;
      togglePhotoSelected: (photoId: string) => Promise<LocalDatabase>;
      togglePhotoFavorite: (photoId: string) => Promise<LocalDatabase>;
      setPhotoSelection: (input: SetPhotoSelectionInput) => Promise<LocalDatabase>;
      registerManualSale: (input: RegisterManualSaleInput) => Promise<LocalDatabase>;
      exportPurchasedPhotos: (input: ExportPurchasedPhotosInput) => Promise<ExportPurchasedPhotosResult>;
      createMercadoPagoCheckout: (input: CreateMercadoPagoCheckoutInput) => Promise<CreateMercadoPagoCheckoutResult>;
      checkMercadoPagoCheckout: (input: CheckMercadoPagoCheckoutInput) => Promise<CheckMercadoPagoCheckoutResult>;
      openExternalUrl: (url: string) => Promise<{ opened: boolean }>;
      openCustomerDisplay: (snapshot: CustomerDisplaySnapshot) => Promise<{ opened: boolean; reused?: boolean }>;
      updateCustomerDisplay: (snapshot: CustomerDisplaySnapshot) => Promise<{ updated: boolean }>;
      getCustomerDisplayStatus: () => Promise<{ open: boolean }>;
      closeCustomerDisplay: () => Promise<{ closed: boolean }>;
      onCustomerDisplayUpdate: (callback: (snapshot: CustomerDisplaySnapshot) => void) => () => void;
      onCustomerDisplayClosed: (callback: () => void) => () => void;
      onDatabaseChanged: (callback: (database: LocalDatabase) => void) => () => void;
    };
  }
}

export {};
