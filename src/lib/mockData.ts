import type {
  CashMovement,
  CashierSale,
  CashShift,
  DeliveryAccessLog,
  OnlineCheckout,
  PackageOption,
  Photo,
  PhotoSession
} from './types';

const now = Date.now();
const isoMinutesAgo = (minutes: number) => new Date(now - minutes * 60 * 1000).toISOString();
const isoDaysAgo = (days: number) => new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
const isoDaysFromNow = (days: number) => new Date(now + days * 24 * 60 * 60 * 1000).toISOString();

export function createDemoPhotoPreview(label: string, code: string, hue: number) {
  const bg1 = `hsl(${hue}, 76%, 28%)`;
  const bg2 = `hsl(${(hue + 52) % 360}, 86%, 52%)`;
  const accent = `hsl(${(hue + 120) % 360}, 94%, 64%)`;
  const safeLabel = label.replace(/[<&>]/g, '');
  const safeCode = code.replace(/[<&>]/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
    <defs>
      <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0" stop-color="${bg1}"/>
        <stop offset="1" stop-color="${bg2}"/>
      </linearGradient>
      <radialGradient id="r" cx="70%" cy="18%" r="70%">
        <stop offset="0" stop-color="white" stop-opacity="0.22"/>
        <stop offset="1" stop-color="white" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="1280" height="720" fill="url(#g)"/>
    <rect width="1280" height="720" fill="url(#r)"/>
    <circle cx="1030" cy="145" r="110" fill="${accent}" opacity="0.28"/>
    <circle cx="101" cy="620" r="170" fill="#000" opacity="0.16"/>
    <path d="M0 560 C240 485 410 650 650 560 C870 480 1050 430 1280 505 L1280 720 L0 720 Z" fill="#03111f" opacity="0.62"/>
    <rect x="72" y="72" width="1136" height="576" rx="46" fill="#020617" opacity="0.18" stroke="white" stroke-opacity="0.22" stroke-width="2"/>
    <text x="96" y="126" fill="white" font-family="Inter, Arial, sans-serif" font-size="30" font-weight="800" opacity="0.86">PICTOUR DEMO</text>
    <text x="96" y="366" fill="white" font-family="Inter, Arial, sans-serif" font-size="68" font-weight="900">${safeLabel}</text>
    <text x="96" y="424" fill="white" font-family="Inter, Arial, sans-serif" font-size="30" font-weight="700" opacity="0.82">${safeCode} • Preview horizontal 16:9</text>
    <text x="96" y="592" fill="white" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="700" opacity="0.72">Imagem fictícia para demonstração comercial</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export const sessions: PhotoSession[] = [
  {
    id: 'sess_demo_01',
    code: 'PT-7601',
    customerName: 'Família Oliveira',
    locationName: 'Cataratas View',
    photoCount: 16,
    selectedCount: 6,
    postTourEnabled: true,
    expiresAt: isoDaysFromNow(2),
    publicSlug: 'pt-7601-familia-oliveira',
    accessCode: '7601',
    postTourUrl: 'https://galeria.pictour.app/g/pt-7601-familia-oliveira',
    localGalleryUrl: 'http://127.0.0.1:3888/g/pt-7601-familia-oliveira',
    cloudGalleryUrl: 'https://galeria.pictour.app/g/pt-7601-familia-oliveira',
    cloudPublishedAt: isoMinutesAgo(32),
    status: 'OPEN',
    createdAt: isoMinutesAgo(95)
  },
  {
    id: 'sess_demo_02',
    code: 'PT-7602',
    customerName: 'Casal Mendoza',
    locationName: 'Passeio Premium',
    photoCount: 10,
    selectedCount: 4,
    postTourEnabled: true,
    expiresAt: isoDaysFromNow(3),
    publicSlug: 'pt-7602-casal-mendoza',
    accessCode: '7602',
    postTourUrl: 'https://galeria.pictour.app/g/pt-7602-casal-mendoza',
    localGalleryUrl: 'http://127.0.0.1:3888/g/pt-7602-casal-mendoza',
    cloudGalleryUrl: 'https://galeria.pictour.app/g/pt-7602-casal-mendoza',
    cloudPublishedAt: isoMinutesAgo(74),
    status: 'OPEN',
    createdAt: isoMinutesAgo(155)
  },
  {
    id: 'sess_demo_03',
    code: 'PT-7599',
    customerName: 'Excursão Escolar Aurora',
    locationName: 'Estúdio Chroma',
    photoCount: 28,
    selectedCount: 12,
    postTourEnabled: true,
    expiresAt: isoDaysFromNow(5),
    publicSlug: 'pt-7599-excursao-aurora',
    accessCode: '7599',
    postTourUrl: 'https://galeria.pictour.app/g/pt-7599-excursao-aurora',
    localGalleryUrl: 'http://127.0.0.1:3888/g/pt-7599-excursao-aurora',
    cloudGalleryUrl: 'https://galeria.pictour.app/g/pt-7599-excursao-aurora',
    cloudPublishedAt: isoDaysAgo(1),
    status: 'SOLD',
    createdAt: isoDaysAgo(1)
  },
  {
    id: 'sess_demo_04',
    code: 'PT-7588',
    customerName: 'Grupo Argentina Tour',
    locationName: 'Cataratas View',
    photoCount: 22,
    selectedCount: 9,
    postTourEnabled: true,
    expiresAt: isoDaysFromNow(4),
    publicSlug: 'pt-7588-argentina-tour',
    accessCode: '7588',
    postTourUrl: 'https://galeria.pictour.app/g/pt-7588-argentina-tour',
    status: 'SOLD',
    createdAt: isoDaysAgo(3)
  }
];

const photoDefinitions: Array<[string, string, string, Photo['status'], boolean, number, Photo['kind']]> = [
  ['PT-7601', 'F01', 'Família no mirante', 'READY', true, 204, 'UPLOAD'],
  ['PT-7601', 'F02', 'Cataratas panorâmica', 'READY', true, 218, 'UPLOAD'],
  ['PT-7601', 'F03', 'Chroma aventura', 'SELECTED', true, 236, 'CHROMA'],
  ['PT-7601', 'F04', 'Foto espontânea', 'READY', false, 258, 'UPLOAD'],
  ['PT-7601', 'F05', 'Close premium', 'SELECTED', true, 282, 'UPLOAD'],
  ['PT-7601', 'F06', 'Souvenir digital', 'READY', false, 304, 'CHROMA'],
  ['PT-7601', 'F07', 'Família completa', 'READY', false, 322, 'UPLOAD'],
  ['PT-7601', 'F08', 'Pôr do sol', 'SELECTED', true, 338, 'UPLOAD'],
  ['PT-7602', 'F01', 'Casal no portal', 'READY', true, 18, 'UPLOAD'],
  ['PT-7602', 'F02', 'Noite premium', 'SELECTED', true, 36, 'CHROMA'],
  ['PT-7602', 'F03', 'Foto romântica', 'READY', false, 54, 'UPLOAD'],
  ['PT-7602', 'F04', 'Cenário luzes', 'SELECTED', true, 72, 'CHROMA'],
  ['PT-7602', 'F05', 'Cartão postal', 'READY', false, 92, 'UPLOAD'],
  ['PT-7599', 'F01', 'Grupo completo', 'PURCHASED', true, 126, 'UPLOAD'],
  ['PT-7599', 'F02', 'Chroma escolar', 'PURCHASED', true, 144, 'CHROMA'],
  ['PT-7599', 'F03', 'Professores', 'PURCHASED', true, 162, 'UPLOAD'],
  ['PT-7599', 'F04', 'Turma premium', 'PURCHASED', true, 180, 'CHROMA'],
  ['PT-7599', 'F05', 'Foto extra', 'READY', false, 198, 'UPLOAD'],
  ['PT-7588', 'F01', 'Grupo Argentina', 'PURCHASED', true, 308, 'UPLOAD'],
  ['PT-7588', 'F02', 'Cataratas wide', 'PURCHASED', true, 328, 'UPLOAD'],
  ['PT-7588', 'F03', 'Chroma selva', 'PURCHASED', true, 348, 'CHROMA']
];

export const photos: Photo[] = photoDefinitions.map(([sessionCode, code, label, status, selected, hue, kind], index) => ({
  id: `photo_demo_${index + 1}`,
  code,
  label,
  sessionCode,
  status,
  kind,
  backgroundName: kind === 'CHROMA' ? 'Inspector profissional' : undefined,
  selected,
  originalFileName: `${sessionCode}-${code}.jpg`,
  importedAt: isoMinutesAgo(150 - index * 4),
  favorite: selected,
  previewUrl: createDemoPhotoPreview(label, `${sessionCode} • ${code}`, hue),
  cloudStatus: index % 4 === 0 ? 'PENDING' : 'SYNCED',
  cloudSyncedAt: index % 4 === 0 ? undefined : isoMinutesAgo(80 - index)
}));

export const packages: PackageOption[] = [
  { id: 'pkg_digital_01', name: '1 Foto Digital', locationName: 'Cataratas View', photoQuantity: 1, includesAllPhotos: false, priceCents: 3900, currency: 'BRL', pricingMode: 'PER_PHOTO', active: true },
  { id: 'pkg_impresso_digital', name: '1 Foto Impressa + Digital', locationName: 'Cataratas View', photoQuantity: 1, includesAllPhotos: false, priceCents: 5900, currency: 'BRL', pricingMode: 'PER_PHOTO', active: true },
  { id: 'pkg_porta_retrato', name: 'Porta-retrato premium', locationName: 'Cataratas View', photoQuantity: 1, includesAllPhotos: false, priceCents: 8900, currency: 'BRL', pricingMode: 'PER_PHOTO', active: true },
  { id: 'pkg_todas', name: 'Todas digitais da sessão', locationName: 'Cataratas View', photoQuantity: null, includesAllPhotos: true, priceCents: 14990, currency: 'BRL', pricingMode: 'FIXED', active: true },
  { id: 'pkg_online_3', name: 'Galeria Online • 3 digitais', locationName: 'Passeio Premium', photoQuantity: 3, includesAllPhotos: false, priceCents: 8990, currency: 'BRL', pricingMode: 'PER_PHOTO', active: true }
];

export const cashierSales: CashierSale[] = [
  {
    id: 'sale_demo_01', code: 'V-2201', sessionCode: 'PT-7599', sellerName: 'Marina', method: 'MANUAL_PIX', currency: 'BRL', amountCents: 20800, amountBaseCents: 20800,
    createdAt: isoMinutesAgo(35), channel: 'DESK', packageName: 'Checkout modular presencial', photoIds: ['photo_demo_14', 'photo_demo_15', 'photo_demo_16'], cashShiftId: 'shift_demo_today', saleStatus: 'ACTIVE', deliveryStatus: 'DELIVERED', deliveredAt: isoMinutesAgo(16), deliveryDownloadCount: 3,
    saleLineItems: [
      { id: 'line_demo_1', packageId: 'pkg_impresso_digital', packageName: '1 Foto Impressa + Digital', photoId: 'photo_demo_14', photoCode: 'F01', priceCents: 5900, currency: 'BRL' },
      { id: 'line_demo_2', packageId: 'pkg_digital_01', packageName: '1 Foto Digital', photoId: 'photo_demo_15', photoCode: 'F02', priceCents: 3900, currency: 'BRL' },
      { id: 'line_demo_3', packageId: 'pkg_porta_retrato', packageName: 'Porta-retrato premium', photoId: 'photo_demo_16', photoCode: 'F03', priceCents: 8900, currency: 'BRL' }
    ]
  },
  {
    id: 'sale_demo_02', code: 'V-2202', sessionCode: 'PT-7588', sellerName: 'João', method: 'CREDIT_CARD_ONLINE', currency: 'BRL', amountCents: 14990, amountBaseCents: 14990,
    createdAt: isoMinutesAgo(88), channel: 'POST_TOUR', onlineCheckoutId: 'chk_demo_01', packageName: 'Todas digitais da sessão', photoIds: ['photo_demo_19', 'photo_demo_20', 'photo_demo_21'], cashShiftId: 'shift_demo_today', saleStatus: 'ACTIVE', deliveryStatus: 'DELIVERED', deliveredAt: isoMinutesAgo(70), deliveryDownloadCount: 1
  },
  {
    id: 'sale_demo_03', code: 'V-2198', sessionCode: 'PT-7599', sellerName: 'Marina', method: 'CASH', currency: 'BRL', amountCents: 5900, amountBaseCents: 5900,
    createdAt: isoDaysAgo(1), channel: 'DESK', packageName: '1 Foto Impressa + Digital', photoIds: ['photo_demo_17'], cashShiftId: 'shift_demo_yesterday', saleStatus: 'ACTIVE', deliveryStatus: 'PENDING'
  },
  {
    id: 'sale_demo_04', code: 'V-2193', sessionCode: 'PT-7588', sellerName: 'Camila', method: 'EXTERNAL_CARD_MACHINE', currency: 'BRL', amountCents: 8990, amountBaseCents: 8990,
    createdAt: isoDaysAgo(3), channel: 'DESK', packageName: 'Galeria Online • 3 digitais', photoIds: ['photo_demo_19', 'photo_demo_20'], cashShiftId: 'shift_demo_old', saleStatus: 'ACTIVE', deliveryStatus: 'DELIVERED', deliveredAt: isoDaysAgo(3), deliveryDownloadCount: 2
  }
];

export const cashShifts: CashShift[] = [
  { id: 'shift_demo_today', code: 'CX-220', status: 'OPEN', openedAt: isoMinutesAgo(180), openedBy: 'Marina', openingAmountCents: 30000, openingChangeFundCents: 30000, recommendedChangeFundCents: 30000, cashRegisterName: 'Caixa 01', note: 'Abertura demo comercial' },
  { id: 'shift_demo_yesterday', code: 'CX-219', status: 'CLOSED', openedAt: isoDaysAgo(1), openedBy: 'João', openingAmountCents: 30000, openingChangeFundCents: 30000, recommendedChangeFundCents: 30000, closedAt: isoDaysAgo(1), closedBy: 'João', closingAmountCents: 35900, expectedAmountCents: 35900, differenceCents: 0, cashRegisterName: 'Caixa 01', shiftChangeOnClose: true },
  { id: 'shift_demo_old', code: 'CX-214', status: 'CLOSED', openedAt: isoDaysAgo(3), openedBy: 'Camila', openingAmountCents: 30000, closedAt: isoDaysAgo(3), closedBy: 'Camila', closingAmountCents: 38990, expectedAmountCents: 38990, differenceCents: 0, cashRegisterName: 'Caixa 02' }
];

export const cashMovements: CashMovement[] = [
  { id: 'mov_demo_01', shiftId: 'shift_demo_today', type: 'OPENING', amountCents: 30000, createdAt: isoMinutesAgo(180), operatorName: 'Marina', note: 'Fundo de troco inicial' },
  { id: 'mov_demo_02', shiftId: 'shift_demo_today', type: 'WITHDRAWAL', amountCents: 10000, createdAt: isoMinutesAgo(55), operatorName: 'Marina', note: 'Sangria parcial demo' },
  { id: 'mov_demo_03', shiftId: 'shift_demo_yesterday', type: 'OPENING', amountCents: 30000, createdAt: isoDaysAgo(1), operatorName: 'João', note: 'Abertura turno tarde' },
  { id: 'mov_demo_04', shiftId: 'shift_demo_yesterday', type: 'CLOSE', amountCents: 35900, createdAt: isoDaysAgo(1), operatorName: 'João', note: 'Fechamento com troca de turno' }
];

export const onlineCheckouts: OnlineCheckout[] = [
  { id: 'chk_demo_01', gateway: 'MERCADO_PAGO', environment: 'production', sessionCode: 'PT-7588', photoIds: ['photo_demo_19', 'photo_demo_20', 'photo_demo_21'], packageName: 'Todas digitais da sessão', amountCents: 14990, currency: 'BRL', buyerEmail: 'cliente.demo@email.com', preferenceId: 'pref-demo-001', externalReference: 'PT-7588-demo', checkoutUrl: 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=demo', status: 'APPROVED', gatewayStatus: 'approved', gatewayPaymentId: 'pay-demo-001', createdAt: isoMinutesAgo(105), paidAt: isoMinutesAgo(90), deliveryUrl: 'http://127.0.0.1:3888/d/demo' },
  { id: 'chk_demo_02', gateway: 'MERCADO_PAGO', environment: 'production', sessionCode: 'PT-7601', photoIds: ['photo_demo_1', 'photo_demo_3'], packageName: 'Galeria Online • 2 digitais', amountCents: 7800, currency: 'BRL', buyerEmail: 'familia.oliveira@email.com', preferenceId: 'pref-demo-002', externalReference: 'PT-7601-pendente', status: 'PENDING', gatewayStatus: 'pending', createdAt: isoMinutesAgo(22) }
];

export const deliveryAccessLogs: DeliveryAccessLog[] = [
  { id: 'delog_demo_01', saleId: 'sale_demo_01', saleCode: 'V-2201', sessionCode: 'PT-7599', action: 'VIEW', createdAt: isoMinutesAgo(20), ipAddress: '192.168.0.30' },
  { id: 'delog_demo_02', saleId: 'sale_demo_01', saleCode: 'V-2201', sessionCode: 'PT-7599', action: 'DOWNLOAD_ALL', createdAt: isoMinutesAgo(16), ipAddress: '192.168.0.30' },
  { id: 'delog_demo_03', saleId: 'sale_demo_02', saleCode: 'V-2202', sessionCode: 'PT-7588', action: 'DOWNLOAD_PHOTO', photoId: 'photo_demo_19', createdAt: isoMinutesAgo(70), ipAddress: '177.44.0.10' }
];

export const backgrounds = ['Cataratas cinematic', 'Selva premium', 'Barco pôr do sol', 'Inspector profissional'];
