import { APP_VERSION } from '../lib/appVersion';
import { useMemo, useState } from 'react';
import { StatCard } from '../components/StatCard';
import { formatMoney } from '../lib/money';
import type { CashierSale, CurrencyCode, DeliveryAccessLog, OnlineCheckout, PackageOption, Photo, PhotoSession } from '../lib/types';

type PeriodKey = 'TODAY' | '7D' | '30D' | 'ALL';

type FunnelBIProps = {
  sessions: PhotoSession[];
  photos: Photo[];
  cashierSales: CashierSale[];
  onlineCheckouts: OnlineCheckout[];
  deliveryAccessLogs?: DeliveryAccessLog[];
  packages: PackageOption[];
  companyName?: string;
};

type FunnelStep = {
  key: string;
  label: string;
  value: number;
  hint: string;
  previousValue?: number;
};

const periodOptions: Array<{ key: PeriodKey; label: string }> = [
  { key: 'TODAY', label: 'Hoje' },
  { key: '7D', label: '7 dias' },
  { key: '30D', label: '30 dias' },
  { key: 'ALL', label: 'Tudo' }
];

function startOfPeriod(period: PeriodKey) {
  if (period === 'ALL') return null;
  const date = new Date();
  if (period === 'TODAY') {
    date.setHours(0, 0, 0, 0);
    return date;
  }
  date.setDate(date.getDate() - (period === '7D' ? 7 : 30));
  return date;
}

function isInsidePeriod(value: string | undefined, period: PeriodKey) {
  const start = startOfPeriod(period);
  if (!start) return true;
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date >= start;
}

function pct(value: number, total: number) {
  if (!total || total <= 0) return '0%';
  return `${Math.round((value / total) * 100)}%`;
}

function decimalPct(value: number, total: number) {
  if (!total || total <= 0) return '0,0%';
  return `${((value / total) * 100).toFixed(1).replace('.', ',')}%`;
}

function safeCurrency(sales: CashierSale[]): CurrencyCode {
  return (sales[0]?.currency || 'BRL') as CurrencyCode;
}

function shortDate(value?: string) {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  } catch {
    return value;
  }
}

function normalizeMethod(method: string) {
  const labels: Record<string, string> = {
    PIX_ONLINE: 'Pix online',
    CREDIT_CARD_ONLINE: 'Cartão online',
    DEBIT_CARD_ONLINE: 'Débito online',
    CASH: 'Dinheiro',
    MANUAL_PIX: 'Pix manual',
    EXTERNAL_CARD_MACHINE: 'Maquininha'
  };
  return labels[method] || method;
}

function buildCsv(rows: Array<Record<string, string | number>>) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = (value: string | number) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  return [headers.join(','), ...rows.map((row) => headers.map((header) => escape(row[header])).join(','))].join('\n');
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function FunnelBI({ sessions, photos, cashierSales, onlineCheckouts, deliveryAccessLogs = [], packages, companyName }: FunnelBIProps) {
  const [period, setPeriod] = useState<PeriodKey>('30D');
  const [location, setLocation] = useState('ALL');

  const locations = useMemo(() => ['ALL', ...Array.from(new Set(sessions.map((session) => session.locationName).filter(Boolean)))], [sessions]);

  const data = useMemo(() => {
    const periodSessions = sessions.filter((session) => isInsidePeriod(session.createdAt, period));
    const locationSessions = periodSessions.filter((session) => location === 'ALL' || session.locationName === location);
    const sessionCodes = new Set(locationSessions.map((session) => session.code));

    const sessionPhotos = photos.filter((photo) => sessionCodes.has(photo.sessionCode));
    const importedPhotos = sessionPhotos.length;
    const selectedPhotos = sessionPhotos.filter((photo) => photo.selected || photo.status === 'SELECTED' || photo.status === 'PURCHASED').length;
    const purchasedPhotos = sessionPhotos.filter((photo) => photo.status === 'PURCHASED').length;

    const periodSales = cashierSales
      .filter((sale) => sale.saleStatus !== 'CANCELLED')
      .filter((sale) => isInsidePeriod(sale.createdAt, period))
      .filter((sale) => !sale.sessionCode || sessionCodes.has(sale.sessionCode) || location === 'ALL');

    const periodCheckouts = onlineCheckouts
      .filter((checkout) => isInsidePeriod(checkout.createdAt, period))
      .filter((checkout) => sessionCodes.has(checkout.sessionCode) || location === 'ALL');

    const deliveryLogsInPeriod = deliveryAccessLogs
      .filter((log) => isInsidePeriod(log.createdAt, period))
      .filter((log) => !log.sessionCode || sessionCodes.has(log.sessionCode) || location === 'ALL');

    const revenueBaseCents = periodSales.reduce((sum, sale) => sum + (sale.amountBaseCents || sale.amountCents || 0), 0);
    const avgTicketCents = periodSales.length ? Math.round(revenueBaseCents / periodSales.length) : 0;
    const postTourSales = periodSales.filter((sale) => sale.channel === 'POST_TOUR').length;
    const deskSales = periodSales.filter((sale) => sale.channel !== 'POST_TOUR').length;
    const approvedCheckouts = periodCheckouts.filter((checkout) => checkout.status === 'APPROVED').length;
    const pendingCheckouts = periodCheckouts.filter((checkout) => checkout.status === 'PENDING').length;
    const rejectedCheckouts = periodCheckouts.filter((checkout) => checkout.status === 'REJECTED' || checkout.status === 'CANCELLED').length;
    const deliveredSales = periodSales.filter((sale) => sale.deliveryStatus === 'DELIVERED' || sale.deliveredAt || (sale.deliveryDownloadCount || 0) > 0).length;
    const downloadEvents = deliveryLogsInPeriod.filter((log) => log.action === 'DOWNLOAD_PHOTO' || log.action === 'DOWNLOAD_ALL').length;

    const funnel: FunnelStep[] = [
      { key: 'sessions', label: 'Sessões criadas', value: locationSessions.length, hint: 'Base do funil operacional' },
      { key: 'photos', label: 'Fotos capturadas/importadas', value: importedPhotos, previousValue: locationSessions.length, hint: `${importedPhotos} fotos em ${locationSessions.length || 0} sessão(ões)` },
      { key: 'selected', label: 'Fotos selecionadas', value: selectedPhotos, previousValue: importedPhotos, hint: `${decimalPct(selectedPhotos, importedPhotos)} das fotos chegaram em seleção` },
      { key: 'checkout', label: 'Checkouts online criados', value: periodCheckouts.length, previousValue: selectedPhotos, hint: `${approvedCheckouts} aprovado(s), ${pendingCheckouts} pendente(s)` },
      { key: 'paid', label: 'Vendas aprovadas', value: periodSales.length, previousValue: periodCheckouts.length || selectedPhotos, hint: `${deskSales} balcão / ${postTourSales} pós-passeio` },
      { key: 'delivered', label: 'Entregas baixadas', value: deliveredSales, previousValue: periodSales.length, hint: `${downloadEvents} evento(s) de download registrados` }
    ];

    const maxFunnel = Math.max(...funnel.map((item) => item.value), 1);

    const salesByPackage = Array.from(periodSales.reduce((map, sale) => {
      const key = sale.packageName || 'Sem pacote';
      const current = map.get(key) || { name: key, count: 0, revenue: 0, photos: 0 };
      current.count += 1;
      current.revenue += sale.amountBaseCents || sale.amountCents || 0;
      current.photos += sale.photoIds?.length || 0;
      map.set(key, current);
      return map;
    }, new Map<string, { name: string; count: number; revenue: number; photos: number }>()).values())
      .sort((a, b) => b.revenue - a.revenue);

    const salesByMethod = Array.from(periodSales.reduce((map, sale) => {
      const key = normalizeMethod(sale.method);
      const current = map.get(key) || { name: key, count: 0, revenue: 0 };
      current.count += 1;
      current.revenue += sale.amountBaseCents || sale.amountCents || 0;
      map.set(key, current);
      return map;
    }, new Map<string, { name: string; count: number; revenue: number }>()).values())
      .sort((a, b) => b.revenue - a.revenue);

    const dropOffs = funnel.slice(1).map((step, index) => {
      const previous = step.previousValue ?? funnel[index].value;
      return {
        from: funnel[index].label,
        to: step.label,
        lost: Math.max(0, previous - step.value),
        rate: decimalPct(step.value, previous)
      };
    });

    const recentSales = [...periodSales].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 8);

    return {
      sessionCodes,
      locationSessions,
      sessionPhotos,
      periodSales,
      periodCheckouts,
      deliveryLogsInPeriod,
      funnel,
      maxFunnel,
      revenueBaseCents,
      avgTicketCents,
      postTourSales,
      deskSales,
      approvedCheckouts,
      pendingCheckouts,
      rejectedCheckouts,
      deliveredSales,
      downloadEvents,
      salesByPackage,
      salesByMethod,
      dropOffs,
      recentSales,
      currency: safeCurrency(periodSales),
      purchasedPhotos,
      selectedPhotos,
      importedPhotos
    };
  }, [sessions, photos, cashierSales, onlineCheckouts, deliveryAccessLogs, period, location]);

  function exportFunnelCsv() {
    const rows = data.funnel.map((step) => ({
      etapa: step.label,
      quantidade: step.value,
      conversao_sobre_etapa_anterior: step.previousValue === undefined ? '100%' : decimalPct(step.value, step.previousValue),
      observacao: step.hint
    }));
    downloadTextFile(`pictour-funil-${period.toLowerCase()}.csv`, buildCsv(rows));
  }

  function exportSalesCsv() {
    const rows = data.periodSales.map((sale) => ({
      codigo: sale.code,
      sessao: sale.sessionCode || '',
      canal: sale.channel || 'DESK',
      pacote: sale.packageName || '',
      metodo: normalizeMethod(sale.method),
      valor_base: ((sale.amountBaseCents || sale.amountCents || 0) / 100).toFixed(2),
      moeda: sale.currency,
      status_entrega: sale.deliveryStatus || '',
      downloads: sale.deliveryDownloadCount || 0,
      criado_em: sale.createdAt
    }));
    downloadTextFile(`pictour-vendas-bi-${period.toLowerCase()}.csv`, buildCsv(rows.length ? rows : [{ codigo: '', sessao: '', canal: '', pacote: '', metodo: '', valor_base: 0, moeda: '', status_entrega: '', downloads: 0, criado_em: '' }]));
  }

  const bestPackage = data.salesByPackage[0];
  const bottleneck = [...data.dropOffs].sort((a, b) => b.lost - a.lost)[0];

  return (
    <div className="screenStack funnelBI">
      <section className="sectionHeader">
        <div>
          <p className="eyebrow">BI v{APP_VERSION} • Funil comercial</p>
          <h2>Relatórios avançados por conversão</h2>
          <p className="mutedText">Veja onde o dinheiro entra, onde o cliente escapa e quais pacotes/canais puxam o caixa da {companyName || 'operação'}.</p>
        </div>
        <div className="headerActions">
          <button className="ghostButton" type="button" onClick={exportFunnelCsv}>Exportar funil CSV</button>
          <button className="primaryButton" type="button" onClick={exportSalesCsv}>Exportar vendas CSV</button>
        </div>
      </section>

      <section className="panel biFilters">
        <div>
          <label className="fieldLabel">Período</label>
          <div className="pillTabs">
            {periodOptions.map((option) => (
              <button key={option.key} className={period === option.key ? 'active' : ''} type="button" onClick={() => setPeriod(option.key)}>{option.label}</button>
            ))}
          </div>
        </div>
        <div>
          <label className="fieldLabel">Local</label>
          <select className="inputField" value={location} onChange={(event) => setLocation(event.target.value)}>
            {locations.map((item) => <option key={item} value={item}>{item === 'ALL' ? 'Todos os locais' : item}</option>)}
          </select>
        </div>
      </section>

      <section className="statsGrid">
        <StatCard label="Receita no período" value={formatMoney(data.revenueBaseCents, data.currency)} hint={`${data.periodSales.length} venda(s) aprovadas`} />
        <StatCard label="Ticket médio" value={formatMoney(data.avgTicketCents, data.currency)} hint="Receita / vendas aprovadas" />
        <StatCard label="Conversão foto → compra" value={decimalPct(data.purchasedPhotos, data.importedPhotos)} hint={`${data.purchasedPhotos}/${data.importedPhotos} fotos compradas`} />
        <StatCard label="Pós-passeio" value={pct(data.postTourSales, data.periodSales.length)} hint={`${data.postTourSales} venda(s) recuperadas depois`} />
      </section>

      <section className="panel">
        <div className="panelTitleRow">
          <div>
            <p className="eyebrow">Funil ponta a ponta</p>
            <h2>Captura → pagamento → entrega</h2>
          </div>
          <div className="miniInsight">Gargalo: <strong>{bottleneck ? `${bottleneck.from} → ${bottleneck.to}` : 'sem dados'}</strong></div>
        </div>

        <div className="funnelRows">
          {data.funnel.map((step, index) => {
            const width = Math.max(8, Math.round((step.value / data.maxFunnel) * 100));
            const conversion = step.previousValue === undefined ? '100%' : decimalPct(step.value, step.previousValue);
            return (
              <div className="funnelRow" key={step.key}>
                <div className="funnelMeta">
                  <span>{index + 1}</span>
                  <div>
                    <strong>{step.label}</strong>
                    <small>{step.hint}</small>
                  </div>
                </div>
                <div className="funnelBarWrap"><div className="funnelBar" style={{ width: `${width}%` }} /></div>
                <div className="funnelNumbers"><strong>{step.value}</strong><small>{conversion}</small></div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="twoColumnGrid">
        <div className="panelCard">
          <p className="eyebrow">Pacotes</p>
          <h2>Ranking de receita</h2>
          <div className="rankingList">
            {data.salesByPackage.map((item, index) => (
              <div key={item.name}>
                <span>{index + 1}</span>
                <div>
                  <strong>{item.name}</strong>
                  <small>{item.count} venda(s) • {item.photos} foto(s)</small>
                </div>
                <strong>{formatMoney(item.revenue, data.currency)}</strong>
              </div>
            ))}
            {!data.salesByPackage.length && <p className="mutedText">Ainda não há vendas suficientes para ranquear pacotes.</p>}
          </div>
        </div>

        <div className="panelCard">
          <p className="eyebrow">Pagamentos</p>
          <h2>Canais e checkouts</h2>
          <div className="methodGrid">
            {data.salesByMethod.map((item) => (
              <div key={item.name}>
                <span>{item.name}</span>
                <strong>{formatMoney(item.revenue, data.currency)}</strong>
                <small>{item.count} venda(s)</small>
              </div>
            ))}
            {!data.salesByMethod.length && <p className="mutedText">Nenhuma venda aprovada no filtro atual.</p>}
          </div>
          <div className="checkoutHealth">
            <div><strong>{data.approvedCheckouts}</strong><span>Aprovados</span></div>
            <div><strong>{data.pendingCheckouts}</strong><span>Pendentes</span></div>
            <div><strong>{data.rejectedCheckouts}</strong><span>Perdidos</span></div>
          </div>
        </div>
      </section>

      <section className="twoColumnGrid">
        <div className="panelCard insightCard">
          <p className="eyebrow">Leitura executiva</p>
          <h2>O que olhar agora</h2>
          <ul>
            <li><strong>Pacote campeão:</strong> {bestPackage ? `${bestPackage.name} (${formatMoney(bestPackage.revenue, data.currency)})` : 'sem volume ainda'}.</li>
            <li><strong>Principal queda:</strong> {bottleneck ? `${bottleneck.lost} cliente(s)/evento(s) entre ${bottleneck.from} e ${bottleneck.to}` : 'sem gargalo calculável'}.</li>
            <li><strong>Entrega:</strong> {data.deliveredSales}/{data.periodSales.length} venda(s) com download confirmado.</li>
            <li><strong>Próximo teste:</strong> compare oferta “todas as fotos” vs. pacote intermediário no Pós-passeio.</li>
          </ul>
        </div>

        <div className="panelCard">
          <p className="eyebrow">Perdas do funil</p>
          <h2>Onde otimizar</h2>
          <div className="dropOffList">
            {data.dropOffs.map((item) => (
              <div key={`${item.from}-${item.to}`}>
                <span>{item.from} → {item.to}</span>
                <strong>{item.lost}</strong>
                <small>Conversão: {item.rate}</small>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="tablePanel">
        <div className="panelTitleRow">
          <div>
            <p className="eyebrow">Últimas vendas</p>
            <h2>Auditoria comercial rápida</h2>
          </div>
          <span className="miniInsight">Pacotes cadastrados: {packages.length}</span>
        </div>
        <div className="responsiveTable">
          <table>
            <thead>
              <tr>
                <th>Venda</th>
                <th>Sessão</th>
                <th>Canal</th>
                <th>Pacote</th>
                <th>Valor</th>
                <th>Entrega</th>
                <th>Criada em</th>
              </tr>
            </thead>
            <tbody>
              {data.recentSales.map((sale) => (
                <tr key={sale.id}>
                  <td>{sale.code}</td>
                  <td>{sale.sessionCode || '—'}</td>
                  <td>{sale.channel === 'POST_TOUR' ? 'Pós-passeio' : 'Balcão'}</td>
                  <td>{sale.packageName || '—'}</td>
                  <td>{formatMoney(sale.amountBaseCents || sale.amountCents || 0, data.currency)}</td>
                  <td>{sale.deliveryStatus === 'DELIVERED' || sale.deliveredAt ? 'Baixada' : sale.deliveryUrl ? 'Link gerado' : 'Pendente'}</td>
                  <td>{shortDate(sale.createdAt)}</td>
                </tr>
              ))}
              {!data.recentSales.length && (
                <tr><td colSpan={7}>Nenhuma venda no filtro atual.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
