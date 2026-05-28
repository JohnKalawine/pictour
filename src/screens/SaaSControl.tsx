import { useMemo, useState } from 'react';
import type { BillingCycle, BillingProvider, LocalDatabase, LicenseValidationInput, LicenseValidationResult, SubscriptionPlan, SubscriptionStatus, UpdateSettingsInput } from '../lib/types';
import { getLicenseHealth, licenseStatusLabels, planLabels } from '../lib/license';
import { formatMoney } from '../lib/money';
import { APP_VERSION_LABEL } from '../lib/appVersion';

type SaaSControlProps = {
  database: LocalDatabase;
  onValidateLicense: (input?: LicenseValidationInput) => Promise<LicenseValidationResult>;
  onUpdateSettings: (input: UpdateSettingsInput) => Promise<void>;
  onOpenUrl: (url: string) => Promise<void>;
};

const billingLabels = {
  NOT_CONFIGURED: 'Não configurado',
  TRIAL: 'Teste comercial',
  ACTIVE: 'Assinatura ativa',
  PAST_DUE: 'Pagamento atrasado',
  SUSPENDED: 'Suspenso'
};

const subscriptionLabels: Record<SubscriptionStatus, string> = {
  NOT_CONFIGURED: 'Não configurada',
  TRIAL: 'Teste',
  ACTIVE: 'Ativa',
  PAST_DUE: 'Atrasada',
  CANCELLED: 'Cancelada',
  SUSPENDED: 'Suspensa'
};

const providerLabels: Record<BillingProvider, string> = {
  MANUAL: 'Manual / contrato',
  MERCADO_PAGO: 'Mercado Pago recorrente',
  STRIPE: 'Stripe',
  PIX: 'Pix recorrente/manual'
};

function nextBillingLabel(value?: string) {
  if (!value) return 'Sem próxima cobrança';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  const days = Math.ceil((date.getTime() - Date.now()) / 86400000);
  if (days < 0) return `Vencida há ${Math.abs(days)}d`;
  if (days === 0) return 'Vence hoje';
  return `Vence em ${days}d`;
}

export function SaaSControl({ database, onValidateLicense, onUpdateSettings, onOpenUrl }: SaaSControlProps) {
  const settings = database.settings;
  const license = settings.license;
  const cloud = settings.cloud;
  const saas = settings.saas || {};
  const subscription = settings.subscription || {};
  const health = getLicenseHealth(settings, database);
  const [message, setMessage] = useState('Painel SaaS pronto. Configure empresa, licença, assinatura e servidor cloud para validar produção.');
  const [tenantSlug, setTenantSlug] = useState(saas.tenantSlug || '');
  const [adminPanelUrl, setAdminPanelUrl] = useState(saas.adminPanelUrl || `${license?.licenseServerUrl || cloud?.apiBaseUrl || 'http://127.0.0.1:8787'}/admin?token=SEU_TOKEN`);
  const [billingStatus, setBillingStatus] = useState(saas.billingStatus || 'NOT_CONFIGURED');
  const [deviceLimit, setDeviceLimit] = useState(String(saas.deviceLimit || 1));
  const [requireOnlineLicense, setRequireOnlineLicense] = useState(Boolean(saas.requireOnlineLicense));

  const [subscriptionEnabled, setSubscriptionEnabled] = useState(Boolean(subscription.enabled));
  const [subscriptionPlan, setSubscriptionPlan] = useState<SubscriptionPlan>(subscription.plan || license?.plan || 'PRO');
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus>(subscription.status || 'TRIAL');
  const [billingCycle, setBillingCycle] = useState<BillingCycle>(subscription.billingCycle || saas.billingCycle || 'MONTHLY');
  const [provider, setProvider] = useState<BillingProvider>(subscription.provider || 'MANUAL');
  const [monthlyPrice, setMonthlyPrice] = useState(String(Math.round((subscription.monthlyPriceCents ?? 29900) / 100)));
  const [yearlyPrice, setYearlyPrice] = useState(String(Math.round((subscription.yearlyPriceCents ?? 299000) / 100)));
  const [nextBillingAt, setNextBillingAt] = useState(subscription.nextBillingAt || '');
  const [invoiceEmail, setInvoiceEmail] = useState(subscription.invoiceEmail || '');
  const [graceDays, setGraceDays] = useState(String(subscription.graceDays ?? 5));
  const [autoSuspendPastDue, setAutoSuspendPastDue] = useState(subscription.autoSuspendPastDue !== false);

  const cloudBaseUrl = (license?.licenseServerUrl || cloud?.apiBaseUrl || '').replace(/\/$/, '');
  const licenseReady = Boolean(license?.companyId && license?.licenseKey && cloudBaseUrl);
  const activeDevicesHint = useMemo(() => {
    const stationName = settings.multiStation?.stationName || 'Estação principal';
    return `${stationName} • ${APP_VERSION_LABEL}`;
  }, [settings.multiStation?.stationName]);

  const monthlyPriceCents = Math.max(0, Number(monthlyPrice.replace(/\D/g, '') || 0) * 100);
  const yearlyPriceCents = Math.max(0, Number(yearlyPrice.replace(/\D/g, '') || 0) * 100);
  const activeSubscriptionPrice = billingCycle === 'YEARLY' ? yearlyPriceCents : monthlyPriceCents;
  const mrrEquivalent = billingCycle === 'YEARLY' ? Math.round(yearlyPriceCents / 12) : monthlyPriceCents;

  async function saveSaaSSettings() {
    const nextSubscription = {
      ...subscription,
      enabled: subscriptionEnabled,
      plan: subscriptionPlan,
      status: subscriptionStatus,
      billingCycle,
      provider,
      monthlyPriceCents,
      yearlyPriceCents,
      nextBillingAt: nextBillingAt || undefined,
      invoiceEmail: invoiceEmail.trim() || undefined,
      graceDays: Math.max(0, Number(graceDays.replace(/\D/g, '') || 0)),
      autoSuspendPastDue,
      lastInvoiceAt: subscription.lastInvoiceAt,
      lastPaymentAt: subscriptionStatus === 'ACTIVE' ? (subscription.lastPaymentAt || new Date().toISOString()) : subscription.lastPaymentAt
    };

    await onUpdateSettings({
      saas: {
        ...saas,
        tenantSlug: tenantSlug.trim(),
        adminPanelUrl: adminPanelUrl.trim(),
        billingStatus,
        billingCycle,
        deviceLimit: Math.max(1, Number(deviceLimit.replace(/\D/g, '') || 1)),
        requireOnlineLicense
      },
      subscription: nextSubscription
    });
    setMessage('Configurações SaaS e assinatura salvas. A versão atual centraliza plano, ciclo, cobrança, tolerância e suspensão automática.');
  }

  async function validateNow() {
    if (!licenseReady) {
      setMessage('Preencha Company ID, chave de licença e URL do servidor em Configurações antes de validar.');
      return;
    }
    const result = await onValidateLicense({
      companyId: license?.companyId,
      licenseKey: license?.licenseKey,
      licenseServerUrl: cloudBaseUrl
    });
    setMessage(result.message);
  }

  const blockers = [
    !license?.companyId ? 'Empresa SaaS sem Company ID' : '',
    !license?.licenseKey ? 'Chave de licença ausente' : '',
    !cloudBaseUrl ? 'Servidor cloud/licença não configurado' : '',
    subscriptionEnabled && ['PAST_DUE', 'SUSPENDED', 'CANCELLED'].includes(subscriptionStatus) ? `Assinatura ${subscriptionLabels[subscriptionStatus].toLowerCase()}` : '',
    health.expired ? 'Licença expirada ou suspensa' : '',
    health.userLimitExceeded ? 'Limite de usuários excedido' : '',
    health.locationLimitExceeded ? 'Limite de locais excedido' : '',
    health.photoLimitExceeded ? 'Limite mensal de fotos excedido' : ''
  ].filter(Boolean);

  return (
    <div className="screenStack">
      <section className="heroPanel">
        <div>
          <p className="eyebrow">{APP_VERSION_LABEL} • Assinaturas e planos</p>
          <h1>Licenciamento, assinatura e controle de implantação</h1>
          <p>Central para operar o PicTour como produto SaaS vendável: tenant, plano, assinatura, storage cloud, Mercado Pago, check-in de dispositivo e bloqueios comerciais elegantes.</p>
        </div>
        <div className="heroActions">
          <button className="secondaryButton" type="button" onClick={() => adminPanelUrl && onOpenUrl(adminPanelUrl)}>Abrir painel SaaS</button>
          <button className="primaryButton" type="button" onClick={validateNow}>Validar licença agora</button>
        </div>
      </section>

      <section className="panel">
        <div className="sectionHeader">
          <div><p className="eyebrow">Status executivo</p><h2>Saúde da assinatura</h2></div>
          <span className={`statusBadge ${health.ready && !blockers.length ? 'ok' : 'warn'}`}>{health.ready && !blockers.length ? 'Operação liberada' : 'Atenção necessária'}</span>
        </div>
        <div className="statGrid four">
          <div className="statCard"><span>Plano</span><strong>{planLabels[health.license.plan]}</strong><small>{licenseStatusLabels[health.license.status]}</small></div>
          <div className="statCard"><span>Assinatura</span><strong>{subscriptionLabels[subscriptionStatus]}</strong><small>{billingCycle === 'YEARLY' ? 'Anual' : 'Mensal'} • {providerLabels[provider]}</small></div>
          <div className="statCard"><span>MRR equivalente</span><strong>{formatMoney(mrrEquivalent, 'BRL')}</strong><small>{formatMoney(activeSubscriptionPrice, 'BRL')} no ciclo atual</small></div>
          <div className="statCard"><span>Estação</span><strong>{activeDevicesHint}</strong><small>{health.license.lastCheckInAt ? `check-in ${new Date(health.license.lastCheckInAt).toLocaleString('pt-BR')}` : 'sem check-in'}</small></div>
        </div>
        {blockers.length > 0 ? <div className="warningBox"><strong>Bloqueadores:</strong> {blockers.join(' • ')}</div> : <div className="successBox">Licença e assinatura saudáveis. O PicTour pode operar com recursos do plano atual.</div>}
      </section>

      <section className="panel">
        <div className="sectionHeader"><div><p className="eyebrow">{APP_VERSION_LABEL} • Assinatura</p><h2>Plano, ciclo e cobrança</h2></div><span className="statusBadge">{nextBillingLabel(nextBillingAt)}</span></div>
        <div className="formGrid three">
          <label className="checkboxLine"><input type="checkbox" checked={subscriptionEnabled} onChange={(event) => setSubscriptionEnabled(event.target.checked)} /> Controlar assinatura neste Desktop</label>
          <label>Plano<select value={subscriptionPlan} onChange={(event) => setSubscriptionPlan(event.target.value as SubscriptionPlan)}><option value="STARTER">Starter</option><option value="PRO">Pro</option><option value="ENTERPRISE">Enterprise</option></select></label>
          <label>Status<select value={subscriptionStatus} onChange={(event) => setSubscriptionStatus(event.target.value as SubscriptionStatus)}>{Object.entries(subscriptionLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label>Ciclo<select value={billingCycle} onChange={(event) => setBillingCycle(event.target.value as BillingCycle)}><option value="MONTHLY">Mensal</option><option value="YEARLY">Anual</option></select></label>
          <label>Gateway<select value={provider} onChange={(event) => setProvider(event.target.value as BillingProvider)}>{Object.entries(providerLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label>Próxima cobrança<input type="date" value={nextBillingAt} onChange={(event) => setNextBillingAt(event.target.value)} /></label>
          <label>Mensalidade R$<input value={monthlyPrice} onChange={(event) => setMonthlyPrice(event.target.value)} /></label>
          <label>Anualidade R$<input value={yearlyPrice} onChange={(event) => setYearlyPrice(event.target.value)} /></label>
          <label>E-mail financeiro<input value={invoiceEmail} placeholder="financeiro@parque.com" onChange={(event) => setInvoiceEmail(event.target.value)} /></label>
          <label>Tolerância atraso/dias<input value={graceDays} onChange={(event) => setGraceDays(event.target.value)} /></label>
          <label className="checkboxLine"><input type="checkbox" checked={autoSuspendPastDue} onChange={(event) => setAutoSuspendPastDue(event.target.checked)} /> Suspender automaticamente após tolerância</label>
        </div>
        <div className="infoBox">Essa camada já organiza a política comercial do piloto: plano, ciclo, preço, status, tolerância e suspensão. Para venda real, use junto com contrato/assinatura e validação cloud ativa.</div>
      </section>

      <section className="panel">
        <div className="sectionHeader"><div><p className="eyebrow">Configuração SaaS</p><h2>Tenant, cobrança e dispositivos</h2></div></div>
        <div className="formGrid two">
          <label>Slug do cliente/tenant<input value={tenantSlug} placeholder="parque-aventura-foz" onChange={(event) => setTenantSlug(event.target.value)} /></label>
          <label>Status legado de cobrança<select value={billingStatus} onChange={(event) => setBillingStatus(event.target.value as typeof billingStatus)}>{Object.entries(billingLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label>Painel admin SaaS<input value={adminPanelUrl} onChange={(event) => setAdminPanelUrl(event.target.value)} /></label>
          <label>Limite de dispositivos<input value={deviceLimit} onChange={(event) => setDeviceLimit(event.target.value)} /></label>
          <label className="checkboxLine"><input type="checkbox" checked={requireOnlineLicense} onChange={(event) => setRequireOnlineLicense(event.target.checked)} /> Exigir validação online para produção</label>
        </div>
        <div className="actionsRow"><button className="primaryButton" type="button" onClick={saveSaaSSettings}>Salvar política SaaS/assinatura</button></div>
        <div className="infoBox">{message}</div>
      </section>

      <section className="panel">
        <div className="sectionHeader"><div><p className="eyebrow">Fluxo SaaS</p><h2>Como vender e controlar clientes</h2></div></div>
        <div className="timelineList">
          <div><strong>1. Criar empresa no cloud</strong><span>Use o painel admin para registrar tenant, plano, validade e chave.</span></div>
          <div><strong>2. Ativar assinatura</strong><span>Defina ciclo mensal/anual, gateway, preço, próxima cobrança e tolerância.</span></div>
          <div><strong>3. Check-in de dispositivo</strong><span>A estação envia versão, uso mensal e fingerprint do dispositivo.</span></div>
          <div><strong>4. Aplicar limites</strong><span>Usuários, locais, fotos/mês e recursos premium seguem o plano contratado.</span></div>
          <div><strong>5. Operar piloto e renovar</strong><span>O status de assinatura vira bloqueador comercial elegante, sem quebrar dados locais, e ajuda a controlar clientes em teste, ativos ou inadimplentes.</span></div>
        </div>
      </section>
    </div>
  );
}
