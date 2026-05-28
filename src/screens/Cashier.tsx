import { useEffect, useMemo, useState } from 'react';
import { formatMoney } from '../lib/money';
import { getSaleCommissionSnapshot, summarizeCommissionByMember } from '../lib/commissions';
import type { AppSettings, AuthUser, CashMovement, CashOperationResult, CashierSale, CashShift, CurrencyCode, PhotoSession, TenderMethod } from '../lib/types';

const methodLabels: Record<string, string> = {
  PIX_ONLINE: 'Pix online',
  CREDIT_CARD_ONLINE: 'Crédito online',
  DEBIT_CARD_ONLINE: 'Débito online',
  CASH: 'Dinheiro',
  MANUAL_PIX: 'Pix manual',
  EXTERNAL_CARD_MACHINE: 'Maquininha externa',
  MIXED: 'Pagamento misto'
};

type PeriodFilter = '1H' | '3H' | 'TODAY' | '7D' | '30D' | 'ALL';
type CashHistoryExportFormat = 'TXT' | 'CSV';

type CashierProps = {
  cashierSales: CashierSale[];
  cashShifts: CashShift[];
  cashMovements: CashMovement[];
  sessions: PhotoSession[];
  settings: AppSettings;
  currentUser: AuthUser;
  canControlCash: boolean;
  canCancelSale: boolean;
  canExportReports: boolean;
  onOpenDataFolder: () => void;
  onExportCsv: (sales: CashierSale[]) => Promise<void>;
  onCreateCloseReport: (sales: CashierSale[], filters: Record<string, string>) => Promise<void>;
  onOpenCashShift: (openingAmountCents: number, note?: string) => Promise<CashOperationResult | void>;
  onRegisterCashWithdrawal: (amountCents: number, reason?: string) => Promise<CashOperationResult | void>;
  onCloseCashShift: (closingAmountCents: number, note?: string, closingChangeFundCents?: number, shiftChange?: boolean) => Promise<CashOperationResult | void>;
  onCancelSale: (saleId: string, reason: string) => Promise<CashOperationResult | void>;
  onMarkSaleDelivered: (input: { saleId: string }) => Promise<void>;
  onExportSaleReceipt: (saleId: string) => Promise<unknown>;
  onExportSalePhotos: (saleId: string) => Promise<unknown>;
  onCreateSaleDelivery: (saleId: string) => Promise<unknown>;
  onOpenSaleDelivery: (saleId: string) => Promise<unknown>;
  onExportCashHistory: (format: CashHistoryExportFormat) => Promise<void>;
};

const periodLabels: Record<PeriodFilter, string> = {
  '1H': 'Última 1h',
  '3H': 'Últimas 3h',
  TODAY: 'Dia todo',
  '7D': '1 semana',
  '30D': '1 mês',
  ALL: 'Tudo'
};

function parseSaleDate(createdAt: string) {
  const parsed = new Date(createdAt);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  const timeMatch = String(createdAt || '').match(/^(\d{1,2}):(\d{2})/);
  if (timeMatch) {
    const fallback = new Date();
    fallback.setHours(Number(timeMatch[1]), Number(timeMatch[2]), 0, 0);
    return fallback;
  }
  return new Date();
}

function isInPeriod(sale: CashierSale, period: PeriodFilter) {
  if (period === 'ALL') return true;
  const now = new Date();
  const saleDate = parseSaleDate(sale.createdAt);
  const diffMs = now.getTime() - saleDate.getTime();
  if (period === '1H') return diffMs <= 60 * 60 * 1000;
  if (period === '3H') return diffMs <= 3 * 60 * 60 * 1000;
  if (period === '7D') return diffMs <= 7 * 24 * 60 * 60 * 1000;
  if (period === '30D') return diffMs <= 30 * 24 * 60 * 60 * 1000;
  return saleDate.toDateString() === now.toDateString();
}

function formatSaleDate(createdAt: string) {
  const parsed = parseSaleDate(createdAt);
  return parsed.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function parseMoneyToCents(value: string) {
  const normalized = value.replace(/\./g, '').replace(',', '.').replace(/[^0-9.]/g, '');
  return Math.max(0, Math.round(Number(normalized || 0) * 100));
}

function centsToInput(cents: number) {
  return String((cents || 0) / 100).replace('.', ',');
}

function isShiftInsideLastDays(shift: CashShift, days: number) {
  const now = Date.now();
  const limitMs = days * 24 * 60 * 60 * 1000;
  const opened = parseSaleDate(shift.openedAt).getTime();
  const closed = shift.closedAt ? parseSaleDate(shift.closedAt).getTime() : opened;
  return now - opened <= limitMs || now - closed <= limitMs || shift.status === 'OPEN';
}

function movementLabel(type: CashMovement['type']) {
  if (type === 'OPENING') return 'Abertura';
  if (type === 'WITHDRAWAL') return 'Sangria';
  if (type === 'SALE_CANCEL') return 'Cancelamento';
  if (type === 'CLOSE') return 'Fechamento';
  return type;
}


function getSaleTenders(sale: CashierSale) {
  if (Array.isArray(sale.tenders) && sale.tenders.length) return sale.tenders;
  return [{ id: `${sale.id || 'sale'}_legacy`, method: sale.method, currency: sale.currency as CurrencyCode, amountCents: Number(sale.amountCents || 0), amountBaseCents: Number(sale.amountBaseCents || 0), label: methodLabels[sale.method] || sale.method }];
}

function getSaleCashDrawerBaseCents(sale: CashierSale) {
  if (sale.saleStatus === 'CANCELLED') return 0;
  const cashPaid = getSaleTenders(sale)
    .filter((tender) => tender.method === 'CASH')
    .reduce((sum, tender) => sum + Number(tender.amountBaseCents || 0), 0);
  const change = Number(sale.changeBaseCents || 0);
  if (cashPaid > 0) return Math.max(0, cashPaid - change);
  return sale.method === 'CASH' ? Math.max(0, Number(sale.amountBaseCents || 0) - change) : 0;
}

function formatTenderSummary(sale: CashierSale) {
  const tenders = getSaleTenders(sale);
  if (!tenders.length) return methodLabels[sale.method] || sale.method;
  const summary = tenders.map((tender) => `${methodLabels[tender.method] || tender.method} ${tender.currency}: ${formatMoney(tender.amountCents, tender.currency as CurrencyCode)}`).join(' + ');
  return sale.changeBaseCents ? `${summary} • Troco ${formatMoney(sale.changeBaseCents)}` : summary;
}

function calculateExpectedShiftAmount(shift: CashShift | undefined, sales: CashierSale[], movements: CashMovement[]) {
  if (!shift) return 0;
  const saleTotal = sales
    .filter((sale) => sale.cashShiftId === shift.id && sale.saleStatus !== 'CANCELLED')
    .reduce((sum, sale) => sum + getSaleCashDrawerBaseCents(sale), 0);
  const withdrawalTotal = movements
    .filter((movement) => movement.shiftId === shift.id && movement.type === 'WITHDRAWAL')
    .reduce((sum, movement) => sum + Number(movement.amountCents || 0), 0);
  return Number(shift.openingAmountCents || 0) + saleTotal - withdrawalTotal;
}

export function Cashier({
  cashierSales,
  cashShifts,
  cashMovements,
  sessions,
  settings,
  currentUser,
  canControlCash,
  canCancelSale,
  canExportReports,
  onOpenDataFolder,
  onExportCsv,
  onCreateCloseReport,
  onOpenCashShift,
  onRegisterCashWithdrawal,
  onCloseCashShift,
  onCancelSale,
  onMarkSaleDelivered,
  onExportSaleReceipt,
  onExportSalePhotos,
  onCreateSaleDelivery,
  onOpenSaleDelivery,
  onExportCashHistory
}: CashierProps) {
  const [sellerFilter, setSellerFilter] = useState('ALL');
  const [sessionFilter, setSessionFilter] = useState('ALL');
  const [methodFilter, setMethodFilter] = useState<'ALL' | TenderMethod>('ALL');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('TODAY');
  const [showCancelled, setShowCancelled] = useState(false);
  const recommendedChangeFundCents = Number(settings.cash?.recommendedChangeFundCents || 50000);
  const [openingAmount, setOpeningAmount] = useState(centsToInput(recommendedChangeFundCents));
  const [openingNote, setOpeningNote] = useState('');
  const [withdrawalAmount, setWithdrawalAmount] = useState('0,00');
  const [withdrawalReason, setWithdrawalReason] = useState('');
  const [closingAmount, setClosingAmount] = useState('0,00');
  const [closingChangeFund, setClosingChangeFund] = useState(centsToInput(recommendedChangeFundCents));
  const [closingNote, setClosingNote] = useState('');
  const [shiftChange, setShiftChange] = useState(false);
  const [cashMessage, setCashMessage] = useState('Controle de caixa pronto.');

  const openShift = useMemo(() => cashShifts.find((shift) => shift.status === 'OPEN'), [cashShifts]);
  const expectedCashAmount = useMemo(() => calculateExpectedShiftAmount(openShift, cashierSales, cashMovements), [cashierSales, cashMovements, openShift]);
  const expectedChangeFundCents = Number(openShift?.openingChangeFundCents ?? openShift?.openingAmountCents ?? recommendedChangeFundCents);

  useEffect(() => {
    if (!openShift) {
      setOpeningAmount(centsToInput(recommendedChangeFundCents));
      setClosingChangeFund(centsToInput(recommendedChangeFundCents));
      return;
    }
    setClosingChangeFund(centsToInput(expectedChangeFundCents));
  }, [expectedChangeFundCents, openShift, recommendedChangeFundCents]);

  const sellerOptions = useMemo(() => [...new Set(cashierSales.map((sale) => sale.sellerName).filter(Boolean))].sort(), [cashierSales]);
  const methodOptions = useMemo(() => [...new Set(cashierSales.flatMap((sale) => [sale.method, ...getSaleTenders(sale).map((tender) => tender.method)]).filter(Boolean))].sort() as TenderMethod[], [cashierSales]);

  const filteredSales = useMemo(() => {
    return cashierSales.filter((sale) => {
      if (!showCancelled && sale.saleStatus === 'CANCELLED') return false;
      if (sellerFilter !== 'ALL' && sale.sellerName !== sellerFilter) return false;
      if (sessionFilter !== 'ALL' && sale.sessionCode !== sessionFilter) return false;
      if (methodFilter !== 'ALL' && sale.method !== methodFilter && !getSaleTenders(sale).some((tender) => tender.method === methodFilter)) return false;
      if (!isInPeriod(sale, periodFilter)) return false;
      return true;
    });
  }, [cashierSales, methodFilter, periodFilter, sellerFilter, sessionFilter, showCancelled]);

  const activeFilteredSales = filteredSales.filter((sale) => sale.saleStatus !== 'CANCELLED');
  const total = activeFilteredSales.reduce((sum, sale) => sum + sale.amountBaseCents, 0);
  const cancelledTotal = filteredSales.filter((sale) => sale.saleStatus === 'CANCELLED').reduce((sum, sale) => sum + sale.amountBaseCents, 0);
  const commissionSummary = useMemo(() => summarizeCommissionByMember(activeFilteredSales, settings), [activeFilteredSales, settings]);
  const foreignCash = activeFilteredSales.filter((sale) => getSaleTenders(sale).some((tender) => tender.method === 'CASH' && tender.currency !== 'BRL'));
  const deskSales = activeFilteredSales.filter((sale) => sale.channel !== 'POST_TOUR').length;
  const postTourSales = activeFilteredSales.filter((sale) => sale.channel === 'POST_TOUR').length;
  const pendingDeliveries = activeFilteredSales.filter((sale) => !sale.deliveredAt).length;
  const deliveredSales = activeFilteredSales.filter((sale) => Boolean(sale.deliveredAt)).length;

  const totalsBySeller = useMemo(() => {
    const map = new Map<string, { seller: string; total: number; count: number }>();
    for (const sale of activeFilteredSales) {
      const seller = sale.sellerName || 'Sem vendedor';
      const current = map.get(seller) || { seller, total: 0, count: 0 };
      current.total += sale.amountBaseCents || 0;
      current.count += 1;
      map.set(seller, current);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [activeFilteredSales]);

  const movementsForOpenShift = useMemo(() => {
    if (!openShift) return [];
    return cashMovements.filter((movement) => movement.shiftId === openShift.id).slice(0, 8);
  }, [cashMovements, openShift]);

  const historyShifts30d = useMemo(() => {
    return [...cashShifts]
      .filter((shift) => isShiftInsideLastDays(shift, 30))
      .sort((a, b) => parseSaleDate(b.openedAt).getTime() - parseSaleDate(a.openedAt).getTime());
  }, [cashShifts]);

  const historyMovementsByShift = useMemo(() => {
    const map = new Map<string, CashMovement[]>();
    for (const movement of cashMovements) {
      if (!movement.shiftId) continue;
      const list = map.get(movement.shiftId) || [];
      list.push(movement);
      map.set(movement.shiftId, list);
    }
    for (const [key, list] of map.entries()) {
      map.set(key, list.sort((a, b) => parseSaleDate(a.createdAt).getTime() - parseSaleDate(b.createdAt).getTime()));
    }
    return map;
  }, [cashMovements]);

  const filterPayload = { vendedor: sellerFilter, sessao: sessionFilter, metodo: methodFilter, periodo: periodFilter, canceladas: showCancelled ? 'sim' : 'nao' };

  async function handleOpenShift() {
    const openingCents = parseMoneyToCents(openingAmount);
    if (settings.cash?.requireOpeningChangeFund !== false && openingCents <= 0) {
      setCashMessage('Informe obrigatoriamente o fundo de troco para abrir o caixa. Recomendado: R$500,00.');
      return;
    }
    const result = await onOpenCashShift(openingCents, openingNote);
    if (result?.message) setCashMessage(result.message);
    if (result?.ok) {
      setOpeningAmount(centsToInput(recommendedChangeFundCents));
      setOpeningNote('');
    }
  }

  async function handleWithdrawal() {
    const result = await onRegisterCashWithdrawal(parseMoneyToCents(withdrawalAmount), withdrawalReason);
    if (result?.message) setCashMessage(result.message);
    if (result?.ok) {
      setWithdrawalAmount('0,00');
      setWithdrawalReason('');
    }
  }

  async function handleCloseShift() {
    const amount = parseMoneyToCents(closingAmount) || expectedCashAmount;
    const finalChangeFundCents = parseMoneyToCents(closingChangeFund) || expectedChangeFundCents;
    const fundDiff = finalChangeFundCents - expectedChangeFundCents;
    const note = [closingNote, fundDiff ? `Fundo de troco final diferente da abertura: ${centsToInput(finalChangeFundCents)}.` : 'Fundo de troco final conferido.'].filter(Boolean).join(' ');
    const result = await onCloseCashShift(amount, note, finalChangeFundCents, shiftChange);
    if (result?.message) setCashMessage(result.message);
    if (result?.ok) {
      setClosingAmount('0,00');
      setClosingChangeFund(centsToInput(recommendedChangeFundCents));
      setClosingNote('');
      setShiftChange(false);
    }
  }

  async function handleCancelSale(sale: CashierSale) {
    const reason = window.prompt(`Motivo para cancelar a venda ${sale.code}:`);
    if (!reason) return;
    const result = await onCancelSale(sale.id, reason);
    if (result?.message) setCashMessage(result.message);
  }


  async function handleMarkDelivered(sale: CashierSale) {
    await onMarkSaleDelivered({ saleId: sale.id });
    setCashMessage(`Venda ${sale.code} marcada como entregue.`);
  }

  async function handleExportReceipt(sale: CashierSale) {
    await onExportSaleReceipt(sale.id);
    setCashMessage(`Recibo da venda ${sale.code} processado.`);
  }

  async function handleExportSalePhotos(sale: CashierSale) {
    await onExportSalePhotos(sale.id);
    setCashMessage(`Entrega da venda ${sale.code} processada.`);
  }

  async function handleCreateDelivery(sale: CashierSale) {
    await onCreateSaleDelivery(sale.id);
    setCashMessage(`Link/QR de entrega da venda ${sale.code} pronto.`);
  }

  async function handleOpenDelivery(sale: CashierSale) {
    await onOpenSaleDelivery(sale.id);
    setCashMessage(`Entrega da venda ${sale.code} aberta no navegador.`);
  }

  return (
    <div className="screenStack">
      <section className="statsGrid four">
        <div className="statCard"><span>Total filtrado em BRL</span><strong>{formatMoney(total)}</strong><small>{activeFilteredSales.length} venda(s) ativa(s)</small></div>
        <div className="statCard"><span>Caixa atual</span><strong>{openShift ? openShift.code : 'Fechado'}</strong><small>{openShift ? `Previsto: ${formatMoney(expectedCashAmount)} • Fundo: ${formatMoney(expectedChangeFundCents)}` : `Abra com fundo: ${formatMoney(recommendedChangeFundCents)}`}</small></div>
        <div className="statCard"><span>Canais</span><strong>{deskSales}/{postTourSales}</strong><small>Balcão / Pós-passeio • Entregas: {deliveredSales}/{pendingDeliveries}</small></div>
        <div className="statCard"><span>Comissões</span><strong>{formatMoney(commissionSummary.totalCommissionCents)}</strong><small>{settings.commission?.mode === 'NONE' ? 'Comissão desligada' : `${commissionSummary.members.length} membro(s)`}</small></div>
      </section>

      <section className="panel cashierControlPanel">
        <div className="panelHeader inline">
          <div>
            <p className="eyebrow">Controle de caixa</p>
            <h2>Abertura, sangria e fechamento</h2>
          </div>
          <span className={`pill ${openShift ? 'successPill' : ''}`}>{openShift ? `Aberto por ${openShift.openedBy}` : 'Nenhum caixa aberto'}</span>
        </div>
        <div className="cashControlGrid">
          <div className="cashControlBox">
            <strong>Abrir caixa</strong>
            <small>Fundo de troco obrigatório. Recomendado: {formatMoney(recommendedChangeFundCents)}</small>
            <input value={openingAmount} onChange={(event) => setOpeningAmount(event.target.value)} placeholder={centsToInput(recommendedChangeFundCents)} disabled={!canControlCash || Boolean(openShift)} />
            <input value={openingNote} onChange={(event) => setOpeningNote(event.target.value)} placeholder="Observação inicial" disabled={!canControlCash || Boolean(openShift)} />
            <button className="primaryButton" type="button" onClick={handleOpenShift} disabled={!canControlCash || Boolean(openShift)}>Abrir caixa</button>
          </div>
          <div className="cashControlBox">
            <strong>Sangria</strong>
            <input value={withdrawalAmount} onChange={(event) => setWithdrawalAmount(event.target.value)} placeholder="0,00" disabled={!canControlCash || !openShift} />
            <input value={withdrawalReason} onChange={(event) => setWithdrawalReason(event.target.value)} placeholder="Motivo da sangria" disabled={!canControlCash || !openShift} />
            <button className="ghostButton" type="button" onClick={handleWithdrawal} disabled={!canControlCash || !openShift}>Registrar sangria</button>
          </div>
          <div className="cashControlBox">
            <strong>Fechar caixa</strong>
            <small>Total contado esperado: {formatMoney(expectedCashAmount)}</small>
            <input value={closingAmount} onChange={(event) => setClosingAmount(event.target.value)} onFocus={() => setClosingAmount(centsToInput(expectedCashAmount))} placeholder={centsToInput(expectedCashAmount)} disabled={!canControlCash || !openShift} />
            <small>Fundo de troco final recomendado: {formatMoney(expectedChangeFundCents)}</small>
            <input value={closingChangeFund} onChange={(event) => setClosingChangeFund(event.target.value)} onFocus={() => setClosingChangeFund(centsToInput(expectedChangeFundCents))} placeholder={centsToInput(expectedChangeFundCents)} disabled={!canControlCash || !openShift} />
            <input value={closingNote} onChange={(event) => setClosingNote(event.target.value)} placeholder="Observação final" disabled={!canControlCash || !openShift} />
            <label className="toggleLine noMargin"><input type="checkbox" checked={shiftChange} onChange={(event) => setShiftChange(event.target.checked)} disabled={!canControlCash || !openShift} /> Troca de turno/caixa após este fechamento</label>
            <button className="ghostButton" type="button" onClick={handleCloseShift} disabled={!canControlCash || !openShift}>Fechar caixa</button>
          </div>
        </div>
        <div className="infoBox">{cashMessage}</div>
        {!canControlCash && <div className="infoBox">Seu usuário não possui permissão de abertura, sangria ou fechamento de caixa.</div>}
      </section>

      {openShift && (
        <section className="panel">
          <div className="panelHeader inline"><div><p className="eyebrow">Movimentações</p><h2>Últimos movimentos do caixa aberto</h2></div></div>
          <div className="compactList">
            {movementsForOpenShift.map((movement) => (
              <div key={movement.id} className="listRow listRowStackable">
                <div><strong>{movement.type === 'OPENING' ? 'Abertura' : movement.type === 'WITHDRAWAL' ? 'Sangria' : movement.type === 'SALE_CANCEL' ? 'Cancelamento' : 'Fechamento'}</strong><span>{formatSaleDate(movement.createdAt)} • {movement.operatorName} • {movement.note || '—'}</span></div>
                <strong>{formatMoney(movement.amountCents)}</strong>
              </div>
            ))}
            {!movementsForOpenShift.length && <div className="infoBox">Sem movimentações neste caixa.</div>}
          </div>
        </section>
      )}

      <section className="panel cashierFiltersPanel">
        <div className="panelHeader inline">
          <div><p className="eyebrow">Filtros do caixa</p><h2>Fechamento por vendedor, sessão, método e período</h2></div>
          <div className="actionRow">
            <button className="ghostButton" type="button" disabled={!canExportReports} onClick={() => onExportCsv(filteredSales)}>Exportar CSV</button>
            <button className="ghostButton" type="button" disabled={!canExportReports} onClick={() => onCreateCloseReport(filteredSales, filterPayload)}>Gerar relatório</button>
            <button className="ghostButton" type="button" onClick={onOpenDataFolder}>Abrir pasta de dados</button>
          </div>
        </div>
        <div className="cashierFiltersGrid">
          <label>Vendedor<select value={sellerFilter} onChange={(event) => setSellerFilter(event.target.value)}><option value="ALL">Todos</option>{sellerOptions.map((seller) => <option key={seller} value={seller}>{seller}</option>)}</select></label>
          <label>Sessão<select value={sessionFilter} onChange={(event) => setSessionFilter(event.target.value)}><option value="ALL">Todas</option>{sessions.map((session) => <option key={session.id} value={session.code}>{session.code} — {session.customerName}</option>)}</select></label>
          <label>Forma de pagamento<select value={methodFilter} onChange={(event) => setMethodFilter(event.target.value as 'ALL' | TenderMethod)}><option value="ALL">Todas</option>{methodOptions.map((method) => <option key={method} value={method}>{methodLabels[method] || method}</option>)}</select></label>
          <label>Período<select value={periodFilter} onChange={(event) => setPeriodFilter(event.target.value as PeriodFilter)}>{(['1H', '3H', 'TODAY', '7D', '30D', 'ALL'] as PeriodFilter[]).map((period) => <option key={period} value={period}>{periodLabels[period]}</option>)}</select></label>
          <label className="toggleLine noMargin"><input type="checkbox" checked={showCancelled} onChange={(event) => setShowCancelled(event.target.checked)} /> Mostrar vendas canceladas</label>
        </div>
      </section>

      <section className="panel">
        <div className="panelHeader inline"><div><p className="eyebrow">Resumo</p><h2>Vendedores e cancelamentos</h2></div></div>
        <div className="sellerSummaryGrid">
          {totalsBySeller.map((item) => <article key={item.seller} className="sellerSummaryCard"><span>{item.seller}</span><strong>{formatMoney(item.total)}</strong><small>{item.count} venda(s)</small></article>)}
          <article className="sellerSummaryCard"><span>Canceladas no filtro</span><strong>{formatMoney(cancelledTotal)}</strong><small>{filteredSales.filter((sale) => sale.saleStatus === 'CANCELLED').length} registro(s)</small></article>
        </div>
      </section>

      <section className="panel commissionReportPanel">
        <div className="panelHeader inline"><div><p className="eyebrow">Comissões</p><h2>Resumo de comissão do filtro atual</h2></div><span className="pill">Modo: {settings.commission?.mode === 'INDIVIDUAL' ? 'Individual' : settings.commission?.mode === 'COLLECTIVE' ? 'Coletiva' : 'Sem comissão'}</span></div>
        <div className="sellerSummaryGrid">
          {commissionSummary.members.map((item) => <article key={item.username || item.name} className="sellerSummaryCard"><span>{item.name}</span><strong>{formatMoney(item.amountBaseCents)}</strong><small>{item.saleCount} venda(s) com comissão</small></article>)}
          {!commissionSummary.members.length && <div className="infoBox">Nenhuma comissão calculada no filtro atual.</div>}
        </div>
      </section>

      <section className="tablePanel">
        <table>
          <thead><tr><th>Status</th><th>Entrega</th><th>Data/hora</th><th>Venda</th><th>Sessão</th><th>Vendedor</th><th>Canal</th><th>Método</th><th>Recebido</th><th>Base BRL</th><th>Comissão</th><th>Ação</th></tr></thead>
          <tbody>
            {filteredSales.map((sale) => {
              const commission = getSaleCommissionSnapshot(sale, settings);
              const cancelled = sale.saleStatus === 'CANCELLED';
              return (
                <tr key={sale.id} className={cancelled ? 'cancelledRow' : ''}>
                  <td>{cancelled ? 'Cancelada' : 'Ativa'}</td>
                  <td>{cancelled ? '—' : sale.deliveredAt ? `Entregue ${formatSaleDate(sale.deliveredAt)}` : sale.deliverySlug ? 'Link pronto' : 'Pendente'}</td>
                  <td>{formatSaleDate(sale.createdAt)}</td>
                  <td><strong>{sale.code}</strong>{sale.cashShiftId && <small className="mutedCell"> Caixa</small>}</td>
                  <td>{sale.sessionCode || '—'}</td>
                  <td>{sale.sellerName}</td>
                  <td>{sale.channel === 'POST_TOUR' ? 'Pós-passeio' : 'Balcão'}</td>
                  <td><span title={formatTenderSummary(sale)}>{sale.method === 'MIXED' ? 'Misto' : methodLabels[sale.method]}</span></td>
                  <td><span title={formatTenderSummary(sale)}>{formatMoney(Number(sale.paidBaseCents || sale.amountBaseCents || 0))}{sale.changeBaseCents ? ` / troco ${formatMoney(sale.changeBaseCents)}` : ''}</span></td>
                  <td>{formatMoney(sale.amountBaseCents)}</td>
                  <td>{!cancelled && commission.commissionTotalCents ? formatMoney(commission.commissionTotalCents) : '—'}</td>
                  <td>{cancelled ? <span title={sale.cancelReason}>—</span> : <div className="tableActionStack"><button className="miniButton" type="button" onClick={() => handleExportReceipt(sale)}>Recibo</button><button className="miniButton" type="button" onClick={() => handleCreateDelivery(sale)}>Gerar link</button><button className="miniButton" type="button" onClick={() => handleOpenDelivery(sale)}>Abrir entrega</button><button className="miniButton" type="button" onClick={() => handleExportSalePhotos(sale)}>Exportar pasta</button>{!sale.deliveredAt && <button className="miniButton" type="button" onClick={() => handleMarkDelivered(sale)}>Marcar entregue</button>}<button className="dangerMiniButton" type="button" disabled={!canCancelSale} onClick={() => handleCancelSale(sale)}>Cancelar</button></div>}</td>
                </tr>
              );
            })}
            {!filteredSales.length && <tr><td colSpan={12}>Nenhuma venda encontrada para os filtros atuais.</td></tr>}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <div className="panelHeader inline">
          <div>
            <p className="eyebrow">Histórico de caixas • 30 dias</p>
            <h2>Abertura, movimento de turno, sangria e fechamento</h2>
            <span className="mutedText">O histórico mantém os turnos recentes do PDV, incluindo troca de turno/caixa, movimentos assináveis e divergências.</span>
          </div>
          <div className="actionRow">
            <button className="ghostButton" type="button" disabled={!canExportReports || !historyShifts30d.length} onClick={() => onExportCashHistory('TXT')}>Salvar TXT</button>
            <button className="ghostButton" type="button" disabled={!canExportReports || !historyShifts30d.length} onClick={() => onExportCashHistory('CSV')}>Salvar CSV</button>
          </div>
        </div>
        <div className="compactList">
          {historyShifts30d.map((shift) => {
            const shiftSales = cashierSales.filter((sale) => sale.cashShiftId === shift.id && sale.saleStatus !== 'CANCELLED');
            const shiftMovements = historyMovementsByShift.get(shift.id) || [];
            const withdrawalTotal = shiftMovements.filter((movement) => movement.type === 'WITHDRAWAL').reduce((sum, movement) => sum + Number(movement.amountCents || 0), 0);
            const saleTotal = shiftSales.reduce((sum, sale) => sum + Number(sale.amountBaseCents || 0), 0);
            const cashDrawerTotal = shiftSales.reduce((sum, sale) => sum + getSaleCashDrawerBaseCents(sale), 0);
            const expected = shift.expectedAmountCents ?? calculateExpectedShiftAmount(shift, cashierSales, cashMovements);
            return (
              <div key={shift.id} className="listRow listRowStackable">
                <div>
                  <strong>{shift.code} • {shift.status === 'OPEN' ? 'Aberto' : 'Fechado'}{shift.shiftChangeOnClose ? ' • Troca de turno' : ''}</strong>
                  <span>{shift.cashRegisterName || settings.cash?.cashRegisterName || 'Caixa'} • Abriu: {formatSaleDate(shift.openedAt)} por {shift.openedBy}{shift.closedAt ? ` • fechou: ${formatSaleDate(shift.closedAt)} por ${shift.closedBy || '—'}` : ''}</span>
                  <small>Movimentos: {shiftMovements.map((movement) => `${movementLabel(movement.type)} ${formatMoney(movement.amountCents)}`).join(' • ') || '—'}</small>
                </div>
                <div className="rightAligned">
                  <strong>{formatMoney(expected)}</strong>
                  <span>Vendas: {shiftSales.length} / {formatMoney(saleTotal)} • Dinheiro gaveta: {formatMoney(cashDrawerTotal)} • Sangrias: {formatMoney(withdrawalTotal)}</span>
                  <span>{shift.differenceCents !== undefined ? `Diferença fechamento: ${formatMoney(shift.differenceCents)}` : 'Previsto atual'}</span>
                </div>
              </div>
            );
          })}
          {!historyShifts30d.length && <div className="infoBox">Nenhum caixa encontrado nos últimos 30 dias.</div>}
        </div>
      </section>
    </div>
  );
}
