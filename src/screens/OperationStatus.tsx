import { useMemo } from 'react';
import type { AppPermission, AuthUser, CashierSale, CashMovement, CashShift, LocalDatabase, NavKey, OperationChecklist, Photo, PhotoSession, UpdateSettingsInput } from '../lib/types';
import { formatMoney } from '../lib/money';
import { getLicenseHealth, licenseStatusLabels, planLabels } from '../lib/license';

type OperationStatusProps = {
  database: LocalDatabase;
  currentUser: AuthUser;
  selectedSessionCode: string;
  customerDisplayOpen: boolean;
  syncMessage: string;
  onNavigate: (route: NavKey) => void;
  onOpenCustomerDisplay: () => Promise<void>;
  onCloseCustomerDisplay: () => Promise<void>;
  onUpdateSettings: (input: UpdateSettingsInput) => Promise<void>;
};

type ReadinessItem = {
  id: string;
  label: string;
  detail: string;
  ready: boolean;
  severity?: 'OK' | 'WARN' | 'BLOCK';
  route?: NavKey;
  actionLabel?: string;
};

type ChecklistItem = {
  id: string;
  title: string;
  detail: string;
  autoDone?: boolean;
  route?: NavKey;
};

const launchSteps: ChecklistItem[] = [
  { id: 'company', title: 'Configurar empresa', detail: 'Nome da empresa, local padrão e identidade do PicTour.', route: 'settings' },
  { id: 'location', title: 'Cadastrar local/parque', detail: 'O operador deve só escolher o local, não digitar toda vez.', route: 'settings' },
  { id: 'users', title: 'Cadastrar equipe', detail: 'Gestor, fotógrafos e caixas com permissões corretas.', route: 'settings' },
  { id: 'packages', title: 'Criar produtos/pacotes modulares', detail: 'Ex: Foto Digital online, Impressa + Digital presencial e Porta-retrato somente balcão.', route: 'settings' },
  { id: 'exchange', title: 'Revisar cotações', detail: 'USD, EUR, PYG e ARS com valores do dia.', route: 'settings' },
  { id: 'cash-open', title: 'Abrir caixa', detail: 'Define operador, valor inicial e início do turno.', route: 'cashier' },
  { id: 'session', title: 'Criar sessão piloto', detail: 'Sessão teste para validar captura, venda e pós-passeio.', route: 'sessions' },
  { id: 'photos', title: 'Importar ou capturar fotos', detail: 'Teste com pelo menos algumas fotos reais.', route: 'capture' },
  { id: 'sale', title: 'Registrar venda modular no balcão', detail: 'Adicionar itens com +, preencher slots de foto, validar monitor do cliente e forma de pagamento.', route: 'quick-sale' },
  { id: 'post-tour', title: 'Testar galeria premium digital', detail: 'Publicar galeria, comprar apenas produtos digitais por Pix/cartão e liberar entrega.', route: 'post-tour' },
  { id: 'cash-close', title: 'Fechar caixa, assinar e exportar histórico', detail: 'Conferir diferença, troca de turno, sangrias e histórico dos últimos 30 dias.', route: 'cashier' },
  { id: 'audit', title: 'Conferir auditoria', detail: 'Validar registros das ações sensíveis do piloto.', route: 'audit' }
];

const pilotSteps: ChecklistItem[] = [
  { id: 'pilot-1-manager', title: '1 gestor logado', detail: 'Validar acesso total e troca da senha padrão.' },
  { id: 'pilot-2-staff', title: '2 operadores cadastrados', detail: 'Um fotógrafo e um caixa com permissões limitadas.' },
  { id: 'pilot-3-location', title: '1 parque ativo', detail: 'Usar local real para sessão e pacote.' },
  { id: 'pilot-4-packages', title: '3 pacotes ativos', detail: 'Individual, combo e todas as fotos.' },
  { id: 'pilot-5-photos', title: '30 fotos no piloto', detail: 'Misturar importadas, câmera e chroma quando possível.' },
  { id: 'pilot-6-sales', title: '10 vendas simuladas', detail: 'Balcão modular, Pix manual, dinheiro, cartão externo e galeria digital.' },
  { id: 'pilot-7-cancel', title: '2 cancelamentos com motivo', detail: 'Conferir auditoria e saída do total ativo.' },
  { id: 'pilot-8-withdrawal', title: '1 sangria', detail: 'Validar cálculo do valor previsto.' },
  { id: 'pilot-9-cloud', title: '1 compra online aprovada', detail: 'Publicar sessão, pagar Pix/cartão na galeria digital e liberar entrega automaticamente.' },
  { id: 'pilot-10-close', title: '1 fechamento sem divergência', detail: 'Exportar CSV/JSON e conferir comissão.' }
];

function hasActiveCashShift(cashShifts: CashShift[] = []) {
  return cashShifts.some((shift) => shift.status === 'OPEN');
}

function activeSales(sales: CashierSale[] = []) {
  return sales.filter((sale) => sale.saleStatus !== 'CANCELLED');
}

function cancelledSales(sales: CashierSale[] = []) {
  return sales.filter((sale) => sale.saleStatus === 'CANCELLED');
}

function withdrawals(movements: CashMovement[] = []) {
  return movements.filter((movement) => movement.type === 'WITHDRAWAL');
}

function canUserAccess(user: AuthUser, permission: AppPermission) {
  if (user.role === 'MANAGER') return true;
  if (user.adminPermissions) return true;
  return Boolean(user.permissions?.[permission]);
}

function statusPillClass(ready: boolean, severity?: 'OK' | 'WARN' | 'BLOCK') {
  if (ready) return 'operationPill ok';
  if (severity === 'BLOCK') return 'operationPill block';
  return 'operationPill warn';
}

function checklistCompleted(checklist: OperationChecklist | undefined, id: string) {
  return Boolean(checklist?.completedItemIds?.includes(id));
}

export function OperationStatus({ database, currentUser, selectedSessionCode, customerDisplayOpen, syncMessage, onNavigate, onOpenCustomerDisplay, onCloseCustomerDisplay, onUpdateSettings }: OperationStatusProps) {
  const settings = database.settings;
  const checklist = settings.operationChecklist || { completedItemIds: [] };
  const sessions = (database.sessions || []).filter((session) => session.status !== 'CLOSED');
  const photos = database.photos || [];
  const sales = database.cashierSales || [];
  const cashShifts = database.cashShifts || [];
  const cashMovements = database.cashMovements || [];
  const activeSession = sessions.find((session) => session.code === selectedSessionCode) || sessions[0];
  const activeSessionPhotos = activeSession ? photos.filter((photo) => photo.sessionCode === activeSession.code) : [];
  const purchasedPhotos = activeSessionPhotos.filter((photo) => photo.status === 'PURCHASED');
  const openCash = cashShifts.find((shift) => shift.status === 'OPEN');
  const activeSaleList = activeSales(sales);
  const postTourSales = activeSaleList.filter((sale) => sale.channel === 'POST_TOUR');
  const totalActiveBase = activeSaleList.reduce((sum, sale) => sum + sale.amountBaseCents, 0);
  const licenseHealth = getLicenseHealth(settings, database);

  const readiness = useMemo<ReadinessItem[]>(() => {
    const activeLocations = (settings.locations || []).filter((location) => location.active !== false);
    const activeUsers = (settings.users || []).filter((user) => user.active !== false);
    const activePackages = (settings.packages || []).filter((packageOption) => packageOption.active !== false);
    return [
      {
        id: 'license',
        label: 'Licença válida',
        detail: licenseHealth.ready
          ? `${planLabels[licenseHealth.license.plan]} • ${licenseStatusLabels[licenseHealth.license.status]}${licenseHealth.daysLeft === null ? '' : ` • ${licenseHealth.daysLeft} dia(s)`}`
          : `${licenseStatusLabels[licenseHealth.license.status]} ou limite excedido. Usuários ${licenseHealth.activeUsers}/${licenseHealth.license.maxUsers}, locais ${licenseHealth.activeLocations}/${licenseHealth.license.maxLocations}, fotos/mês ${licenseHealth.photosThisMonth}/${licenseHealth.license.monthlyPhotoLimit}.`,
        ready: licenseHealth.ready,
        route: 'settings',
        severity: 'BLOCK'
      },
      {
        id: 'company',
        label: 'Empresa configurada',
        detail: settings.companyName ? `Empresa: ${settings.companyName}` : 'Informe o nome da empresa em Configurações.',
        ready: Boolean(settings.companyName?.trim()),
        route: 'settings'
      },
      {
        id: 'locations',
        label: 'Locais/parques ativos',
        detail: activeLocations.length ? `${activeLocations.length} local(is) disponível(is).` : 'Cadastre pelo menos um parque/local.',
        ready: activeLocations.length > 0,
        route: 'settings',
        severity: 'BLOCK'
      },
      {
        id: 'users',
        label: 'Equipe cadastrada',
        detail: activeUsers.length ? `${activeUsers.length} usuário(s) ativo(s).` : 'Cadastre usuários de operação.',
        ready: activeUsers.length > 0,
        route: 'settings'
      },
      {
        id: 'packages',
        label: 'Pacotes de venda',
        detail: activePackages.length ? `${activePackages.length} pacote(s) ativo(s).` : 'Cadastre pacotes por local/parque.',
        ready: activePackages.length > 0,
        route: 'settings',
        severity: 'BLOCK'
      },
      {
        id: 'cash',
        label: 'Caixa aberto',
        detail: openCash ? `Caixa ${openCash.code} aberto por ${openCash.openedBy}. Fundo de troco: R$ ${((openCash.openingChangeFundCents ?? openCash.openingAmountCents ?? 0) / 100).toFixed(2)}.` : 'Abra o caixa antes de começar vendas presenciais.',
        ready: Boolean(openCash),
        route: 'cashier',
        severity: 'WARN'
      },
      {
        id: 'session',
        label: 'Sessão ativa',
        detail: activeSession ? `${activeSession.code} • ${activeSession.locationName}` : 'Crie ou selecione uma sessão.',
        ready: Boolean(activeSession),
        route: 'sessions',
        severity: 'BLOCK'
      },
      {
        id: 'photos',
        label: 'Fotos na sessão',
        detail: activeSessionPhotos.length ? `${activeSessionPhotos.length} foto(s) na sessão atual.` : 'Importe ou capture fotos para vender.',
        ready: activeSessionPhotos.length > 0,
        route: 'capture',
        severity: 'BLOCK'
      },
      {
        id: 'display',
        label: 'Monitor do cliente',
        detail: customerDisplayOpen ? 'Aberto e sincronizando automaticamente.' : 'Fechado. Abra quando for apresentar fotos no balcão.',
        ready: customerDisplayOpen,
        route: 'quick-sale',
        severity: 'WARN'
      },
      {
        id: 'cloud',
        label: 'Cloud/galeria',
        detail: settings.cloud?.enabled ? `Cloud ativa: ${settings.cloud.apiBaseUrl || 'sem URL'}` : 'Desativada. Pode vender localmente, mas QR fora do Wi-Fi depende da cloud.',
        ready: Boolean(settings.cloud?.enabled && settings.cloud.apiBaseUrl),
        route: 'settings',
        severity: 'WARN'
      },
      {
        id: 'mp',
        label: 'Mercado Pago',
        detail: settings.mercadoPago?.enabled ? `Ativo em ${settings.mercadoPago.environment}.` : 'Desativado. Pagamentos online reais dependem dessa configuração.',
        ready: Boolean(settings.mercadoPago?.enabled && settings.mercadoPago.accessToken),
        route: 'settings',
        severity: 'WARN'
      }
    ];
  }, [activeSession, activeSessionPhotos.length, customerDisplayOpen, openCash, settings, database.photos?.length]);

  const blockers = readiness.filter((item) => !item.ready && item.severity === 'BLOCK').length;
  const warnings = readiness.filter((item) => !item.ready && item.severity !== 'BLOCK').length;
  const readinessScore = readiness.length ? Math.round((readiness.filter((item) => item.ready).length / readiness.length) * 100) : 0;
  const canSell = blockers === 0;
  const selectedLaunchDone = launchSteps.filter((item) => item.autoDone || checklistCompleted(checklist, item.id)).length;
  const selectedPilotDone = pilotSteps.filter((item) => item.autoDone || checklistCompleted(checklist, item.id)).length;

  const launchStepsWithAuto = launchSteps.map((item) => {
    const autoMap: Record<string, boolean> = {
      company: Boolean(settings.companyName?.trim()),
      location: Boolean((settings.locations || []).some((location) => location.active !== false)),
      users: Boolean((settings.users || []).filter((user) => user.active !== false).length >= 1),
      packages: Boolean((settings.packages || []).filter((packageOption) => packageOption.active !== false).length >= 1),
      exchange: Boolean(settings.exchangeRates?.USD && settings.exchangeRates?.EUR && settings.exchangeRates?.PYG && settings.exchangeRates?.ARS),
      'cash-open': hasActiveCashShift(cashShifts),
      session: Boolean(activeSession),
      photos: activeSessionPhotos.length > 0,
      sale: activeSaleList.length > 0,
      'post-tour': postTourSales.length > 0 || Boolean(activeSession?.cloudPublishedAt),
      'cash-close': cashShifts.some((shift) => shift.status === 'CLOSED'),
      audit: (database.auditLogs || []).length > 0
    };
    return { ...item, autoDone: autoMap[item.id] };
  });

  const pilotStepsWithAuto = pilotSteps.map((item) => {
    const autoMap: Record<string, boolean> = {
      'pilot-1-manager': Boolean((settings.users || []).some((user) => user.role === 'MANAGER' && user.active !== false)),
      'pilot-2-staff': (settings.users || []).filter((user) => user.role === 'STAFF' && user.active !== false).length >= 2,
      'pilot-3-location': (settings.locations || []).filter((location) => location.active !== false).length >= 1,
      'pilot-4-packages': (settings.packages || []).filter((packageOption) => packageOption.active !== false).length >= 3,
      'pilot-5-photos': photos.length >= 30,
      'pilot-6-sales': activeSaleList.length >= 10,
      'pilot-7-cancel': cancelledSales(sales).length >= 2,
      'pilot-8-withdrawal': withdrawals(cashMovements).length >= 1,
      'pilot-9-cloud': postTourSales.length >= 1,
      'pilot-10-close': cashShifts.some((shift) => shift.status === 'CLOSED' && Math.abs(shift.differenceCents || 0) === 0)
    };
    return { ...item, autoDone: autoMap[item.id] };
  });

  async function toggleChecklist(id: string, completed: boolean) {
    const currentIds = new Set(checklist.completedItemIds || []);
    if (completed) currentIds.add(id); else currentIds.delete(id);
    await onUpdateSettings({
      actorUsername: currentUser.username,
      operationChecklist: {
        ...checklist,
        completedItemIds: Array.from(currentIds),
        updatedAt: new Date().toISOString()
      }
    });
  }

  async function resetChecklist() {
    await onUpdateSettings({
      actorUsername: currentUser.username,
      operationChecklist: {
        completedItemIds: [],
        dismissedOnboarding: false,
        updatedAt: new Date().toISOString()
      }
    });
  }

  const canOpenDisplay = canUserAccess(currentUser, 'QUICK_SALE') && activeSessionPhotos.length > 0;

  return (
    <div className="screenStack operationScreen">
      <section className="operationHero">
        <div>
          <p className="eyebrow">Centro de comando</p>
          <h2>{canSell ? 'Operação pronta para vender' : 'Operação quase pronta'}</h2>
          <p>{blockers ? `${blockers} bloqueio(s) impedem a venda fluida. Resolva antes do piloto real.` : 'Sem bloqueios críticos. Agora é testar como balcão de verdade.'}</p>
        </div>
        <div className="operationScoreCard">
          <span>Prontidão</span>
          <strong>{readinessScore}%</strong>
          <small>{warnings} aviso(s) • {blockers} bloqueio(s)</small>
        </div>
      </section>

      <section className="statsGrid compactStats">
        <div className="statCard"><span>Caixa</span><strong>{openCash ? 'Aberto' : 'Fechado'}</strong><small>{openCash ? `${openCash.code} • Fundo R$ ${((openCash.openingChangeFundCents ?? openCash.openingAmountCents ?? 0) / 100).toFixed(2)}` : 'Abra antes do turno'}</small></div>
        <div className="statCard"><span>Sessão ativa</span><strong>{activeSession?.code || '--'}</strong><small>{activeSessionPhotos.length} foto(s)</small></div>
        <div className="statCard"><span>Monitor cliente</span><strong>{customerDisplayOpen ? 'Aberto' : 'Fechado'}</strong><small>{customerDisplayOpen ? 'Sync automático' : 'Abra na venda'}</small></div>
        <div className="statCard"><span>Vendas ativas</span><strong>{formatMoney(totalActiveBase)}</strong><small>{activeSaleList.length} venda(s)</small></div>
        <div className="statCard"><span>Licença</span><strong>{licenseStatusLabels[licenseHealth.license.status]}</strong><small>{planLabels[licenseHealth.license.plan]} • {licenseHealth.daysLeft === null ? 'sem validade' : `${licenseHealth.daysLeft} dia(s)`}</small></div>
      </section>

      <section className="panel operationQuickActions">
        <div className="panelHeader inline">
          <div>
            <p className="eyebrow">Atalhos guiados</p>
            <h2>O que fazer agora</h2>
          </div>
          <span className="mutedText">{syncMessage}</span>
        </div>
        <div className="operationActionGrid">
          <button type="button" onClick={() => onNavigate('settings')}>Configurar empresa</button>
          <button type="button" onClick={() => onNavigate('cashier')}>Abrir/fechar caixa</button>
          <button type="button" onClick={() => onNavigate('sessions')}>Criar sessão</button>
          <button type="button" onClick={() => onNavigate('capture')}>Capturar/importar fotos</button>
          <button type="button" onClick={() => onNavigate('quick-sale')}>Vender no balcão</button>
          <button type="button" onClick={() => onNavigate('post-tour')}>Publicar pós-passeio</button>
          <button type="button" onClick={() => onNavigate('audit')}>Conferir auditoria</button>
          <button type="button" disabled={!canOpenDisplay && !customerDisplayOpen} onClick={customerDisplayOpen ? onCloseCustomerDisplay : onOpenCustomerDisplay}>{customerDisplayOpen ? 'Fechar monitor' : 'Abrir monitor'}</button>
        </div>
      </section>

      <section className="operationGridTwo">
        <div className="panel">
          <div className="panelHeader inline">
            <div>
              <p className="eyebrow">Checklist de prontidão</p>
              <h2>Antes de vender no balcão</h2>
            </div>
            <strong>{readinessScore}%</strong>
          </div>
          <div className="operationReadinessList">
            {readiness.map((item) => (
              <div key={item.id} className="operationReadinessItem">
                <div>
                  <strong>{item.label}</strong>
                  <span>{item.detail}</span>
                </div>
                <div className="operationItemActions">
                  <span className={statusPillClass(item.ready, item.severity)}>{item.ready ? 'OK' : item.severity === 'BLOCK' ? 'Bloqueio' : 'Aviso'}</span>
                  {item.route && <button type="button" className="miniButton" onClick={() => onNavigate(item.route!)}>Abrir</button>}
                </div>
              </div>
            ))}
          </div>
        </div>

      </section>

      <section className="operationGridTwo">
        <ChecklistPanel
          title="Onboarding de primeiro uso"
          subtitle="Deixa uma empresa nova pronta para operar sem depender de alguém decorando o fluxo."
          doneCount={launchStepsWithAuto.filter((item) => item.autoDone || checklistCompleted(checklist, item.id)).length}
          items={launchStepsWithAuto}
          checklist={checklist}
          onToggle={toggleChecklist}
          onNavigate={onNavigate}
        />
        <ChecklistPanel
          title="Checklist do piloto real"
          subtitle="Teste de campo controlado para achar gargalos antes do primeiro cliente pagante."
          doneCount={pilotStepsWithAuto.filter((item) => item.autoDone || checklistCompleted(checklist, item.id)).length}
          items={pilotStepsWithAuto}
          checklist={checklist}
          onToggle={toggleChecklist}
          onNavigate={onNavigate}
        />
      </section>

      <section className="panel operationFooterPanel">
        <div>
          <p className="eyebrow">Governança</p>
          <h2>Regra de ouro do piloto</h2>
          <p className="mutedParagraph">Se caixa, venda modular, galeria digital, entrega, comprovantes assinados, exportação 30 dias e auditoria fecharem sem gambiarra, o PicTour está pronto para demonstração comercial e piloto real.</p>
        </div>
        <button type="button" className="ghostButton" onClick={resetChecklist}>Resetar checklists manuais</button>
      </section>
    </div>
  );
}

function ChecklistPanel({ title, subtitle, items, doneCount, checklist, onToggle, onNavigate }: {
  title: string;
  subtitle: string;
  items: ChecklistItem[];
  doneCount: number;
  checklist: OperationChecklist;
  onToggle: (id: string, completed: boolean) => Promise<void>;
  onNavigate: (route: NavKey) => void;
}) {
  return (
    <div className="panel operationChecklistPanel">
      <div className="panelHeader inline">
        <div>
          <p className="eyebrow">{doneCount}/{items.length} concluído(s)</p>
          <h2>{title}</h2>
          <span className="mutedText">{subtitle}</span>
        </div>
      </div>
      <div className="operationChecklistList">
        {items.map((item) => {
          const manualDone = checklistCompleted(checklist, item.id);
          const completed = Boolean(item.autoDone || manualDone);
          return (
            <div key={item.id} className={`operationChecklistItem ${completed ? 'done' : ''}`}>
              <button
                type="button"
                className="checkBubble"
                onClick={() => onToggle(item.id, !manualDone)}
                title={item.autoDone ? 'Concluído automaticamente pelo estado do sistema' : 'Marcar/desmarcar manualmente'}
              >
                {completed ? '✓' : ''}
              </button>
              <div>
                <strong>{item.title}</strong>
                <span>{item.detail}</span>
                {item.autoDone && <small>Concluído automaticamente pelo sistema</small>}
              </div>
              {item.route && <button type="button" className="miniButton" onClick={() => onNavigate(item.route!)}>Ir</button>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
