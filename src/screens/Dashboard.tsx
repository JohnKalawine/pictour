import type { CashierSale, Photo, PhotoSession } from '../lib/types';
import { formatMoney } from '../lib/money';
import { StatCard } from '../components/StatCard';

type DashboardProps = {
  sessions: PhotoSession[];
  photos: Photo[];
  cashierSales: CashierSale[];
  syncMessage: string;
};

export function Dashboard({ sessions, photos, cashierSales, syncMessage }: DashboardProps) {
  const totalBase = cashierSales.reduce((sum, sale) => sum + sale.amountBaseCents, 0);
  const openSessions = sessions.filter((session) => session.status === 'OPEN').length;
  const purchasedPhotos = photos.filter((photo) => photo.status === 'PURCHASED').length;
  const postTourSales = cashierSales.filter((sale) => sale.channel === 'POST_TOUR').length;
  const conversion = photos.length > 0 ? Math.round((purchasedPhotos / photos.length) * 100) : 0;

  return (
    <div className="screenStack">
      <section className="statsGrid">
        <StatCard label="Vendas hoje" value={formatMoney(totalBase)} hint="Somando online e presencial" />
        <StatCard label="Sessões abertas" value={String(openSessions)} hint="Prontas para venda" />
        <StatCard label="Fotos importadas" value={String(photos.length)} hint="Biblioteca local deste computador" />
        <StatCard label="Pós-passeio" value={String(postTourSales)} hint="Compras recuperadas depois" />
      </section>

      <section className="panel twoColumns">
        <div>
          <p className="eyebrow">Operação</p>
          <h2>Fila inteligente do dia</h2>
          <div className="timelineList">
            <div><strong>Agora</strong><span>{syncMessage}</span></div>
            {cashierSales.slice(0, 4).map((sale) => (
              <div key={sale.id}>
                <strong>{sale.createdAt}</strong>
                <span>Venda {sale.code} registrada por {sale.sellerName} em {sale.currency}.</span>
              </div>
            ))}
            {!cashierSales.length && <div><strong>--:--</strong><span>Nenhuma venda registrada ainda.</span></div>}
          </div>
        </div>

        <div className="bluePanel">
          <span>Status comercial</span>
          <h2>Operação pronta para demonstração e piloto</h2>
          <p>
            Use o Dashboard como visão rápida do dia: vendas, sessões abertas, fotos importadas e recuperação no pós-passeio. Para roteiro de venda, use a aba Demo Guiada.
          </p>
        </div>
      </section>
    </div>
  );
}
