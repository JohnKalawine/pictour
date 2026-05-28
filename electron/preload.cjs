const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pictourDesktop', {
  loadAppData: () => ipcRenderer.invoke('app-data:load'),
  authenticateUser: (input) => ipcRenderer.invoke('auth:login', input),
  changePassword: (input) => ipcRenderer.invoke('auth:change-password', input),
  getPublicGalleryInfo: () => ipcRenderer.invoke('public-gallery:info'),
  openPublicGallery: (input) => ipcRenderer.invoke('public-gallery:open-session', input),
  openPhotographerPortal: () => ipcRenderer.invoke('photographer-portal:open'),
  publishSessionToCloud: (input) => ipcRenderer.invoke('cloud:publish-session', input),
  syncCloudSales: (input) => ipcRenderer.invoke('cloud:sync-sales', input || {}),
  getCloudStorageInfo: () => ipcRenderer.invoke('cloud:storage-info'),
  validateLicenseWithServer: (input) => ipcRenderer.invoke('license:validate-server', input || {}),
  getMultiStationInfo: () => ipcRenderer.invoke('multi-station:info'),
  pullFromPrimaryStation: (input) => ipcRenderer.invoke('multi-station:pull', input || {}),
  openDataFolder: () => ipcRenderer.invoke('app-data:open-data-folder'),
  exportBackup: () => ipcRenderer.invoke('app-data:backup-export'),
  restoreBackup: () => ipcRenderer.invoke('app-data:backup-restore'),
  getDiagnostics: () => ipcRenderer.invoke('app-data:diagnostics'),
  loadDemoData: (input) => ipcRenderer.invoke('app-data:load-demo', input || {}),
  exportAuditLogsCsv: (input) => ipcRenderer.invoke('audit:export-csv', input),
  exportCashierCsv: (input) => ipcRenderer.invoke('cashier:export-csv', input),
  createCashCloseReport: (input) => ipcRenderer.invoke('cashier:close-report', input),
  exportCashHistory: (input) => ipcRenderer.invoke('cashier:export-history', input),
  openCashShift: (input) => ipcRenderer.invoke('cashier:open-shift', input),
  registerCashWithdrawal: (input) => ipcRenderer.invoke('cashier:withdrawal', input),
  closeCashShift: (input) => ipcRenderer.invoke('cashier:close-shift', input),
  listCashPrinters: () => ipcRenderer.invoke('cashier:list-printers'),
  cancelSale: (input) => ipcRenderer.invoke('sales:cancel', input),
  markSaleDelivered: (input) => ipcRenderer.invoke('sales:mark-delivered', input),
  exportSaleReceipt: (input) => ipcRenderer.invoke('sales:export-receipt', input),
  exportSalePhotos: (input) => ipcRenderer.invoke('sales:export-photos', input),
  createSaleDelivery: (input) => ipcRenderer.invoke('sales:create-delivery', input),
  openSaleDelivery: (input) => ipcRenderer.invoke('sales:open-delivery', input),
  checkForUpdates: () => ipcRenderer.invoke('app:update-check'),
  updateSettings: (input) => ipcRenderer.invoke('settings:update', input),
  createSession: (input) => ipcRenderer.invoke('sessions:create', input),
  setSessionStatus: (input) => ipcRenderer.invoke('sessions:set-status', input),
  importPhotos: (input) => ipcRenderer.invoke('photos:import-dialog', input),
  importPhotoFolder: (input) => ipcRenderer.invoke('photos:import-folder-dialog', input),
  saveCameraCapture: (input) => ipcRenderer.invoke('photos:capture-save', input),
  readPhotoDataUrl: (photoId) => ipcRenderer.invoke('photos:read-data-url', photoId),
  saveChromaRender: (input) => ipcRenderer.invoke('photos:save-chroma-render', input),
  togglePhotoSelected: (photoId) => ipcRenderer.invoke('photos:toggle-selected', photoId),
  togglePhotoFavorite: (photoId) => ipcRenderer.invoke('photos:toggle-favorite', photoId),
  setPhotoSelection: (input) => ipcRenderer.invoke('photos:set-selection', input),
  registerManualSale: (input) => ipcRenderer.invoke('sales:register-manual', input),
  exportPurchasedPhotos: (input) => ipcRenderer.invoke('photos:export-purchased', input),
  createMercadoPagoCheckout: (input) => ipcRenderer.invoke('mercado-pago:create-checkout', input),
  checkMercadoPagoCheckout: (input) => ipcRenderer.invoke('mercado-pago:check-checkout', input),
  openExternalUrl: (url) => ipcRenderer.invoke('shell:open-external-url', url),
  openCustomerDisplay: (snapshot) => ipcRenderer.invoke('customer-display:open', snapshot),
  updateCustomerDisplay: (snapshot) => ipcRenderer.invoke('customer-display:update', snapshot),
  getCustomerDisplayStatus: () => ipcRenderer.invoke('customer-display:status'),
  closeCustomerDisplay: () => ipcRenderer.invoke('customer-display:close'),
  onCustomerDisplayUpdate: (callback) => {
    const listener = (_event, snapshot) => callback(snapshot);
    ipcRenderer.on('customer-display:update', listener);
    return () => ipcRenderer.removeListener('customer-display:update', listener);
  },
  onCustomerDisplayClosed: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('customer-display:closed', listener);
    return () => ipcRenderer.removeListener('customer-display:closed', listener);
  },
  onDatabaseChanged: (callback) => {
    const listener = (_event, database) => callback(database);
    ipcRenderer.on('database:changed', listener);
    return () => ipcRenderer.removeListener('database:changed', listener);
  }
});
