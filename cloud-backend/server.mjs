import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const API_KEY = process.env.PICTOUR_CLOUD_API_KEY || 'pictour_dev_secret';
const LICENSE_ADMIN_TOKEN = process.env.PICTOUR_LICENSE_ADMIN_TOKEN || process.env.LICENSE_ADMIN_TOKEN || 'pictour_admin_secret';
const DATABASE_DRIVER = String(process.env.DATABASE_DRIVER || 'json').toLowerCase(); // json | postgres
const DATABASE_URL = process.env.DATABASE_URL || '';
const MP_ACCESS_TOKEN = process.env.MERCADO_PAGO_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN || '';
const MP_PUBLIC_BASE_URL = process.env.MERCADO_PAGO_PUBLIC_BASE_URL || '';
const MP_WEBHOOK_TOKEN = process.env.PICTOUR_MP_WEBHOOK_TOKEN || process.env.MERCADO_PAGO_WEBHOOK_TOKEN || '';
const ALLOW_SIMULATED_PURCHASES = String(process.env.PICTOUR_ALLOW_SIMULATED_PURCHASES || '').toLowerCase() === 'true';
const CLOUD_PHOTO_PRICE_CENTS = Number(process.env.CLOUD_PHOTO_PRICE_CENTS || 4000);
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || `http://127.0.0.1:${PORT}`).replace(/\/$/, '');
const PICTOUR_LATEST_VERSION = process.env.PICTOUR_LATEST_VERSION || '4.6.3';
const PICTOUR_DOWNLOAD_URL = process.env.PICTOUR_DOWNLOAD_URL || '';
const PICTOUR_RELEASE_NOTES = (process.env.PICTOUR_RELEASE_NOTES || 'Assinaturas e planos comerciais|Ciclo mensal/anual e MRR|Renovação, atraso e suspensão por cobrança|Monitor do cliente em grid').split('|').filter(Boolean);
const DB_PATH = path.join(__dirname, 'data', 'pictour-cloud-db.json');
const LOCAL_STORAGE_DIR = process.env.LOCAL_STORAGE_DIR || path.join(__dirname, 'data', 'storage');
const STORAGE_DRIVER = String(process.env.STORAGE_DRIVER || 'local').toLowerCase(); // local | s3 | r2
const S3_BUCKET = process.env.S3_BUCKET || process.env.R2_BUCKET || '';
const S3_REGION = process.env.S3_REGION || process.env.AWS_REGION || 'auto';
const S3_ENDPOINT = process.env.S3_ENDPOINT || process.env.R2_ENDPOINT || '';
const S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID || '';
const S3_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || process.env.R2_SECRET_ACCESS_KEY || '';
const STORAGE_SIGNING_SECRET = process.env.PICTOUR_STORAGE_SIGNING_SECRET || process.env.STORAGE_SIGNING_SECRET || API_KEY || 'pictour_storage_dev_secret';
const STORAGE_SIGNED_TTL_SECONDS = Math.max(60, Number(process.env.PICTOUR_STORAGE_SIGNED_TTL_SECONDS || process.env.STORAGE_SIGNED_TTL_SECONDS || 900));
const STORAGE_PUBLIC_BASE_URL = (process.env.STORAGE_PUBLIC_BASE_URL || '').replace(/\/$/, '');

let cachedS3Client = null;
let cachedS3Sdk = null;
let cachedPgPool = null;

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readDb() {
  ensureDir(path.dirname(DB_PATH));
  if (!fs.existsSync(DB_PATH)) {
    const seed = { version: 8, subscriptions: [], sessions: [], sales: [], checkouts: [], webhookEvents: [], companies: [], licenses: [], licenseEvents: [], storage: { driver: STORAGE_DRIVER }, database: { driver: DATABASE_DRIVER } };
    fs.writeFileSync(DB_PATH, JSON.stringify(seed, null, 2));
    return seed;
  }
  const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  db.version = Math.max(Number(db.version || 1), 8);
  db.sessions ||= [];
  db.sales ||= [];
  db.checkouts ||= [];
  db.webhookEvents ||= [];
  db.companies ||= [];
  db.licenses ||= [];
  db.licenseEvents ||= [];
  db.devices ||= [];
  db.subscriptions ||= [];
  db.storage ||= { driver: STORAGE_DRIVER };
  db.database ||= { driver: DATABASE_DRIVER };
  return db;
}

function writeDb(db) {
  ensureDir(path.dirname(DB_PATH));
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

async function getPgPool() {
  if (DATABASE_DRIVER !== 'postgres') return null;
  if (!DATABASE_URL) throw new Error('DATABASE_URL não configurada para PostgreSQL.');
  if (cachedPgPool) return cachedPgPool;
  const pg = await import('pg');
  cachedPgPool = new pg.Pool({ connectionString: DATABASE_URL, ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined });
  await cachedPgPool.query(`
    create table if not exists pictour_cloud_state (
      id text primary key,
      payload jsonb not null,
      updated_at timestamptz not null default now()
    )
  `);
  return cachedPgPool;
}

async function readCloudState() {
  if (DATABASE_DRIVER !== 'postgres') return readDb();
  const pool = await getPgPool();
  const result = await pool.query('select payload from pictour_cloud_state where id = $1', ['main']);
  if (!result.rows.length) {
    const seed = { version: 8, subscriptions: [], sessions: [], sales: [], checkouts: [], webhookEvents: [], companies: [], licenses: [], licenseEvents: [], storage: { driver: STORAGE_DRIVER }, database: { driver: 'postgres' } };
    await writeCloudState(seed);
    return seed;
  }
  const db = result.rows[0].payload || {};
  db.version = Math.max(Number(db.version || 1), 8);
  db.sessions ||= [];
  db.sales ||= [];
  db.checkouts ||= [];
  db.webhookEvents ||= [];
  db.companies ||= [];
  db.licenses ||= [];
  db.licenseEvents ||= [];
  db.devices ||= [];
  db.subscriptions ||= [];
  db.storage ||= { driver: STORAGE_DRIVER };
  db.database = { driver: 'postgres' };
  return db;
}

async function writeCloudState(db) {
  if (DATABASE_DRIVER !== 'postgres') {
    writeDb(db);
    return;
  }
  const pool = await getPgPool();
  await pool.query(
    `insert into pictour_cloud_state (id, payload, updated_at)
     values ($1, $2, now())
     on conflict (id) do update set payload = excluded.payload, updated_at = now()`,
    ['main', db]
  );
}

function json(res, status, payload) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type, authorization, x-pictour-api-key, x-pictour-admin-token'
  });
  res.end(JSON.stringify(payload));
}

function html(res, status, body) {
  res.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  });
  res.end(body);
}

function text(res, status, body) {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 80_000_000) {
        reject(new Error('Payload grande demais para uma única foto. Publique uma foto por requisição.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { reject(new Error('JSON inválido.')); }
    });
    req.on('error', reject);
  });
}

function authOk(req) {
  const header = req.headers.authorization || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
  const key = req.headers['x-pictour-api-key'];
  return !API_KEY || bearer === API_KEY || key === API_KEY;
}


function licenseAdminOk(req, url) {
  const header = req.headers.authorization || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
  const key = req.headers['x-pictour-admin-token'] || req.headers['x-pictour-api-key'] || url?.searchParams?.get('token') || '';
  return Boolean((LICENSE_ADMIN_TOKEN && (key === LICENSE_ADMIN_TOKEN || bearer === LICENSE_ADMIN_TOKEN)) || authOk(req));
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

function makeLicenseKey(plan = 'PRO') {
  const token = crypto.randomBytes(9).toString('base64url').toUpperCase();
  return `PIC-${plan}-${token}`;
}

function dateOnlyPlusDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function computeEffectiveLicenseStatus(license = {}) {
  if (license.status === 'SUSPENDED') return 'SUSPENDED';
  if (license.expiresAt) {
    const end = new Date(`${license.expiresAt}T23:59:59`);
    if (!Number.isNaN(end.getTime()) && end.getTime() < Date.now()) return 'EXPIRED';
  }
  if (license.status === 'TRIAL') return 'TRIAL';
  if (license.status === 'OFFLINE_GRACE') return 'OFFLINE_GRACE';
  return 'ACTIVE';
}

function sanitizeLicenseForDesktop(license = {}) {
  const limits = licensePlanLimits(license.plan || 'PRO');
  const effectiveStatus = computeEffectiveLicenseStatus(license);
  return {
    serverLicenseId: license.id || '',
    companyId: license.companyId || '',
    licenseKey: license.licenseKey || '',
    plan: license.plan || 'PRO',
    status: effectiveStatus,
    activatedAt: license.activatedAt || license.createdAt || new Date().toISOString(),
    expiresAt: license.expiresAt || '',
    lastValidatedAt: new Date().toISOString(),
    lastCheckInAt: license.lastCheckIn?.at || license.lastValidatedAt || '',
    lastCheckInMessage: license.lastCheckIn ? `Último check-in ${license.lastCheckIn.kind || 'MANUAL'} em ${license.lastCheckIn.at}.` : '',
    offlineGraceDays: Math.max(0, Number(license.offlineGraceDays ?? 7)),
    maxUsers: Math.max(1, Number(license.maxUsers || limits.maxUsers)),
    maxLocations: Math.max(1, Number(license.maxLocations || limits.maxLocations)),
    monthlyPhotoLimit: Math.max(1, Number(license.monthlyPhotoLimit || limits.monthlyPhotoLimit)),
    features: { ...limits.features, ...(license.features || {}) },
    notes: license.notes || 'Licença validada pelo servidor PicTour.',
    lastValidationMessage: `Servidor PicTour: licença ${effectiveStatus.toLowerCase()} no plano ${license.plan || 'PRO'}.`
  };
}

function requireLicenseAdmin(req, res, url) {
  if (!licenseAdminOk(req, url)) {
    json(res, 401, { ok: false, message: 'Token administrativo inválido para licenças.' });
    return false;
  }
  return true;
}

function htmlEscape(value = '') {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function daysUntilDateOnly(dateValue) {
  if (!dateValue) return null;
  const date = new Date(`${String(dateValue).slice(0, 10)}T23:59:59`);
  if (Number.isNaN(date.getTime())) return null;
  return Math.ceil((date.getTime() - Date.now()) / 86400000);
}

function compareVersions(a = '0.0.0', b = '0.0.0') {
  const pa = String(a).split('.').map((part) => Number(part.replace(/\D/g, '') || 0));
  const pb = String(b).split('.').map((part) => Number(part.replace(/\D/g, '') || 0));
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff) return diff;
  }
  return 0;
}

function buildLicenseAdminView(db) {
  const companies = db.companies || [];
  const licenses = db.licenses || [];
  const rows = licenses.map((license) => {
    const company = companies.find((item) => item.id === license.companyId) || {};
    const status = computeEffectiveLicenseStatus(license);
    const usage = license.usage || {};
    const checkIn = license.lastCheckIn || {};
    const daysLeft = daysUntilDateOnly(license.expiresAt);
    const limits = licensePlanLimits(license.plan);
    const maxUsers = Number(license.maxUsers || limits.maxUsers);
    const maxLocations = Number(license.maxLocations || limits.maxLocations);
    const monthlyPhotoLimit = Number(license.monthlyPhotoLimit || limits.monthlyPhotoLimit);
    const photosThisMonth = Number(usage.photosThisMonth || 0);
    const users = Number(usage.activeUsers || 0);
    const locations = Number(usage.activeLocations || 0);
    const alerts = [];
    if (status === 'SUSPENDED' || status === 'EXPIRED') alerts.push(status === 'SUSPENDED' ? 'Suspensa' : 'Expirada');
    if (daysLeft !== null && daysLeft >= 0 && daysLeft <= 7) alerts.push(`Vence em ${daysLeft}d`);
    if (checkIn.at && Date.now() - new Date(checkIn.at).getTime() > 7 * 86400000) alerts.push('Sem check-in +7d');
    if (!checkIn.at) alerts.push('Sem check-in');
    if (compareVersions(PICTOUR_LATEST_VERSION, checkIn.appVersion || '0.0.0') > 0) alerts.push('Versão antiga');
    if (monthlyPhotoLimit && photosThisMonth >= monthlyPhotoLimit * 0.85) alerts.push('Fotos 85%+');
    if (users > maxUsers) alerts.push('Usuários excedidos');
    if (locations > maxLocations) alerts.push('Locais excedidos');
    return { company, license, status, usage, checkIn, daysLeft, alerts, maxUsers, maxLocations, monthlyPhotoLimit };
  });
  return { companies, licenses, rows };
}

function formatCurrencyCents(cents = 0) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(cents || 0) / 100);
}

function planMonthlyPriceCents(plan = 'PRO') {
  const prices = {
    STARTER: Number(process.env.PICTOUR_PLAN_STARTER_CENTS || 9900),
    PRO: Number(process.env.PICTOUR_PLAN_PRO_CENTS || 24900),
    ENTERPRISE: Number(process.env.PICTOUR_PLAN_ENTERPRISE_CENTS || 69900)
  };
  return prices[plan] || prices.PRO;
}


function planPriceCents(plan = 'PRO', cycle = 'MONTHLY') {
  const monthly = plan === 'STARTER' ? 9900 : plan === 'ENTERPRISE' ? 99900 : 29900;
  return cycle === 'YEARLY' ? monthly * 10 : monthly;
}

function buildSubscriptionSummary(db) {
  const subscriptions = db.subscriptions || [];
  const active = subscriptions.filter((item) => item.status === 'ACTIVE' || item.status === 'TRIAL');
  const pastDue = subscriptions.filter((item) => item.status === 'PAST_DUE');
  const mrrCents = active.reduce((sum, item) => sum + (item.billingCycle === 'YEARLY' ? Math.round(Number(item.priceCents || planPriceCents(item.plan, 'YEARLY')) / 12) : Number(item.priceCents || planPriceCents(item.plan, 'MONTHLY'))), 0);
  return { total: subscriptions.length, active: active.length, pastDue: pastDue.length, mrrCents };
}

function buildAdminDashboardSummary(db) {
  const view = buildLicenseAdminView(db);
  const activeRows = view.rows.filter((row) => row.status === 'ACTIVE' || row.status === 'TRIAL' || row.status === 'OFFLINE_GRACE');
  const suspendedRows = view.rows.filter((row) => row.status === 'SUSPENDED' || row.status === 'EXPIRED');
  const mrrCents = activeRows.reduce((sum, row) => sum + planMonthlyPriceCents(row.license.plan), 0);
  const photosThisMonth = view.rows.reduce((sum, row) => sum + Number(row.usage.photosThisMonth || 0), 0);
  const salesThisMonth = view.rows.reduce((sum, row) => sum + Number(row.usage.salesThisMonth || 0), 0);
  const activeDevices = (db.devices || []).filter((device) => device.status !== 'BLOCKED').length;
  const outdated = view.rows.filter((row) => compareVersions(PICTOUR_LATEST_VERSION, row.checkIn.appVersion || '0.0.0') > 0).length;
  return {
    ...view,
    kpis: {
      companies: view.companies.length,
      licenses: view.licenses.length,
      activeOrTrial: activeRows.length,
      suspendedOrExpired: suspendedRows.length,
      alerts: view.rows.filter((row) => row.alerts.length).length,
      mrrCents,
      photosThisMonth,
      salesThisMonth,
      activeDevices,
      outdated
    }
  };
}

function adminStatusPill(status) {
  return `<span class="pill ${String(status || '').toLowerCase()}">${htmlEscape(status || '-')}</span>`;
}

function licenseAdminHtml(db, token = '') {
  const dashboard = buildAdminDashboardSummary(db);
  const { companies, rows, kpis } = dashboard;
  const devices = db.devices || [];
  const checkouts = db.checkouts || [];
  const sales = db.sales || [];
  const publicSessions = db.sessions || [];
  const tableRows = rows.map((row) => {
    const { company, license, status, usage, checkIn, alerts } = row;
    const devicesForCompany = devices.filter((device) => device.companyId === license.companyId);
    const checkoutCount = checkouts.filter((checkout) => checkout.companyId === license.companyId || checkout.companyId === company.id).length;
    const saleCount = sales.filter((sale) => sale.companyId === license.companyId || sale.companyId === company.id).length;
    const companyName = htmlEscape(company.name || '-');
    const companyId = htmlEscape(license.companyId || '');
    return `<tr class="${alerts.length ? 'warnRow' : ''}" data-company="${companyId}" data-plan="${htmlEscape(license.plan)}" data-status="${htmlEscape(status)}">
      <td><strong>${companyName}</strong><small>${companyId}</small><small>${htmlEscape(company.status || 'ACTIVE')}</small></td>
      <td><code>${htmlEscape(license.licenseKey)}</code><small>${htmlEscape(license.id || '')}</small></td>
      <td><span class="pill plan">${htmlEscape(license.plan)}</span><small>${formatCurrencyCents(planMonthlyPriceCents(license.plan))}/mês estimado</small></td>
      <td>${adminStatusPill(status)}<small>${htmlEscape(license.billingStatus || 'billing local')}</small></td>
      <td>${htmlEscape(license.expiresAt || '-')}<small>${row.daysLeft === null ? '' : row.daysLeft >= 0 ? `${row.daysLeft}d restantes` : `vencida há ${Math.abs(row.daysLeft)}d`}</small></td>
      <td>${Number(usage.activeUsers || 0)}/${row.maxUsers} usuários<br/>${Number(usage.activeLocations || 0)}/${row.maxLocations} locais<br/>${Number(usage.photosThisMonth || 0)}/${row.monthlyPhotoLimit} fotos/mês<br/>${Number(usage.salesThisMonth || 0)} vendas/mês</td>
      <td>${checkIn.at ? new Date(checkIn.at).toLocaleString('pt-BR') : '-'}<small>${htmlEscape(checkIn.deviceName || '')} • v${htmlEscape(checkIn.appVersion || '-')}</small><small>${devicesForCompany.length} dispositivo(s) • ${checkoutCount} checkout(s) • ${saleCount} venda(s)</small></td>
      <td>${alerts.length ? alerts.map((alert) => `<span class="alert">${htmlEscape(alert)}</span>`).join('') : '<span class="okText">OK</span>'}</td>
      <td class="rowActions">
        <button class="tiny" onclick="fillLicense('${companyName}','${companyId}','${htmlEscape(license.licenseKey || '')}','${htmlEscape(license.plan || 'PRO')}','ACTIVE','${htmlEscape(license.expiresAt || '')}',${Number(license.maxUsers || row.maxUsers)},${Number(license.maxLocations || row.maxLocations)},${Number(license.monthlyPhotoLimit || row.monthlyPhotoLimit)})">Editar</button>
        <button class="tiny ghost" onclick="quickAction('${companyId}','SUSPENDED')">Suspender</button>
        <button class="tiny ghost" onclick="quickAction('${companyId}','ACTIVE')">Ativar</button>
        <button class="tiny ghost" onclick="extendLicense('${companyId}',30)">+30d</button>
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="9">Nenhuma licença cadastrada ainda.</td></tr>';

  const deviceRows = devices.slice(0, 80).map((device) => `<tr><td><strong>${htmlEscape(device.deviceName || device.stationName || '-')}</strong><small>${htmlEscape(device.deviceFingerprint || '')}</small></td><td>${htmlEscape(device.companyId || '')}</td><td>${htmlEscape(device.stationName || '-')}</td><td>v${htmlEscape(device.appVersion || '-')}</td><td>${device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString('pt-BR') : '-'}</td><td>${adminStatusPill(device.status || 'ACTIVE')}</td></tr>`).join('') || '<tr><td colspan="6">Nenhum dispositivo fez check-in ainda.</td></tr>';
  const checkoutRows = checkouts.slice(0, 80).map((checkout) => `<tr><td><strong>${htmlEscape(checkout.sessionCode || checkout.publicSlug || '-')}</strong><small>${htmlEscape(checkout.preferenceId || checkout.id || '')}</small></td><td>${htmlEscape(checkout.companyId || '-')}</td><td>${htmlEscape(checkout.status || '-')}</td><td>${formatCurrencyCents(checkout.totalCents || checkout.amountCents || 0)}</td><td>${checkout.createdAt ? new Date(checkout.createdAt).toLocaleString('pt-BR') : '-'}</td></tr>`).join('') || '<tr><td colspan="5">Nenhum checkout cloud ainda.</td></tr>';
  const sessionRows = publicSessions.slice(0, 80).map((session) => `<tr><td><strong>${htmlEscape(session.sessionCode || session.code || '-')}</strong><small>${htmlEscape(session.publicSlug || '')}</small></td><td>${htmlEscape(session.companyId || '-')}</td><td>${htmlEscape(session.locationName || '-')}</td><td>${Number((session.photos || []).length || 0)}</td><td>${session.expiresAt ? new Date(session.expiresAt).toLocaleString('pt-BR') : '-'}</td></tr>`).join('') || '<tr><td colspan="5">Nenhuma galeria cloud publicada ainda.</td></tr>';
  const events = (db.licenseEvents || []).slice(0, 30).map((event) => `<li><strong>${new Date(event.createdAt).toLocaleString('pt-BR')}</strong> — ${htmlEscape(event.action)} — ${htmlEscape(event.summary)}</li>`).join('') || '<li>Nenhum evento ainda.</li>';

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>PicTour Admin Web v4.6.3</title><style>
    :root{color-scheme:dark;--bg:#07111f;--card:#0f1d33;--soft:#132945;--line:#203655;--muted:#9fb4cf;--text:#eef6ff;--brand:#168bff;--ok:#8ff0bf;--warn:#ffd18a;--danger:#ffb3c2}*{box-sizing:border-box}body{font-family:Inter,Segoe UI,Arial,sans-serif;margin:0;background:radial-gradient(circle at top left,#10294b 0,#07111f 38%,#050b14 100%);color:var(--text)}main{max-width:1480px;margin:0 auto;padding:28px}.hero{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:20px}.card{background:linear-gradient(180deg,rgba(15,29,51,.96),rgba(10,20,36,.96));border:1px solid var(--line);border-radius:22px;padding:20px;margin-bottom:18px;box-shadow:0 18px 48px rgba(0,0,0,.28)}h1,h2,h3{margin:0 0 10px}p,small{color:var(--muted)}small{display:block;margin-top:4px}.tabs{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0}.tab{border:1px solid var(--line);background:var(--soft);color:var(--text);border-radius:999px;padding:9px 13px;font-weight:800;cursor:pointer}.tab.active{background:var(--brand);border-color:var(--brand)}input,select,textarea{background:#07111f;color:#fff;border:1px solid #345273;border-radius:12px;padding:11px;width:100%}textarea{min-height:80px}label{font-size:12px;color:var(--muted);font-weight:800;text-transform:uppercase;letter-spacing:.06em}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px}.metric{background:#07111f;border:1px solid #233a58;border-radius:18px;padding:16px}.metric strong{font-size:27px;display:block;margin-top:4px}.actions,.rowActions,.topLinks{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.btn,.tiny{border:0;border-radius:12px;background:var(--brand);color:#fff;padding:12px 16px;font-weight:900;cursor:pointer}.tiny{padding:8px 10px;margin:2px;font-size:12px}.ghost{background:#18304d}.danger{background:#7f1d1d}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #233a58;text-align:left;padding:10px;font-size:13px;vertical-align:top}code{color:#7bc7ff}.pill{display:inline-flex;padding:6px 10px;border-radius:999px;background:#132945;color:#7bc7ff;font-weight:900;font-size:12px;text-decoration:none}.active,.trial,.offline_grace{background:#0b3b2d;color:var(--ok)}.expired,.suspended{background:#4a1822;color:var(--danger)}.plan{background:#132945;color:#7bc7ff}.alert{display:inline-flex;margin:2px;padding:6px 8px;border-radius:999px;background:#4a2b11;color:var(--warn);font-weight:900;font-size:11px}.okText{color:var(--ok);font-weight:900}.warnRow{background:rgba(255,177,66,.04)}.msg{white-space:pre-wrap;background:#07111f;border:1px solid #233a58;border-radius:14px;padding:12px;min-height:18px}.hint{font-size:12px}.section{display:none}.section.active{display:block}.searchRow{display:grid;grid-template-columns:1fr 220px 220px;gap:10px;margin-bottom:14px}.miniChart{height:10px;background:#07111f;border:1px solid #263d5c;border-radius:999px;overflow:hidden}.miniChart span{display:block;height:100%;background:linear-gradient(90deg,#168bff,#8b5cf6)}@media(max-width:1050px){.grid,.metrics,.searchRow{grid-template-columns:1fr}.hero{display:block}table{display:block;overflow:auto}}
  </style></head><body><main>
  <section class="hero"><div><span class="pill">PicTour Cloud v4.6.3</span><h1>Painel administrativo web</h1><p>Administre clientes SaaS, licenças, dispositivos, uso, checkouts, galerias e alertas em uma única página.</p></div><div class="topLinks"><a class="pill" href="/health">Health</a><a class="pill" href="/api/admin/overview?token=${encodeURIComponent(token)}">API BI</a><a class="pill" href="/api/admin/export/licenses.csv?token=${encodeURIComponent(token)}">Exportar CSV</a></div></section>
  <section class="metrics"><div class="metric"><span>MRR estimado</span><strong>${formatCurrencyCents(kpis.mrrCents)}</strong><small>Baseado nos preços por plano</small></div><div class="metric"><span>Empresas</span><strong>${kpis.companies}</strong><small>${kpis.activeOrTrial} ativas/teste</small></div><div class="metric"><span>Alertas</span><strong>${kpis.alerts}</strong><small>${kpis.outdated} com versão antiga</small></div><div class="metric"><span>Uso mensal</span><strong>${kpis.photosThisMonth}</strong><small>${kpis.salesThisMonth} venda(s)</small></div><div class="metric"><span>Dispositivos</span><strong>${kpis.activeDevices}</strong><small>check-ins registrados</small></div></section>
  <div class="tabs"><button class="tab active" data-tab="clients">Clientes</button><button class="tab" data-tab="form">Nova licença</button><button class="tab" data-tab="devices">Dispositivos</button><button class="tab" data-tab="commerce">Comercial cloud</button><button class="tab" data-tab="events">Eventos</button></div>
  <section id="clients" class="section active card"><div class="searchRow"><input id="search" placeholder="Buscar empresa, ID, plano, status..."/><select id="statusFilter"><option value="">Todos status</option><option>ACTIVE</option><option>TRIAL</option><option>SUSPENDED</option><option>EXPIRED</option><option>OFFLINE_GRACE</option></select><select id="planFilter"><option value="">Todos planos</option><option>STARTER</option><option>PRO</option><option>ENTERPRISE</option></select></div><h2>Clientes SaaS</h2><table id="clientsTable"><thead><tr><th>Empresa</th><th>Chave</th><th>Plano</th><th>Status</th><th>Validade</th><th>Uso</th><th>Check-in</th><th>Alertas</th><th>Ações</th></tr></thead><tbody>${tableRows}</tbody></table></section>
  <section id="form" class="section card"><h2>Criar / atualizar empresa</h2><div class="grid"><div><label>Empresa</label><input id="companyName" placeholder="Parque Aventura"/></div><div><label>ID da empresa</label><input id="companyId" placeholder="empresa_parque_aventura"/></div><div><label>Chave</label><input id="licenseKey" placeholder="deixe vazio para gerar"/></div><div><label>Plano</label><select id="plan"><option>STARTER</option><option selected>PRO</option><option>ENTERPRISE</option></select></div><div><label>Status</label><select id="status"><option>TRIAL</option><option selected>ACTIVE</option><option>EXPIRED</option><option>SUSPENDED</option><option>OFFLINE_GRACE</option></select></div><div><label>Validade</label><input id="expiresAt" type="date"/></div><div><label>Usuários máx.</label><input id="maxUsers" type="number" placeholder="auto pelo plano"/></div><div><label>Locais máx.</label><input id="maxLocations" type="number" placeholder="auto pelo plano"/></div><div><label>Fotos/mês</label><input id="monthlyPhotoLimit" type="number" placeholder="auto pelo plano"/></div><div><label>Tolerância offline</label><input id="offlineGraceDays" value="7"/></div><div style="grid-column:span 2"><label>Notas internas</label><textarea id="notes" placeholder="Contrato, contato, observações comerciais..."></textarea></div><div class="actions"><button class="btn" onclick="saveLicense()">Salvar licença</button><button class="btn ghost" onclick="clearForm()">Limpar</button></div></div><p class="hint">Starter: implantação simples. Pro: operação comercial completa. Enterprise: multi-local, IA, limites maiores e suporte avançado.</p><p class="msg" id="msg"></p></section>
  <section id="devices" class="section card"><h2>Dispositivos registrados</h2><table><thead><tr><th>Dispositivo</th><th>Empresa</th><th>Estação</th><th>Versão</th><th>Último check-in</th><th>Status</th></tr></thead><tbody>${deviceRows}</tbody></table></section>
  <section id="commerce" class="section card"><h2>Comercial cloud</h2><div class="metrics"><div class="metric"><span>Checkouts</span><strong>${checkouts.length}</strong></div><div class="metric"><span>Vendas cloud</span><strong>${sales.length}</strong></div><div class="metric"><span>Galerias</span><strong>${publicSessions.length}</strong></div><div class="metric"><span>Receita cloud aprovada</span><strong>${formatCurrencyCents(sales.reduce((sum,sale)=>sum+Number(sale.totalCents||0),0))}</strong></div><div class="metric"><span>Storage</span><strong>${htmlEscape(STORAGE_DRIVER).toUpperCase()}</strong></div></div><h3>Checkouts recentes</h3><table><thead><tr><th>Sessão</th><th>Empresa</th><th>Status</th><th>Total</th><th>Criado em</th></tr></thead><tbody>${checkoutRows}</tbody></table><h3>Galerias publicadas</h3><table><thead><tr><th>Sessão</th><th>Empresa</th><th>Local</th><th>Fotos</th><th>Expira em</th></tr></thead><tbody>${sessionRows}</tbody></table></section>
  <section id="events" class="section card"><h2>Eventos recentes</h2><ul>${events}</ul></section>
  <script>
    const TOKEN=${JSON.stringify(token)};
    const tabs=[...document.querySelectorAll('.tab')];
    tabs.forEach(tab=>tab.addEventListener('click',()=>{tabs.forEach(t=>t.classList.remove('active'));document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));tab.classList.add('active');document.getElementById(tab.dataset.tab).classList.add('active')}));
    function slug(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'')||('empresa_'+Date.now())}
    function fillLicense(name,id,key,planValue,statusValue,expires,users,locations,photos){document.querySelector('[data-tab="form"]').click();companyName.value=name;companyId.value=id;licenseKey.value=key;plan.value=planValue;status.value=statusValue;expiresAt.value=expires||new Date(Date.now()+30*864e5).toISOString().slice(0,10);maxUsers.value=users||'';maxLocations.value=locations||'';monthlyPhotoLimit.value=photos||'';window.scrollTo({top:0,behavior:'smooth'})}
    function clearForm(){companyName.value='';companyId.value='';licenseKey.value='';plan.value='PRO';status.value='ACTIVE';expiresAt.value=new Date(Date.now()+30*864e5).toISOString().slice(0,10);maxUsers.value='';maxLocations.value='';monthlyPhotoLimit.value='';notes.value='';msg.textContent=''}
    document.getElementById('companyName').addEventListener('input',e=>{if(!document.getElementById('companyId').value)document.getElementById('companyId').value=slug(e.target.value)});
    document.getElementById('expiresAt').value=new Date(Date.now()+30*864e5).toISOString().slice(0,10);
    async function saveLicense(){const body={companyName:companyName.value,companyId:companyId.value,licenseKey:licenseKey.value,plan:plan.value,status:status.value,expiresAt:expiresAt.value,offlineGraceDays:Number(offlineGraceDays.value||7),maxUsers:Number(maxUsers.value||0)||undefined,maxLocations:Number(maxLocations.value||0)||undefined,monthlyPhotoLimit:Number(monthlyPhotoLimit.value||0)||undefined,notes:notes.value};const res=await fetch('/api/licenses/admin/upsert',{method:'POST',headers:{'content-type':'application/json','x-pictour-admin-token':TOKEN},body:JSON.stringify(body)});const data=await res.json();msg.textContent=JSON.stringify(data,null,2);if(data.ok)setTimeout(()=>location.href='/admin?token='+encodeURIComponent(TOKEN),650)}
    async function quickAction(companyId,status){if(!confirm('Aplicar status '+status+' para '+companyId+'?'))return;const res=await fetch('/api/admin/license-status',{method:'POST',headers:{'content-type':'application/json','x-pictour-admin-token':TOKEN},body:JSON.stringify({companyId,status})});const data=await res.json();if(!data.ok)alert(data.message||'Falhou');else location.reload()}
    async function extendLicense(companyId,days){const res=await fetch('/api/admin/license-extend',{method:'POST',headers:{'content-type':'application/json','x-pictour-admin-token':TOKEN},body:JSON.stringify({companyId,days})});const data=await res.json();if(!data.ok)alert(data.message||'Falhou');else location.reload()}
    function filterRows(){const q=search.value.toLowerCase();const st=statusFilter.value;const pl=planFilter.value;document.querySelectorAll('#clientsTable tbody tr').forEach(row=>{const txt=row.innerText.toLowerCase();const okQ=!q||txt.includes(q);const okS=!st||row.dataset.status===st;const okP=!pl||row.dataset.plan===pl;row.style.display=okQ&&okS&&okP?'':'none'})}
    search.addEventListener('input',filterRows);statusFilter.addEventListener('change',filterRows);planFilter.addEventListener('change',filterRows);
  </script>
  </main></body></html>`;
}

async function handleAdminOverview(req, res, url) {
  if (!requireLicenseAdmin(req, res, url)) return;
  const db = await readCloudState();
  const dashboard = buildAdminDashboardSummary(db);
  return json(res, 200, {
    ok: true,
    version: '4.6.3',
    checkedAt: new Date().toISOString(),
    kpis: dashboard.kpis,
    storage: { driver: STORAGE_DRIVER, bucket: S3_BUCKET || undefined, endpoint: S3_ENDPOINT || undefined },
    database: { driver: DATABASE_DRIVER },
    subscriptions: db.subscriptions || [],
    subscriptionSummary: buildSubscriptionSummary(db),
    rows: dashboard.rows.map((row) => ({
      company: row.company,
      license: sanitizeLicenseForDesktop(row.license),
      status: row.status,
      usage: row.usage,
      checkIn: row.checkIn,
      alerts: row.alerts,
      daysLeft: row.daysLeft,
      limits: { maxUsers: row.maxUsers, maxLocations: row.maxLocations, monthlyPhotoLimit: row.monthlyPhotoLimit }
    })),
    devices: db.devices || [],
    commerce: {
      sessions: (db.sessions || []).length,
      checkouts: (db.checkouts || []).length,
      sales: (db.sales || []).length,
      revenueCents: (db.sales || []).reduce((sum, sale) => sum + Number(sale.totalCents || 0), 0)
    },
    events: (db.licenseEvents || []).slice(0, 100)
  });
}

async function handleAdminLicenseStatus(req, res, url) {
  if (!requireLicenseAdmin(req, res, url)) return;
  const body = await readBody(req);
  const companyId = String(body.companyId || '').trim();
  const status = ['TRIAL','ACTIVE','EXPIRED','SUSPENDED','OFFLINE_GRACE'].includes(String(body.status || '')) ? body.status : '';
  if (!companyId || !status) return json(res, 400, { ok: false, message: 'Informe companyId e status válido.' });
  const db = await readCloudState();
  const now = new Date().toISOString();
  const license = (db.licenses || []).find((item) => item.companyId === companyId);
  const company = (db.companies || []).find((item) => item.id === companyId);
  if (!license || !company) return json(res, 404, { ok: false, message: 'Empresa/licença não encontrada.' });
  license.status = status;
  license.updatedAt = now;
  company.status = status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE';
  company.updatedAt = now;
  db.licenses = db.licenses.map((item) => item.id === license.id ? license : item);
  db.companies = db.companies.map((item) => item.id === company.id ? company : item);
  db.licenseEvents ||= [];
  db.licenseEvents.unshift({ id: crypto.randomUUID(), createdAt: now, action: 'LICENSE.STATUS_CHANGED', companyId, licenseId: license.id, summary: `${company.name} alterada para ${status} pelo painel admin v4.6.3.` });
  await writeCloudState(db);
  return json(res, 200, { ok: true, message: `Status atualizado para ${status}.`, company, license: sanitizeLicenseForDesktop(license) });
}

async function handleAdminLicenseExtend(req, res, url) {
  if (!requireLicenseAdmin(req, res, url)) return;
  const body = await readBody(req);
  const companyId = String(body.companyId || '').trim();
  const days = Math.max(1, Math.min(3650, Number(body.days || 30)));
  const db = await readCloudState();
  const now = new Date().toISOString();
  const license = (db.licenses || []).find((item) => item.companyId === companyId);
  const company = (db.companies || []).find((item) => item.id === companyId);
  if (!license || !company) return json(res, 404, { ok: false, message: 'Empresa/licença não encontrada.' });
  const base = license.expiresAt && new Date(`${license.expiresAt}T23:59:59`).getTime() > Date.now() ? new Date(`${license.expiresAt}T12:00:00`) : new Date();
  base.setDate(base.getDate() + days);
  license.expiresAt = base.toISOString().slice(0, 10);
  license.status = license.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE';
  license.updatedAt = now;
  db.licenses = db.licenses.map((item) => item.id === license.id ? license : item);
  db.licenseEvents ||= [];
  db.licenseEvents.unshift({ id: crypto.randomUUID(), createdAt: now, action: 'LICENSE.EXTENDED', companyId, licenseId: license.id, summary: `${company.name} renovada por +${days} dias até ${license.expiresAt}.` });
  await writeCloudState(db);
  return json(res, 200, { ok: true, message: `Licença estendida até ${license.expiresAt}.`, company, license: sanitizeLicenseForDesktop(license) });
}

async function handleAdminLicenseCsv(req, res, url) {
  if (!licenseAdminOk(req, url)) return text(res, 401, 'Token administrativo inválido.');
  const db = await readCloudState();
  const dashboard = buildAdminDashboardSummary(db);
  const header = ['companyId','companyName','licenseKey','plan','status','expiresAt','lastCheckInAt','appVersion','photosThisMonth','salesThisMonth','alerts'];
  const lines = [header.join(',')];
  for (const row of dashboard.rows) {
    const values = [
      row.license.companyId,
      row.company.name,
      row.license.licenseKey,
      row.license.plan,
      row.status,
      row.license.expiresAt,
      row.checkIn.at,
      row.checkIn.appVersion,
      row.usage.photosThisMonth || 0,
      row.usage.salesThisMonth || 0,
      row.alerts.join('|')
    ].map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`);
    lines.push(values.join(','));
  }
  res.writeHead(200, {
    'content-type': 'text/csv; charset=utf-8',
    'content-disposition': 'attachment; filename="pictour-licencas-v4.6.3.csv"',
    'cache-control': 'no-store'
  });
  res.end(lines.join('\n'));
}

async function handleAdminLicenseList(req, res, url) {
  if (!requireLicenseAdmin(req, res, url)) return;
  const db = await readCloudState();
  const view = buildLicenseAdminView(db);
  return json(res, 200, {
    ok: true,
    companies: db.companies || [],
    licenses: (db.licenses || []).map(sanitizeLicenseForDesktop),
    companiesDashboard: view.rows.map((row) => ({
      company: row.company,
      license: sanitizeLicenseForDesktop(row.license),
      status: row.status,
      usage: row.usage,
      checkIn: row.checkIn,
      alerts: row.alerts,
      daysLeft: row.daysLeft
    })),
    summary: {
      companies: view.companies.length,
      activeOrTrial: view.rows.filter((row) => row.status === 'ACTIVE' || row.status === 'TRIAL').length,
      alerts: view.rows.filter((row) => row.alerts.length).length
    },
    events: (db.licenseEvents || []).slice(0, 100),
    devices: db.devices || []
  });
}

async function handleAdminLicenseUpsert(req, res, url) {
  if (!requireLicenseAdmin(req, res, url)) return;
  const body = await readBody(req);
  const db = await readCloudState();
  const now = new Date().toISOString();
  const companyName = String(body.companyName || '').trim() || 'Empresa PicTour';
  const companyId = safeSlug(body.companyId || companyName).replace(/-/g, '_');
  const plan = body.plan === 'STARTER' || body.plan === 'ENTERPRISE' ? body.plan : 'PRO';
  const limits = licensePlanLimits(plan);
  const licenseKey = String(body.licenseKey || '').trim() || makeLicenseKey(plan);
  const status = ['TRIAL','ACTIVE','EXPIRED','SUSPENDED','OFFLINE_GRACE'].includes(String(body.status || '')) ? body.status : 'ACTIVE';
  const company = { id: companyId, name: companyName, status: body.companyStatus || 'ACTIVE', updatedAt: now, createdAt: (db.companies || []).find((item) => item.id === companyId)?.createdAt || now };
  const existingLicense = (db.licenses || []).find((item) => item.companyId === companyId || item.licenseKey === licenseKey);
  const license = {
    ...(existingLicense || {}),
    id: existingLicense?.id || crypto.randomUUID(),
    companyId,
    licenseKey,
    plan,
    status,
    activatedAt: existingLicense?.activatedAt || now,
    expiresAt: String(body.expiresAt || existingLicense?.expiresAt || dateOnlyPlusDays(30)).slice(0, 10),
    offlineGraceDays: Math.max(0, Number(body.offlineGraceDays ?? existingLicense?.offlineGraceDays ?? 7)),
    maxUsers: Math.max(1, Number(body.maxUsers || limits.maxUsers)),
    maxLocations: Math.max(1, Number(body.maxLocations || limits.maxLocations)),
    monthlyPhotoLimit: Math.max(1, Number(body.monthlyPhotoLimit || limits.monthlyPhotoLimit)),
    features: { ...limits.features, ...(body.features || {}) },
    notes: String(body.notes || existingLicense?.notes || 'Licença administrada pelo PicTour Cloud.').slice(0, 800),
    updatedAt: now,
    createdAt: existingLicense?.createdAt || now
  };

  const billingCycle = body.billingCycle === 'YEARLY' ? 'YEARLY' : 'MONTHLY';
  const subscriptionStatus = ['NOT_CONFIGURED','TRIAL','ACTIVE','PAST_DUE','CANCELLED','SUSPENDED'].includes(String(body.subscriptionStatus || '')) ? body.subscriptionStatus : (status === 'ACTIVE' ? 'ACTIVE' : status === 'TRIAL' ? 'TRIAL' : status === 'SUSPENDED' ? 'SUSPENDED' : 'NOT_CONFIGURED');
  const subscription = {
    id: existingLicense?.subscriptionId || `${companyId}_subscription`,
    companyId,
    plan,
    status: subscriptionStatus,
    billingCycle,
    provider: body.billingProvider || 'MANUAL',
    priceCents: Math.max(0, Number(body.subscriptionPriceCents || planPriceCents(plan, billingCycle))),
    nextBillingAt: String(body.nextBillingAt || license.expiresAt || '').slice(0, 10),
    graceDays: Math.max(0, Number(body.graceDays ?? 5)),
    updatedAt: now,
    createdAt: existingLicense?.createdAt || now
  };
  license.subscriptionId = subscription.id;
  license.billingStatus = subscriptionStatus;
  license.billingCycle = billingCycle;

  db.companies = [...(db.companies || []).filter((item) => item.id !== companyId), company];
  db.licenses = [...(db.licenses || []).filter((item) => item.id !== license.id && item.licenseKey !== license.licenseKey && item.companyId !== companyId), license];
  db.subscriptions = [...(db.subscriptions || []).filter((item) => item.id !== subscription.id && item.companyId !== companyId), subscription];
  db.licenseEvents ||= [];
  db.licenseEvents.unshift({ id: crypto.randomUUID(), createdAt: now, action: existingLicense ? 'LICENSE.UPDATED' : 'LICENSE.CREATED', companyId, licenseId: license.id, summary: `${companyName} ${existingLicense ? 'atualizada' : 'cadastrada'} no plano ${plan} (${status}).` });
  await writeCloudState(db);
  return json(res, 200, { ok: true, message: existingLicense ? 'Licença e assinatura atualizadas.' : 'Licença e assinatura criadas.', company, license: sanitizeLicenseForDesktop(license), subscription });
}

async function handleLicenseValidation(req, res) {
  const body = await readBody(req);
  const db = await readCloudState();
  const now = new Date().toISOString();
  const companyId = String(body.companyId || '').trim();
  const licenseKey = String(body.licenseKey || '').trim();
  const license = (db.licenses || []).find((item) => item.companyId === companyId && item.licenseKey === licenseKey);
  const company = (db.companies || []).find((item) => item.id === companyId);
  db.licenseEvents ||= [];

  if (!license || !company) {
    db.licenseEvents.unshift({ id: crypto.randomUUID(), createdAt: now, action: 'LICENSE.VALIDATION_DENIED', companyId, summary: `Tentativa de validação recusada para ${companyId || 'sem empresa'}.`, appVersion: body.appVersion, deviceName: body.deviceName });
    await writeCloudState(db);
    return json(res, 404, { ok: false, message: 'Empresa ou chave de licença não encontrada no servidor PicTour.' });
  }

  const effectiveStatus = computeEffectiveLicenseStatus(license);
  const usage = body.usage && typeof body.usage === 'object' ? body.usage : {};
  const checkIn = {
    at: now,
    kind: body.checkInKind === 'AUTO' ? 'AUTO' : 'MANUAL',
    appVersion: String(body.appVersion || '').slice(0, 80),
    deviceName: String(body.deviceName || '').slice(0, 120),
    deviceFingerprint: String(body.deviceFingerprint || '').slice(0, 128),
    stationName: String(body.stationName || body.deviceName || '').slice(0, 120),
    usage: {
      month: String(usage.month || new Date().toISOString().slice(0, 7)).slice(0, 7),
      activeUsers: Math.max(0, Number(usage.activeUsers || 0)),
      activeLocations: Math.max(0, Number(usage.activeLocations || 0)),
      photosThisMonth: Math.max(0, Number(usage.photosThisMonth || 0)),
      cloudSyncedPhotosThisMonth: Math.max(0, Number(usage.cloudSyncedPhotosThisMonth || 0)),
      salesThisMonth: Math.max(0, Number(usage.salesThisMonth || 0)),
      totalSales: Math.max(0, Number(usage.totalSales || 0)),
      totalPhotos: Math.max(0, Number(usage.totalPhotos || 0)),
      openSessions: Math.max(0, Number(usage.openSessions || 0)),
      closedSessions: Math.max(0, Number(usage.closedSessions || 0)),
      cashShiftOpen: Boolean(usage.cashShiftOpen),
      lastSaleAt: usage.lastSaleAt || null,
      lastPhotoAt: usage.lastPhotoAt || null
    }
  };
  license.lastValidatedAt = now;
  license.lastCheckIn = checkIn;
  license.usage = checkIn.usage;
  license.lastDeviceName = checkIn.deviceName;
  license.lastAppVersion = checkIn.appVersion;
  license.lastDeviceFingerprint = checkIn.deviceFingerprint;
  license.validationCount = Number(license.validationCount || 0) + 1;
  license.updatedAt = now;
  db.devices ||= [];
  if (checkIn.deviceFingerprint) {
    const existingDevice = db.devices.find((device) => device.companyId === companyId && device.deviceFingerprint === checkIn.deviceFingerprint);
    const deviceRecord = {
      id: existingDevice?.id || crypto.randomUUID(),
      companyId,
      licenseId: license.id,
      deviceFingerprint: checkIn.deviceFingerprint,
      deviceName: checkIn.deviceName,
      stationName: checkIn.stationName,
      appVersion: checkIn.appVersion,
      firstSeenAt: existingDevice?.firstSeenAt || now,
      lastSeenAt: now,
      status: existingDevice?.status || 'ACTIVE'
    };
    db.devices = [...db.devices.filter((device) => !(device.companyId === companyId && device.deviceFingerprint === checkIn.deviceFingerprint)), deviceRecord];
  }
  company.lastCheckInAt = now;
  company.lastAppVersion = checkIn.appVersion;
  company.updatedAt = now;
  db.companies = (db.companies || []).map((item) => item.id === company.id ? company : item);
  db.licenses = db.licenses.map((item) => item.id === license.id ? license : item);
  db.licenseEvents.unshift({ id: crypto.randomUUID(), createdAt: now, action: effectiveStatus === 'ACTIVE' || effectiveStatus === 'TRIAL' ? 'LICENSE.CHECK_IN' : 'LICENSE.CHECK_IN_WITH_WARNING', companyId, licenseId: license.id, summary: `${company.name} fez check-in ${checkIn.kind.toLowerCase()}: ${effectiveStatus} / v${checkIn.appVersion || '-'}.`, appVersion: body.appVersion, deviceName: body.deviceName, usage: checkIn.usage });
  await writeCloudState(db);

  const ok = company.status !== 'SUSPENDED' && effectiveStatus !== 'SUSPENDED';
  return json(res, ok ? 200 : 403, {
    ok,
    message: ok ? 'Licença validada no servidor PicTour.' : 'Empresa ou licença suspensa no servidor PicTour.',
    company: { id: company.id, name: company.name, status: company.status },
    checkIn: { at: now, kind: checkIn.kind, message: 'Check-in do desktop registrado no painel SaaS.' },
    license: sanitizeLicenseForDesktop(license)
  });
}

function safeSlug(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || `sessao-${Date.now()}`;
}

function sanitizeFilePart(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || crypto.randomUUID();
}

function parseDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error('Data URL inválida.');
  const mimeType = match[1];
  const buffer = Buffer.from(match[2], 'base64');
  const ext = mimeType.includes('png') ? '.png' : mimeType.includes('webp') ? '.webp' : '.jpg';
  return { mimeType, buffer, ext };
}

async function getS3Client() {
  if (cachedS3Client && cachedS3Sdk) return { client: cachedS3Client, sdk: cachedS3Sdk };
  if (!S3_BUCKET) throw new Error('S3_BUCKET/R2_BUCKET não configurado.');
  if (!S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) throw new Error('Credenciais S3/R2 não configuradas.');
  const sdk = await import('@aws-sdk/client-s3');
  cachedS3Sdk = sdk;
  cachedS3Client = new sdk.S3Client({
    region: S3_REGION,
    endpoint: S3_ENDPOINT || undefined,
    forcePathStyle: Boolean(S3_ENDPOINT),
    credentials: {
      accessKeyId: S3_ACCESS_KEY_ID,
      secretAccessKey: S3_SECRET_ACCESS_KEY
    }
  });
  return { client: cachedS3Client, sdk };
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function putObject(key, buffer, contentType) {
  if (STORAGE_DRIVER === 's3' || STORAGE_DRIVER === 'r2') {
    const { client, sdk } = await getS3Client();
    await client.send(new sdk.PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable'
    }));
    return;
  }

  const fullPath = path.join(LOCAL_STORAGE_DIR, key);
  ensureDir(path.dirname(fullPath));
  fs.writeFileSync(fullPath, buffer);
}

async function getObject(key) {
  if (STORAGE_DRIVER === 's3' || STORAGE_DRIVER === 'r2') {
    const { client, sdk } = await getS3Client();
    const result = await client.send(new sdk.GetObjectCommand({ Bucket: S3_BUCKET, Key: key }));
    const buffer = await streamToBuffer(result.Body);
    return { buffer, contentType: result.ContentType || 'application/octet-stream' };
  }

  const fullPath = path.join(LOCAL_STORAGE_DIR, key);
  if (!fs.existsSync(fullPath)) return null;
  return { buffer: fs.readFileSync(fullPath), contentType: mimeFromPath(fullPath) };
}

function mimeFromPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/jpeg';
}

function buildMediaUrl(key) {
  const encoded = key.split('/').map(encodeURIComponent).join('/');
  if (STORAGE_PUBLIC_BASE_URL) return `${STORAGE_PUBLIC_BASE_URL}/${encoded}`;
  return `${PUBLIC_BASE_URL}/media/${encoded}`;
}

function signStorageToken(key, expiresAt) {
  return crypto.createHmac('sha256', STORAGE_SIGNING_SECRET).update(`${key}:${expiresAt}`).digest('base64url');
}

function buildSignedDownloadUrl(slug, photoId, code = '') {
  const expiresAt = Math.floor(Date.now() / 1000) + STORAGE_SIGNED_TTL_SECONDS;
  const key = `${slug}:${photoId}`;
  const token = signStorageToken(key, expiresAt);
  const params = new URLSearchParams({ exp: String(expiresAt), token });
  if (code) params.set('code', code);
  return `${PUBLIC_BASE_URL}/api/gallery/${encodeURIComponent(slug)}/photo/${encodeURIComponent(photoId)}/download?${params.toString()}`;
}

function validateSignedDownload(slug, photoId, url) {
  const expiresAt = Number(url.searchParams.get('exp') || 0);
  const token = url.searchParams.get('token') || '';
  if (!expiresAt || !token) return false;
  if (expiresAt < Math.floor(Date.now() / 1000)) return false;
  const expected = signStorageToken(`${slug}:${photoId}`, expiresAt);
  try {
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return false;
  }
}

function collectLocalStorageStats(dir = LOCAL_STORAGE_DIR) {
  let objectCount = 0;
  let byteSize = 0;
  if (!fs.existsSync(dir)) return { objectCount, byteSize };
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else { objectCount += 1; byteSize += fs.statSync(full).size; }
    }
  }
  return { objectCount, byteSize };
}

function findSession(db, publicSlug) {
  return db.sessions.find((session) => session.publicSlug === publicSlug);
}

function requireGalleryAccess(db, slug, code) {
  const session = findSession(db, slug);
  if (!session) {
    const error = new Error('Galeria não encontrada.');
    error.status = 404;
    throw error;
  }
  if (session.accessCode && String(code) !== String(session.accessCode)) {
    const error = new Error('Código de acesso inválido.');
    error.status = 401;
    throw error;
  }
  return session;
}

function getPublicPhotos(session) {
  return (session.photos || []).map((photo) => ({
    id: photo.id,
    code: photo.code,
    label: photo.label,
    status: photo.status,
    kind: photo.kind,
    favorite: Boolean(photo.favorite),
    backgroundName: photo.backgroundName || '',
    previewUrl: photo.previewUrl || photo.thumbnailUrl || null,
    thumbnailUrl: photo.thumbnailUrl || photo.previewUrl || null,
    downloadUrl: photo.status === 'PURCHASED' ? buildSignedDownloadUrl(session.publicSlug, photo.id, session.accessCode || '') : null,
    previewDataUrl: photo.previewDataUrl || null // compatibilidade com publicações antigas
  }));
}

const SUPPORTED_CURRENCIES = new Set(['BRL', 'USD', 'EUR', 'PYG', 'ARS']);

function normalizeCloudPackage(rawPackage = {}, index = 0, fallbackLocation = '') {
  const name = String(rawPackage.name || `Pacote ${index + 1}`).trim() || `Pacote ${index + 1}`;
  const includesAllPhotos = Boolean(rawPackage.includesAllPhotos);
  const pricingMode = includesAllPhotos || rawPackage.pricingMode === 'FIXED' ? 'FIXED' : 'PER_PHOTO';
  const currency = SUPPORTED_CURRENCIES.has(String(rawPackage.currency || '').toUpperCase()) ? String(rawPackage.currency).toUpperCase() : 'BRL';
  return {
    id: sanitizeFilePart(rawPackage.id || `pkg-${index + 1}`),
    name,
    locationId: rawPackage.locationId || '',
    locationName: rawPackage.locationName || fallbackLocation || '',
    photoQuantity: includesAllPhotos ? null : (rawPackage.photoQuantity === null ? null : Number(rawPackage.photoQuantity || 1)),
    includesAllPhotos,
    priceCents: Math.max(0, Math.round(Number(rawPackage.priceCents || 0))),
    currency,
    pricingMode,
    active: rawPackage.active !== false
  };
}

function isDigitalGalleryPackage(packageOption = {}) {
  const name = String(packageOption.name || '').toLowerCase();
  const blocked = ['impress', 'porta-retrato', 'porta retrato', 'moldura', 'frame', 'print ', 'printed', 'fisic', 'físic'];
  return !blocked.some((term) => name.includes(term));
}

function normalizeCloudPackages(packages = [], fallbackLocation = '') {
  const normalized = (Array.isArray(packages) ? packages : [])
    .map((item, index) => normalizeCloudPackage(item, index, fallbackLocation))
    .filter((item) => item.active !== false && item.priceCents > 0)
    .filter(isDigitalGalleryPackage);

  if (normalized.length) return normalized;

  return [
    {
      id: 'pkg-default-photo',
      name: 'Foto digital',
      locationName: fallbackLocation || '',
      photoQuantity: 1,
      includesAllPhotos: false,
      priceCents: CLOUD_PHOTO_PRICE_CENTS,
      currency: 'BRL',
      pricingMode: 'PER_PHOTO',
      active: true
    }
  ];
}

function calculateCloudPackageTotalCents(packageOption, selectedCount) {
  const count = Math.max(0, Number(selectedCount || 0));
  if (!count) return 0;
  if (packageOption?.includesAllPhotos || packageOption?.pricingMode === 'FIXED') return Math.max(1, Math.round(Number(packageOption.priceCents || 0)));
  return Math.max(1, Math.round(Number(packageOption?.priceCents || CLOUD_PHOTO_PRICE_CENTS) * count));
}

function findCloudPackage(session, packageId) {
  const packages = normalizeCloudPackages(session.packages || [], session.locationName || '');
  return packages.find((item) => item.id === packageId) || packages[0];
}

function publicGalleryHtml(slug) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PicTour Cloud</title>
  <style>
    :root{font-family:Inter,system-ui,sans-serif;color:#f9fafb;background:#050b14;color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 0 0,rgba(33,150,255,.23),transparent 30%),#050b14}.app{width:min(1120px,calc(100% - 28px));margin:0 auto;padding:24px 0 48px}.hero,.card,.checkout{border:1px solid rgba(255,255,255,.12);background:rgba(11,18,32,.9);border-radius:28px;padding:22px;box-shadow:0 28px 80px rgba(0,0,0,.36)}h1{font-size:clamp(30px,7vw,58px);letter-spacing:-.05em;margin:0}p{color:#b8c3d9;line-height:1.55}.row{display:grid;grid-template-columns:1fr auto;gap:10px;margin-top:16px}input,button,select{font:inherit;border-radius:16px;padding:14px 16px}input,select{border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.08);color:white}select option{background:#0b1220;color:white}button{border:0;background:#0b74ff;color:white;font-weight:900;cursor:pointer}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px;margin-top:18px}.photo{position:relative;overflow:hidden}.photo.sold{opacity:.82}.photo img,.placeholder{width:100%;aspect-ratio:4/3;object-fit:cover;display:block;background:linear-gradient(135deg,#0b74ff,#04345b)}.wm{pointer-events:none;position:absolute;inset:-20%;display:grid;grid-template-columns:repeat(2,1fr);gap:18px;place-items:center;transform:rotate(-22deg);opacity:.42;color:white;font-weight:900;font-size:11px;text-shadow:0 2px 10px black}.meta{padding:14px}.meta span{color:#98a2b3}.pill{display:inline-flex;border:1px solid rgba(255,255,255,.14);border-radius:999px;padding:8px 12px;color:#dbeafe;background:rgba(255,255,255,.08);font-size:12px;font-weight:900}.toolbar{display:grid;grid-template-columns:minmax(240px,1fr) auto auto;gap:12px;align-items:end;margin:18px 0}.status{min-height:24px;font-weight:800;color:#dbeafe;margin-top:10px}.empty{margin-top:18px;color:#98a2b3}.selected{outline:3px solid rgba(33,150,255,.5)}.download{display:block;text-align:center;text-decoration:none;color:white;background:#12b76a;border-radius:14px;padding:12px;font-weight:900;margin:0 14px 14px}.small{font-size:12px;color:#98a2b3}.offerLabel{display:grid;gap:8px;color:#b8c3d9;font-size:13px;font-weight:800}.checkoutTotal{display:flex;gap:10px;align-items:center;justify-content:space-between}.checkoutTotal strong{font-size:22px}.soldBadge{position:absolute;top:12px;right:12px;background:#12b76a;color:white;border-radius:999px;padding:7px 10px;font-size:11px;font-weight:900}.selectionHint{color:#98a2b3;font-size:13px;margin-top:8px}@media(max-width:760px){.toolbar,.row{grid-template-columns:1fr}.toolbar button{width:100%}}
  </style>
</head>
<body oncontextmenu="return false">
  <main class="app">
    <section class="hero">
      <span class="pill">PicTour Cloud v1.8</span>
      <h1>Galeria pós-passeio</h1>
      <p>Digite o código da sessão para ver previews protegidas, comprar somente produtos digitais disponíveis online e baixar fotos liberadas.</p>
      <div class="row"><input id="code" placeholder="Código de acesso" inputmode="numeric" /><button id="load">Acessar</button></div>
      <div class="status" id="status">Aguardando acesso.</div>
      <div class="small" id="storage"></div>
    </section>
    <section class="toolbar checkout">
      <label class="offerLabel">Pacote
        <select id="packageSelect"><option>Carregue a galeria primeiro</option></select>
      </label>
      <div class="checkoutTotal"><span id="total">0 selecionadas</span><strong id="totalMoney">R$ 0,00</strong></div>
      <button id="mpBuy">Pagar online</button>
      <button id="mockBuy" style="display:none">Simular compra</button>
      <div class="selectionHint" id="packageHelp">Os valores e pacotes vêm da configuração publicada pelo PicTour Desktop.</div>
    </section>
    <section class="grid" id="grid"></section>
  </main>
<script>
const slug=${JSON.stringify(slug)};const allowSimulatedPurchases=${JSON.stringify(ALLOW_SIMULATED_PURCHASES)};let code='';let photos=[];let packages=[];let selectedPackageId='';let selected=new Set();
const grid=document.getElementById('grid'), statusEl=document.getElementById('status'), total=document.getElementById('total'), totalMoney=document.getElementById('totalMoney'), storageEl=document.getElementById('storage'), packageSelect=document.getElementById('packageSelect'), packageHelp=document.getElementById('packageHelp');
function wm(t){return '<div class="wm">'+Array.from({length:10},()=>'<span>'+t+'</span>').join('')+'</div>'}
function imgSrc(p){return p.previewUrl||p.thumbnailUrl||p.previewDataUrl||''}
function money(cents,currency){try{return new Intl.NumberFormat(currency==='BRL'?'pt-BR':currency==='USD'?'en-US':currency==='EUR'?'de-DE':currency==='PYG'?'es-PY':'es-AR',{style:'currency',currency,maximumFractionDigits:currency==='PYG'?0:2}).format((Number(cents)||0)/100)}catch{return ((Number(cents)||0)/100).toFixed(2)+' '+currency}}
function currentPackage(){return packages.find(p=>p.id===selectedPackageId)||packages[0]||{id:'pkg-default-photo',name:'Foto digital',priceCents:4000,currency:'BRL',pricingMode:'PER_PHOTO'}}
function packageTotal(pkg,count){if(!count)return 0;if(pkg.includesAllPhotos||pkg.pricingMode==='FIXED')return Number(pkg.priceCents||0);return Number(pkg.priceCents||0)*count}
function packageUnit(pkg){return (pkg.includesAllPhotos||pkg.pricingMode==='FIXED')?'valor fechado':'por foto selecionada'}
function renderPackages(){if(!packages.length){packageSelect.innerHTML='<option value="pkg-default-photo">Foto digital</option>';return;}packageSelect.innerHTML=packages.map(p=>'<option value="'+p.id+'">'+p.name+' — '+money(p.priceCents,p.currency)+' / '+packageUnit(p)+'</option>').join('');if(!selectedPackageId||!packages.some(p=>p.id===selectedPackageId))selectedPackageId=packages[0].id;packageSelect.value=selectedPackageId;}
function renderTotals(){const pkg=currentPackage();const count=selected.size;total.textContent=count+' selecionada(s)';totalMoney.textContent=money(packageTotal(pkg,count),pkg.currency||'BRL');packageHelp.textContent=pkg.name+' • '+money(pkg.priceCents,pkg.currency||'BRL')+' • '+packageUnit(pkg);}
function render(){renderTotals();grid.innerHTML=photos.map(p=>'<article class="card photo '+(selected.has(p.id)?'selected ':'')+(p.status==='PURCHASED'?'sold':'')+'" data-id="'+p.id+'">'+(p.status==='PURCHASED'?'<span class="soldBadge">LIBERADA</span>':'')+(imgSrc(p)?'<img draggable="false" src="'+imgSrc(p)+'" />':'<div class="placeholder"></div>')+wm('PICTOUR • '+p.code+' • PREVIEW')+'<div class="meta"><strong>'+p.code+'</strong><br/><span>'+p.label+'</span></div>'+(p.status==='PURCHASED'?'<a class="download" href="'+(p.downloadUrl||('/api/gallery/'+encodeURIComponent(slug)+'/photo/'+encodeURIComponent(p.id)+'/download?code='+encodeURIComponent(code)))+'">Baixar liberada</a>':'')+'</article>').join('')||'<div class="empty">Nenhuma foto publicada nessa sessão ainda.</div>';}
grid.addEventListener('click',e=>{const card=e.target.closest('.photo');if(!card||e.target.closest('a'))return;const id=card.dataset.id;const photo=photos.find(p=>p.id===id);if(!photo||photo.status==='PURCHASED')return;selected.has(id)?selected.delete(id):selected.add(id);render();});
packageSelect.addEventListener('change',()=>{selectedPackageId=packageSelect.value;render();});
async function load(){code=document.getElementById('code').value.trim()||new URLSearchParams(location.search).get('code')||'';const r=await fetch('/api/gallery/'+encodeURIComponent(slug)+'?code='+encodeURIComponent(code));const data=await r.json();if(!data.ok){statusEl.textContent=data.message||'Erro ao abrir galeria';return;}photos=data.photos||[];packages=data.packages||[];selected.clear();renderPackages();statusEl.textContent=data.session.code+' — '+data.session.customerName;storageEl.textContent='Storage: '+(data.storage?.driver||'local')+' • '+photos.length+' foto(s) sincronizada(s) • '+packages.length+' pacote(s) publicado(s)';render();}
if(allowSimulatedPurchases)document.getElementById('mockBuy').style.display='inline-flex';
document.getElementById('load').onclick=load;document.getElementById('mpBuy').onclick=async()=>{if(!selected.size){statusEl.textContent='Selecione pelo menos uma foto.';return;}const pkg=currentPackage();statusEl.textContent='Criando checkout Mercado Pago...';const r=await fetch('/api/gallery/'+encodeURIComponent(slug)+'/create-checkout',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code,photoIds:[...selected],packageId:pkg.id})});const data=await r.json();if(!data.ok){statusEl.textContent=data.message||'Falha ao criar checkout.';return;}statusEl.textContent='Checkout criado para '+(data.checkout.packageName||pkg.name)+'. Abrindo pagamento...';const url=data.checkout.sandboxCheckoutUrl||data.checkout.checkoutUrl;if(url) location.href=url;};document.getElementById('mockBuy').onclick=async()=>{if(!selected.size){statusEl.textContent='Selecione pelo menos uma foto.';return;}const pkg=currentPackage();const r=await fetch('/api/gallery/'+encodeURIComponent(slug)+'/purchase-simulated',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code,photoIds:[...selected],packageId:pkg.id})});const data=await r.json();statusEl.textContent=data.message;selected.clear();await load();};
async function checkReturnedCheckout(){const params=new URLSearchParams(location.search);const checkout=params.get('checkout');if(!checkout||!code)return;statusEl.textContent='Conferindo pagamento...';const r=await fetch('/api/gallery/'+encodeURIComponent(slug)+'/checkout/'+encodeURIComponent(checkout)+'?refresh=1&code='+encodeURIComponent(code));const data=await r.json();if(data.ok){statusEl.textContent=data.checkout.status==='APPROVED'?'Pagamento aprovado. Fotos liberadas automaticamente.':'Status do pagamento: '+data.checkout.status+'. O webhook também atualiza automaticamente quando aprovado.';await load();}else statusEl.textContent=data.message||'Não foi possível conferir o pagamento.';}
if(new URLSearchParams(location.search).get('code')){document.getElementById('code').value=new URLSearchParams(location.search).get('code');load().then(checkReturnedCheckout);}
</script>
</body></html>`;
}

async function mercadoPagoApi(pathname, options = {}) {
  if (!MP_ACCESS_TOKEN) throw new Error('MERCADO_PAGO_ACCESS_TOKEN/MP_ACCESS_TOKEN não configurado no backend cloud.');
  const response = await fetch(`https://api.mercadopago.com${pathname}`, {
    ...options,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
      ...(options.headers || {})
    }
  });
  const textBody = await response.text();
  let data = null;
  try { data = textBody ? JSON.parse(textBody) : null; } catch { data = { raw: textBody }; }
  if (!response.ok) {
    throw new Error(data?.message || data?.error || `Mercado Pago ${response.status}`);
  }
  return data;
}

function moneyFromCents(cents) {
  return Number((Number(cents || 0) / 100).toFixed(2));
}

function makeCloudExternalReference(slug) {
  return `pictour-cloud-${slug}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

function releaseCheckoutPhotos(db, checkout, payment = {}) {
  const session = findSession(db, checkout.publicSlug);
  if (!session) return { releasedCount: 0 };
  const selected = new Set(checkout.photoIds || []);
  let releasedCount = 0;
  session.photos = (session.photos || []).map((photo) => {
    if (!selected.has(photo.id)) return photo;
    if (photo.status !== 'PURCHASED') releasedCount += 1;
    return { ...photo, status: 'PURCHASED', purchasedAt: new Date().toISOString() };
  });
  session.updatedAt = new Date().toISOString();
  db.sessions = db.sessions.map((item) => item.publicSlug === session.publicSlug ? session : item);

  const alreadyRegistered = (db.sales || []).some((sale) => sale.checkoutId === checkout.id || sale.externalReference === checkout.externalReference);
  if (!alreadyRegistered) {
    db.sales.unshift({
      id: crypto.randomUUID(),
      publicSlug: checkout.publicSlug,
      checkoutId: checkout.id,
      externalReference: checkout.externalReference,
      paymentId: payment?.id ? String(payment.id) : undefined,
      photoIds: checkout.photoIds || [],
      method: payment?.payment_method_id || payment?.payment_type_id || 'MERCADO_PAGO',
      status: 'APPROVED',
      packageId: checkout.packageId,
      packageName: checkout.packageName,
      amountCents: checkout.amountCents,
      currency: checkout.currency || 'BRL',
      createdAt: new Date().toISOString()
    });
  }
  return { releasedCount };
}

async function syncMercadoPagoPayment(db, paymentId) {
  if (!paymentId) return { ok: false, message: 'ID do pagamento ausente.' };
  const payment = await mercadoPagoApi(`/v1/payments/${encodeURIComponent(paymentId)}`, { method: 'GET' });
  const externalReference = payment?.external_reference || payment?.externalReference || '';
  const checkout = (db.checkouts || []).find((item) => item.externalReference === externalReference || String(item.paymentId || '') === String(paymentId));
  if (!checkout) return { ok: false, message: 'Pagamento recebido, mas checkout PicTour não encontrado.', payment };

  const status = String(payment?.status || 'unknown').toUpperCase();
  const mappedStatus = status === 'APPROVED' ? 'APPROVED' : ['REJECTED', 'CANCELLED', 'REFUNDED', 'CHARGED_BACK'].includes(status) ? 'CANCELLED' : 'PENDING';
  checkout.status = mappedStatus;
  checkout.gatewayStatus = payment?.status || 'unknown';
  checkout.paymentId = String(paymentId);
  checkout.updatedAt = new Date().toISOString();
  if (mappedStatus === 'APPROVED') checkout.paidAt = new Date().toISOString();
  db.checkouts = (db.checkouts || []).map((item) => item.id === checkout.id ? checkout : item);

  const release = mappedStatus === 'APPROVED' ? releaseCheckoutPhotos(db, checkout, payment) : { releasedCount: 0 };
  return { ok: mappedStatus === 'APPROVED', checkout, payment, releasedCount: release.releasedCount };
}

async function syncMercadoPagoCheckoutByReference(db, checkout) {
  if (!checkout) return { ok: false, message: 'Checkout ausente.' };
  const externalReference = checkout.externalReference || '';
  if (!externalReference) return { ok: false, message: 'Checkout sem referência externa.' };
  const search = await mercadoPagoApi(`/v1/payments/search?external_reference=${encodeURIComponent(externalReference)}`, { method: 'GET' });
  const payment = Array.isArray(search?.results) && search.results.length ? search.results[0] : null;
  if (!payment?.id) {
    checkout.gatewayStatus = checkout.gatewayStatus || 'payment_not_found';
    checkout.updatedAt = new Date().toISOString();
    db.checkouts = (db.checkouts || []).map((item) => item.id === checkout.id ? checkout : item);
    return { ok: false, checkout, message: 'Pagamento ainda não localizado no Mercado Pago.' };
  }
  return syncMercadoPagoPayment(db, String(payment.id));
}

function verifyWebhookToken(req, url) {
  if (!MP_WEBHOOK_TOKEN) return true;
  const provided = url.searchParams.get('token') || req.headers['x-pictour-webhook-token'] || '';
  return String(provided) === String(MP_WEBHOOK_TOKEN);
}

async function handleCreateCloudCheckout(req, res, slug) {
  const body = await readBody(req);
  const db = await readCloudState();
  try {
    const session = requireGalleryAccess(db, slug, body.code || '');
    const photoIds = Array.isArray(body.photoIds) ? body.photoIds.filter(Boolean) : [];
    if (!photoIds.length) return json(res, 400, { ok: false, message: 'Selecione pelo menos uma foto.' });
    const available = new Set((session.photos || []).filter((photo) => photo.status !== 'PURCHASED').map((photo) => photo.id));
    const validPhotoIds = photoIds.filter((id) => available.has(id));
    if (!validPhotoIds.length) return json(res, 400, { ok: false, message: 'As fotos selecionadas já foram compradas ou não existem.' });
    const selectedPackage = findCloudPackage(session, String(body.packageId || ''));
    const amountCents = calculateCloudPackageTotalCents(selectedPackage, validPhotoIds.length);
    const currency = selectedPackage.currency || 'BRL';
    const externalReference = makeCloudExternalReference(slug);
    const checkoutId = crypto.randomUUID();
    const galleryReturn = `${PUBLIC_BASE_URL}/g/${encodeURIComponent(slug)}?code=${encodeURIComponent(session.accessCode || '')}&checkout=${encodeURIComponent(checkoutId)}`;
    const notificationBase = `${MP_PUBLIC_BASE_URL || PUBLIC_BASE_URL}/webhooks/mercado-pago`;
    const notificationUrl = MP_WEBHOOK_TOKEN ? `${notificationBase}?token=${encodeURIComponent(MP_WEBHOOK_TOKEN)}` : notificationBase;

    const preference = await mercadoPagoApi('/checkout/preferences', {
      method: 'POST',
      body: JSON.stringify({
        items: [{
          id: `pictour-${slug}`,
          title: `PicTour ${session.code || slug} - ${selectedPackage.name || 'Fotos digitais'}`,
          quantity: 1,
          unit_price: moneyFromCents(amountCents),
          currency_id: currency
        }],
        external_reference: externalReference,
        notification_url: notificationUrl,
        back_urls: { success: galleryReturn, failure: galleryReturn, pending: galleryReturn },
        auto_return: 'approved',
        metadata: {
          source: 'pictour_cloud',
          session_public_slug: slug,
          photo_ids: validPhotoIds.join(','),
          checkout_id: checkoutId,
          package_id: selectedPackage.id,
          package_name: selectedPackage.name
        }
      })
    });

    const checkout = {
      id: checkoutId,
      provider: 'MERCADO_PAGO',
      publicSlug: slug,
      sessionCode: session.code,
      photoIds: validPhotoIds,
      packageId: selectedPackage.id,
      packageName: selectedPackage.name,
      packagePricingMode: selectedPackage.pricingMode,
      amountCents,
      currency,
      status: 'PENDING',
      gatewayStatus: 'preference_created',
      preferenceId: preference.id,
      externalReference,
      checkoutUrl: preference.init_point,
      sandboxCheckoutUrl: preference.sandbox_init_point,
      createdAt: new Date().toISOString()
    };
    db.checkouts.unshift(checkout);
    await writeCloudState(db);
    return json(res, 200, { ok: true, message: 'Checkout Mercado Pago criado.', checkout });
  } catch (error) {
    return json(res, error.status || 500, { ok: false, message: error.message || 'Falha ao criar checkout cloud.' });
  }
}

async function handleCheckoutStatus(req, res, slug, checkoutId, code, url) {
  const db = await readCloudState();
  try {
    requireGalleryAccess(db, slug, code || '');
    let checkout = (db.checkouts || []).find((item) => item.id === checkoutId && item.publicSlug === slug);
    if (!checkout) return json(res, 404, { ok: false, message: 'Checkout não encontrado.' });
    if (url.searchParams.get('refresh') === '1' && MP_ACCESS_TOKEN && checkout.status !== 'APPROVED') {
      const sync = await syncMercadoPagoCheckoutByReference(db, checkout);
      checkout = sync.checkout || checkout;
      await writeCloudState(db);
    }
    return json(res, 200, { ok: true, checkout });
  } catch (error) {
    return json(res, error.status || 500, { ok: false, message: error.message });
  }
}


function parsePublicSlugs(value) {
  return String(value || '')
    .split(',')
    .map((item) => safeSlug(decodeURIComponent(item.trim())))
    .filter(Boolean);
}

function toSyncSale(sale, session) {
  return {
    id: sale.id,
    publicSlug: sale.publicSlug,
    sessionCode: session?.code || sale.sessionCode || '',
    checkoutId: sale.checkoutId || undefined,
    externalReference: sale.externalReference || undefined,
    paymentId: sale.paymentId || undefined,
    photoIds: Array.isArray(sale.photoIds) ? sale.photoIds : [],
    method: sale.method || 'MERCADO_PAGO',
    status: sale.status || 'APPROVED',
    packageId: sale.packageId || undefined,
    packageName: sale.packageName || undefined,
    amountCents: Number(sale.amountCents || 0),
    currency: sale.currency || 'BRL',
    createdAt: sale.createdAt || new Date().toISOString()
  };
}

function toSyncCheckout(checkout, session) {
  return {
    id: checkout.id,
    publicSlug: checkout.publicSlug,
    sessionCode: session?.code || checkout.sessionCode || '',
    photoIds: Array.isArray(checkout.photoIds) ? checkout.photoIds : [],
    packageId: checkout.packageId,
    packageName: checkout.packageName,
    amountCents: Number(checkout.amountCents || 0),
    currency: checkout.currency || 'BRL',
    status: checkout.status || 'UNKNOWN',
    gatewayStatus: checkout.gatewayStatus || '',
    paymentId: checkout.paymentId || undefined,
    preferenceId: checkout.preferenceId || undefined,
    externalReference: checkout.externalReference || undefined,
    checkoutUrl: checkout.checkoutUrl || undefined,
    sandboxCheckoutUrl: checkout.sandboxCheckoutUrl || undefined,
    createdAt: checkout.createdAt || new Date().toISOString(),
    paidAt: checkout.paidAt || undefined
  };
}

async function handleSyncSales(req, res, url) {
  if (!authOk(req)) return json(res, 401, { ok: false, message: 'API key inválida.' });
  const db = await readCloudState();
  const slugs = parsePublicSlugs(url.searchParams.get('publicSlugs') || url.searchParams.get('slugs') || '');
  const sinceRaw = url.searchParams.get('since') || '';
  const sinceMs = sinceRaw ? Date.parse(sinceRaw) : 0;
  const slugSet = new Set(slugs);
  const sessions = (db.sessions || []).filter((session) => !slugSet.size || slugSet.has(session.publicSlug));
  const matchedSlugSet = new Set(sessions.map((session) => session.publicSlug));
  const sessionBySlug = new Map(sessions.map((session) => [session.publicSlug, session]));

  const sales = (db.sales || [])
    .filter((sale) => matchedSlugSet.has(sale.publicSlug))
    .filter((sale) => !sinceMs || Date.parse(sale.createdAt || '') >= sinceMs)
    .filter((sale) => String(sale.status || 'APPROVED').toUpperCase() === 'APPROVED')
    .map((sale) => toSyncSale(sale, sessionBySlug.get(sale.publicSlug)));

  const checkouts = (db.checkouts || [])
    .filter((checkout) => matchedSlugSet.has(checkout.publicSlug))
    .filter((checkout) => !sinceMs || Date.parse(checkout.updatedAt || checkout.createdAt || '') >= sinceMs || String(checkout.status || '').toUpperCase() === 'APPROVED')
    .map((checkout) => toSyncCheckout(checkout, sessionBySlug.get(checkout.publicSlug)));

  return json(res, 200, {
    ok: true,
    syncedAt: new Date().toISOString(),
    sessions: sessions.map((session) => ({
      publicSlug: session.publicSlug,
      code: session.code,
      customerName: session.customerName,
      locationName: session.locationName,
      updatedAt: session.updatedAt,
      photos: (session.photos || []).map((photo) => ({
        id: photo.id,
        code: photo.code,
        status: photo.status,
        purchasedAt: photo.purchasedAt || undefined
      }))
    })),
    sales,
    checkouts
  });
}

async function handlePublishSession(req, res) {
  if (!authOk(req)) return json(res, 401, { ok: false, message: 'API key inválida.' });
  const body = await readBody(req);
  const db = await readCloudState();
  const session = body.session || {};
  const publicSlug = safeSlug(session.publicSlug || `${session.code}-${session.customerName}`);
  const existing = findSession(db, publicSlug);
  const normalizedPackages = normalizeCloudPackages(body.packages || session.packages || existing?.packages || [], body.company?.locationName || session.locationName || existing?.locationName || 'Operação PicTour');
  const nextSession = {
    ...(existing || {}),
    ...session,
    publicSlug,
    accessCode: String(session.accessCode || existing?.accessCode || '').trim(),
    companyName: body.company?.name || session.companyName || existing?.companyName || 'PicTour',
    locationName: body.company?.locationName || session.locationName || existing?.locationName || 'Operação PicTour',
    packages: normalizedPackages,
    settings: {
      ...(existing?.settings || {}),
      ...(body.settings || {}),
      defaultCurrency: body.settings?.defaultCurrency || existing?.settings?.defaultCurrency || 'BRL'
    },
    photos: existing?.photos || [],
    publishedAt: existing?.publishedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  db.sessions = [nextSession, ...db.sessions.filter((item) => item.publicSlug !== publicSlug)];
  await writeCloudState(db);
  const publicGalleryUrl = `${PUBLIC_BASE_URL}/g/${publicSlug}`;
  const protectedGalleryUrl = `${publicGalleryUrl}?code=${encodeURIComponent(nextSession.accessCode || '')}`;
  return json(res, 200, { ok: true, publicSlug, publicGalleryUrl, protectedGalleryUrl, galleryUrl: protectedGalleryUrl, photoCount: nextSession.photos.length, packageCount: nextSession.packages.length, storage: { driver: STORAGE_DRIVER } });
}

async function handlePublishPhoto(req, res) {
  if (!authOk(req)) return json(res, 401, { ok: false, message: 'API key inválida.' });
  const body = await readBody(req);
  const db = await readCloudState();
  const publicSlug = safeSlug(body.publicSlug || body.sessionPublicSlug || '');
  const session = findSession(db, publicSlug);
  if (!session) return json(res, 404, { ok: false, message: 'Publique a sessão antes de enviar fotos.' });

  const photo = body.photo || {};
  const photoId = sanitizeFilePart(photo.id || crypto.randomUUID());
  const code = sanitizeFilePart(photo.code || 'F01');
  const contentHash = body.contentHash || photo.contentHash || '';
  const existing = (session.photos || []).find((item) => item.id === photoId);

  if (existing?.contentHash && contentHash && existing.contentHash === contentHash) {
    return json(res, 200, { ok: true, skipped: true, photoId, message: `${code} já estava sincronizada.`, photo: existing });
  }

  const timestamp = Date.now();
  const saved = {};

  if (body.thumbnailDataUrl) {
    const parsed = parseDataUrl(body.thumbnailDataUrl);
    const key = `${publicSlug}/thumb-${code}-${photoId}-${timestamp}${parsed.ext}`;
    await putObject(key, parsed.buffer, parsed.mimeType);
    saved.thumbnailKey = key;
    saved.thumbnailUrl = buildMediaUrl(key);
  }

  if (body.previewDataUrl) {
    const parsed = parseDataUrl(body.previewDataUrl);
    const key = `${publicSlug}/preview-${code}-${photoId}-${timestamp}${parsed.ext}`;
    await putObject(key, parsed.buffer, parsed.mimeType);
    saved.previewKey = key;
    saved.previewUrl = buildMediaUrl(key);
  }

  if (body.downloadDataUrl) {
    const parsed = parseDataUrl(body.downloadDataUrl);
    const key = `${publicSlug}/private/download-${code}-${photoId}-${timestamp}${parsed.ext}`;
    await putObject(key, parsed.buffer, parsed.mimeType);
    saved.downloadKey = key;
    saved.downloadMimeType = parsed.mimeType;
    saved.byteSize = parsed.buffer.length;
  }

  const nextPhoto = {
    id: photoId,
    code: photo.code || code,
    label: photo.label || 'Foto PicTour',
    status: photo.status || existing?.status || 'READY',
    kind: photo.kind || existing?.kind || 'UPLOAD',
    favorite: Boolean(photo.favorite),
    backgroundName: photo.backgroundName || '',
    contentHash,
    byteSize: saved.byteSize || existing?.byteSize || 0,
    syncedAt: new Date().toISOString(),
    ...existing,
    ...saved
  };

  session.photos = [nextPhoto, ...(session.photos || []).filter((item) => item.id !== photoId)];
  session.updatedAt = new Date().toISOString();
  db.sessions = db.sessions.map((item) => item.publicSlug === publicSlug ? session : item);
  await writeCloudState(db);

  return json(res, 200, { ok: true, skipped: false, photoId, message: `${photo.code || code} sincronizada.`, photo: nextPhoto });
}

async function handle(req, res) {
  if (req.method === 'OPTIONS') return json(res, 204, {});
  const url = new URL(req.url, PUBLIC_BASE_URL);

  if (url.pathname === '/health') {
    return json(res, 200, {
      ok: true,
      service: 'pictour-cloud-backend-storage',
      version: '4.6.3',
      storage: { driver: STORAGE_DRIVER, localStorageDir: STORAGE_DRIVER === 'local' ? LOCAL_STORAGE_DIR : undefined, bucket: S3_BUCKET || undefined, signedDownloads: true, ttlSeconds: STORAGE_SIGNED_TTL_SECONDS },
      database: { driver: DATABASE_DRIVER },
      mercadoPago: { configured: Boolean(MP_ACCESS_TOKEN), webhookUrl: `${MP_PUBLIC_BASE_URL || PUBLIC_BASE_URL}/webhooks/mercado-pago`, webhookTokenProtected: Boolean(MP_WEBHOOK_TOKEN) },
      licenseServer: { enabled: true, adminUrl: `${PUBLIC_BASE_URL}/admin?token=SEU_TOKEN`, validateUrl: `${PUBLIC_BASE_URL}/api/licenses/validate` },
      updates: { latestVersion: PICTOUR_LATEST_VERSION, feedUrl: `${PUBLIC_BASE_URL}/api/updates/latest` }
    });
  }


  if (req.method === 'GET' && url.pathname === '/api/updates/latest') {
    return json(res, 200, { ok: true, latestVersion: PICTOUR_LATEST_VERSION, downloadUrl: PICTOUR_DOWNLOAD_URL, releaseNotes: PICTOUR_RELEASE_NOTES, checkedAt: new Date().toISOString() });
  }

  if (req.method === 'GET' && (url.pathname === '/admin' || url.pathname === '/admin/licenses')) {
    if (!licenseAdminOk(req, url)) return html(res, 401, '<h1>PicTour Admin</h1><p>Token administrativo inválido. Use /admin?token=SEU_TOKEN.</p>');
    const db = await readCloudState();
    return html(res, 200, licenseAdminHtml(db, url.searchParams.get('token') || LICENSE_ADMIN_TOKEN));
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/overview') return handleAdminOverview(req, res, url);
  if (req.method === 'GET' && url.pathname === '/api/admin/subscriptions') { if (!requireLicenseAdmin(req, res, url)) return; const db = await readCloudState(); return json(res, 200, { ok: true, summary: buildSubscriptionSummary(db), subscriptions: db.subscriptions || [] }); }
  if (req.method === 'POST' && url.pathname === '/api/admin/license-status') return handleAdminLicenseStatus(req, res, url);
  if (req.method === 'POST' && url.pathname === '/api/admin/license-extend') return handleAdminLicenseExtend(req, res, url);
  if (req.method === 'GET' && url.pathname === '/api/admin/export/licenses.csv') return handleAdminLicenseCsv(req, res, url);
  if (req.method === 'GET' && url.pathname === '/api/licenses/admin/list') return handleAdminLicenseList(req, res, url);
  if (req.method === 'POST' && url.pathname === '/api/licenses/admin/upsert') return handleAdminLicenseUpsert(req, res, url);
  if (req.method === 'POST' && url.pathname === '/api/licenses/validate') return handleLicenseValidation(req, res);

  if (req.method === 'GET' && url.pathname === '/api/storage-info') {
    if (!authOk(req) && !licenseAdminOk(req, url)) return json(res, 401, { ok: false, message: 'API key inválida para consultar storage.' });
    const localStats = STORAGE_DRIVER === 'local' ? collectLocalStorageStats() : {};
    return json(res, 200, {
      ok: true,
      message: STORAGE_DRIVER === 'local' ? 'Storage local ativo para desenvolvimento.' : `Storage ${STORAGE_DRIVER.toUpperCase()} configurado para produção.`,
      storage: {
        driver: STORAGE_DRIVER,
        bucket: S3_BUCKET || undefined,
        endpoint: S3_ENDPOINT || undefined,
        publicBaseUrl: STORAGE_PUBLIC_BASE_URL || `${PUBLIC_BASE_URL}/media`,
        signedDownloads: true,
        ttlSeconds: STORAGE_SIGNED_TTL_SECONDS,
        ...localStats
      },
      checkedAt: new Date().toISOString()
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/sync/sales') return handleSyncSales(req, res, url);
  if (req.method === 'POST' && url.pathname === '/api/publish-session') return handlePublishSession(req, res);
  if (req.method === 'POST' && url.pathname === '/api/publish-photo') return handlePublishPhoto(req, res);

  if (req.method === 'POST' && url.pathname.match(/^\/api\/gallery\/[^/]+\/create-checkout$/)) {
    const slug = decodeURIComponent(url.pathname.split('/').filter(Boolean)[2] || '');
    return handleCreateCloudCheckout(req, res, slug);
  }

  if (req.method === 'GET' && url.pathname.match(/^\/api\/gallery\/[^/]+\/checkout\/[^/]+$/)) {
    const parts = url.pathname.split('/').filter(Boolean);
    const slug = decodeURIComponent(parts[2] || '');
    const checkoutId = decodeURIComponent(parts[4] || '');
    return handleCheckoutStatus(req, res, slug, checkoutId, url.searchParams.get('code') || '', url);
  }

  if (req.method === 'GET' && url.pathname.startsWith('/media/')) {
    const key = url.pathname.split('/').filter(Boolean).slice(1).map(decodeURIComponent).join('/');
    const object = await getObject(key);
    if (!object) return text(res, 404, 'Arquivo não encontrado.');
    res.writeHead(200, { 'content-type': object.contentType, 'cache-control': 'public, max-age=31536000, immutable' });
    return res.end(object.buffer);
  }

  if (req.method === 'GET' && url.pathname.startsWith('/g/')) {
    const slug = decodeURIComponent(url.pathname.split('/').filter(Boolean)[1] || '');
    return html(res, 200, publicGalleryHtml(slug));
  }

  if (req.method === 'GET' && url.pathname.startsWith('/api/gallery/')) {
    const parts = url.pathname.split('/').filter(Boolean);
    const slug = decodeURIComponent(parts[2] || '');
    const db = await readCloudState();
    try {
      let session;
      if (parts[3] === 'photo' && parts[5] === 'download' && validateSignedDownload(slug, decodeURIComponent(parts[4] || ''), url)) {
        session = findSession(db, slug);
        if (!session) throw Object.assign(new Error('Galeria não encontrada.'), { status: 404 });
      } else {
        session = requireGalleryAccess(db, slug, url.searchParams.get('code') || '');
      }
      if (parts[3] === 'photo' && parts[5] === 'download') {
        const photo = (session.photos || []).find((item) => item.id === decodeURIComponent(parts[4] || ''));
        if (!photo || photo.status !== 'PURCHASED') return json(res, 404, { ok: false, message: 'Foto não liberada.' });

        if (photo.downloadKey) {
          const object = await getObject(photo.downloadKey);
          if (!object) return json(res, 404, { ok: false, message: 'Arquivo indisponível.' });
          res.writeHead(200, { 'content-type': photo.downloadMimeType || object.contentType, 'content-disposition': `attachment; filename="${photo.code || 'foto'}-pictour.jpg"` });
          return res.end(object.buffer);
        }

        if (photo.downloadDataUrl) {
          const match = String(photo.downloadDataUrl).match(/^data:([^;]+);base64,(.+)$/);
          if (!match) return json(res, 404, { ok: false, message: 'Arquivo indisponível.' });
          const buffer = Buffer.from(match[2], 'base64');
          res.writeHead(200, { 'content-type': match[1], 'content-disposition': `attachment; filename="${photo.code || 'foto'}-pictour.jpg"` });
          return res.end(buffer);
        }

        return json(res, 404, { ok: false, message: 'Arquivo indisponível.' });
      }
      return json(res, 200, {
        ok: true,
        session: { code: session.code, customerName: session.customerName, locationName: session.locationName, publicSlug: session.publicSlug, companyName: session.companyName },
        storage: { driver: STORAGE_DRIVER },
        packages: normalizeCloudPackages(session.packages || [], session.locationName || ''),
        photos: getPublicPhotos(session)
      });
    } catch (error) {
      return json(res, error.status || 500, { ok: false, message: error.message });
    }
  }

  if (req.method === 'POST' && url.pathname.match(/^\/api\/gallery\/[^/]+\/purchase-simulated$/)) {
    if (!ALLOW_SIMULATED_PURCHASES) return json(res, 403, { ok: false, message: 'Compra simulada desativada neste backend. Use Mercado Pago real.' });
    const slug = decodeURIComponent(url.pathname.split('/').filter(Boolean)[2] || '');
    const body = await readBody(req);
    const db = await readCloudState();
    try {
      const session = requireGalleryAccess(db, slug, body.code || '');
      const selected = new Set(Array.isArray(body.photoIds) ? body.photoIds : []);
      const available = new Set((session.photos || []).filter((photo) => photo.status !== 'PURCHASED').map((photo) => photo.id));
      const validPhotoIds = [...selected].filter((id) => available.has(id));
      const selectedPackage = findCloudPackage(session, String(body.packageId || ''));
      const amountCents = calculateCloudPackageTotalCents(selectedPackage, validPhotoIds.length);
      session.photos = (session.photos || []).map((photo) => selected.has(photo.id) ? { ...photo, status: 'PURCHASED', purchasedAt: new Date().toISOString() } : photo);
      session.updatedAt = new Date().toISOString();
      db.sales.unshift({ id: crypto.randomUUID(), publicSlug: slug, checkoutId: null, externalReference: `simulated-${slug}-${Date.now()}`, photoIds: validPhotoIds, method: 'SIMULATED', status: 'APPROVED', packageId: selectedPackage.id, packageName: selectedPackage.name, amountCents, currency: selectedPackage.currency || 'BRL', createdAt: new Date().toISOString() });
      db.sessions = db.sessions.map((item) => item.publicSlug === slug ? session : item);
      await writeCloudState(db);
      return json(res, 200, { ok: true, message: `Compra simulada aprovada com o pacote ${selectedPackage.name}. Fotos liberadas.` });
    } catch (error) {
      return json(res, error.status || 500, { ok: false, message: error.message });
    }
  }

  if ((req.method === 'POST' || req.method === 'GET') && url.pathname === '/webhooks/mercado-pago') {
    if (!verifyWebhookToken(req, url)) return json(res, 401, { ok: false, message: 'Token do webhook inválido.' });
    const body = req.method === 'POST' ? await readBody(req) : {};
    const db = await readCloudState();
    const paymentId = body?.data?.id || body?.id || url.searchParams.get('data.id') || url.searchParams.get('id') || String(url.searchParams.get('resource') || '').split('/').pop();
    const event = { id: crypto.randomUUID(), provider: 'mercado-pago', headers: req.headers, query: Object.fromEntries(url.searchParams.entries()), body, paymentId: paymentId ? String(paymentId) : undefined, receivedAt: new Date().toISOString() };
    db.webhookEvents.unshift(event);

    let sync = { ok: false, message: 'Webhook registrado. Nenhum pagamento para sincronizar.' };
    if (paymentId && MP_ACCESS_TOKEN) {
      try {
        sync = await syncMercadoPagoPayment(db, String(paymentId));
      } catch (error) {
        sync = { ok: false, message: error.message || 'Falha ao consultar pagamento no Mercado Pago.' };
      }
    } else if (paymentId && !MP_ACCESS_TOKEN) {
      sync = { ok: false, message: 'Webhook registrado, mas MP_ACCESS_TOKEN não está configurado para consulta automática.' };
    }

    event.sync = { ok: Boolean(sync.ok), message: sync.message, checkoutId: sync.checkout?.id, releasedCount: sync.releasedCount || 0 };
    await writeCloudState(db);
    return json(res, 200, { ok: true, message: event.sync.message, releasedCount: event.sync.releasedCount });
  }

  return text(res, 404, 'PicTour Cloud Backend: rota não encontrada.');
}

http.createServer((req, res) => {
  handle(req, res).catch((error) => json(res, 500, { ok: false, message: error.message || 'Erro interno.' }));
}).listen(PORT, () => {
  console.log(`PicTour Cloud Backend v4.6.3 em ${PUBLIC_BASE_URL}`);
  console.log(`Storage: ${STORAGE_DRIVER}${STORAGE_DRIVER === 'local' ? ` (${LOCAL_STORAGE_DIR})` : ''}`);
  console.log(`Health: ${PUBLIC_BASE_URL}/health`);
  console.log(`Admin Web: ${PUBLIC_BASE_URL}/admin?token=${LICENSE_ADMIN_TOKEN}`);
});
