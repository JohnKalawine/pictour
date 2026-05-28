import { useMemo, useState } from 'react';
import type { LocalDatabase, NavKey } from '../lib/types';
import { formatMoney } from '../lib/money';
import { APP_VERSION_LABEL } from '../lib/appVersion';

type DemoGuideProps = {
  database: LocalDatabase;
  selectedSessionCode: string;
  customerDisplayOpen: boolean;
  onNavigate: (route: NavKey) => void;
  onLoadDemoData: () => Promise<void>;
  onOpenCustomerDisplay: () => Promise<void>;
  onCloseCustomerDisplay: () => Promise<void>;
  onOpenPhotographerPortal: () => Promise<void>;
  onOpenPublicGallery: (sessionCode: string) => Promise<void>;
};

const demoSteps: Array<{
  id: string;
  title: string;
  duration: string;
  route?: NavKey;
  pitch: string;
  show: string;
  result: string;
}> = [
  {
    id: 'overview',
    title: '1. Abrir com visão executiva',
    duration: '45s',
    route: 'dashboard',
    pitch: 'Comece mostrando que o PicTour não é só um editor: ele controla operação, caixa, galeria, entrega e BI.',
    show: 'Dashboard + números gerais da demo.',
    result: 'O gestor entende rápido que o produto resolve operação e venda, não só foto.'
  },
  {
    id: 'photographer',
    title: '2. Fotógrafo envia pelo celular',
    duration: '60s',
    route: 'photographer',
    pitch: 'Mostre o QR do fotógrafo e explique que a equipe externa envia fotos sem cabo, pendrive ou WhatsApp improvisado.',
    show: 'Aba Fotógrafo Web e portal mobile.',
    result: 'Reduz gargalo operacional e deixa a captura parecendo moderna.'
  },
  {
    id: 'capture',
    title: '3. Sessão e captura organizada',
    duration: '60s',
    route: 'capture',
    pitch: 'Mostre sessões abertas, importação/captura e cenários rápidos como fluxo de operação no parque.',
    show: 'Aba Captura com sessão ativa.',
    result: 'O operador não precisa procurar pasta perdida no Windows.'
  },
  {
    id: 'sale',
    title: '4. Checkout modular no balcão',
    duration: '90s',
    route: 'quick-sale',
    pitch: 'Aqui é onde o dinheiro aparece: o cliente pode comprar digital, impressa + digital e porta-retrato na mesma venda.',
    show: 'Venda Rápida com slots e monitor do cliente em grid.',
    result: 'Evita várias vendas separadas e aumenta ticket médio.'
  },
  {
    id: 'gallery',
    title: '5. Galeria premium pós-passeio',
    duration: '75s',
    route: 'post-tour',
    pitch: 'Mostre que o cliente continua comprando depois que saiu do parque, mas só produtos digitais ficam disponíveis online.',
    show: 'Pós-passeio, QR/link e checkout online.',
    result: 'Recupera venda perdida e mantém itens físicos apenas no presencial.'
  },
  {
    id: 'delivery',
    title: '6. Entrega profissional',
    duration: '45s',
    route: 'post-tour',
    pitch: 'Depois do pagamento, o cliente recebe link/QR para baixar fotos compradas sem marca d’água.',
    show: 'Links de entrega e status de download.',
    result: 'Acaba o “manda no WhatsApp depois”. Isso vende confiança.'
  },
  {
    id: 'cashier',
    title: '7. Caixa assinado e auditoria',
    duration: '75s',
    route: 'cashier',
    pitch: 'Mostre abertura, sangria, fechamento, troca de turno e histórico de 30 dias exportável.',
    show: 'Aba Caixa + histórico TXT/CSV.',
    result: 'O gestor percebe controle real de operação, não só foto bonita.'
  },
  {
    id: 'bi',
    title: '8. Fechar com BI de funil',
    duration: '60s',
    route: 'reports',
    pitch: 'Finalize mostrando onde a operação perde dinheiro: captura, seleção, checkout, pagamento e entrega.',
    show: 'BI/Funil com receita, conversão, pacotes e gargalo.',
    result: 'A conversa sai de “software” para “aumentar receita”. Xeque-mate elegante.'
  }
];

function formatPct(value: number, total: number) {
  if (!total) return '0%';
  return `${Math.round((value / total) * 100)}%`;
}

export function DemoGuide({ database, selectedSessionCode, customerDisplayOpen, onNavigate, onLoadDemoData, onOpenCustomerDisplay, onCloseCustomerDisplay, onOpenPhotographerPortal, onOpenPublicGallery }: DemoGuideProps) {
  const [activeStep, setActiveStep] = useState(0);
  const [message, setMessage] = useState('Roteiro pronto. Carregue a demo premium antes de apresentar para um cliente.');

  const metrics = useMemo(() => {
    const activeSales = (database.cashierSales || []).filter((sale) => sale.saleStatus !== 'CANCELLED');
    const revenue = activeSales.reduce((sum, sale) => sum + Number(sale.amountBaseCents || sale.amountCents || 0), 0);
    const purchasedPhotos = database.photos.filter((photo) => photo.status === 'PURCHASED').length;
    const selectedPhotos = database.photos.filter((photo) => photo.selected || photo.status === 'SELECTED' || photo.status === 'PURCHASED').length;
    const openSessions = database.sessions.filter((session) => session.status === 'OPEN').length;
    const postTourSales = activeSales.filter((sale) => sale.channel === 'POST_TOUR').length;
    const delivered = activeSales.filter((sale) => sale.deliveryStatus === 'DELIVERED' || sale.deliveredAt || (sale.deliveryDownloadCount || 0) > 0).length;
    const approvedCheckouts = (database.onlineCheckouts || []).filter((checkout) => checkout.status === 'APPROVED').length;
    const conversion = formatPct(purchasedPhotos, database.photos.length || 1);
    return { activeSales, revenue, purchasedPhotos, selectedPhotos, openSessions, postTourSales, delivered, approvedCheckouts, conversion };
  }, [database]);

  const currentStep = demoSteps[activeStep] || demoSteps[0];
  const selectedSession = database.sessions.find((session) => session.code === selectedSessionCode) || database.sessions.find((session) => session.status === 'OPEN') || database.sessions[0];
  const setup = database.settings.commercialSetup || {};

  async function loadPremiumDemo() {
    await onLoadDemoData();
    setActiveStep(0);
    setMessage('Demo premium carregada. Siga o roteiro pela esquerda e use os botões para abrir cada módulo.');
  }

  async function openGallery() {
    if (!selectedSession?.code) {
      setMessage('Nenhuma sessão disponível para abrir galeria. Carregue a demo primeiro.');
      return;
    }
    await onOpenPublicGallery(selectedSession.code);
    setMessage(`Galeria da sessão ${selectedSession.code} aberta para demonstração.`);
  }

  async function toggleCustomerDisplay() {
    if (customerDisplayOpen) {
      await onCloseCustomerDisplay();
      setMessage('Monitor do cliente fechado.');
      return;
    }
    await onOpenCustomerDisplay();
    setMessage('Monitor do cliente aberto. Use a Venda Rápida para demonstrar grid e total em tempo real.');
  }

  return (
    <div className="screenStack demoGuideScreen">
      <section className="heroPanel demoHero">
        <div>
          <p className="eyebrow">{APP_VERSION_LABEL} • demo comercial guiada</p>
          <h1>Apresente o PicTour como produto pronto para vender</h1>
          <p className="mutedText">Roteiro de 8 etapas com dados fictícios bonitos, KPIs realistas e atalhos para mostrar captura, caixa, galeria, entrega, BI, app mobile e checkout modular sem improviso.</p>
          <div className="actionRow">
            <button className="primaryButton" type="button" onClick={loadPremiumDemo}>Carregar demo premium</button>
            <button className="ghostButton" type="button" onClick={() => onNavigate(currentStep.route || 'dashboard')}>Abrir etapa atual</button>
            <button className="ghostButton" type="button" onClick={toggleCustomerDisplay}>{customerDisplayOpen ? 'Fechar monitor cliente' : 'Abrir monitor cliente'}</button>
          </div>
        </div>
        <aside className="demoHeroCard">
          <span>Tempo sugerido</span>
          <strong>8–10 min</strong>
          <small>{setup.demoModeLoaded ? `Demo carregada ${setup.demoLoadedAt ? new Date(setup.demoLoadedAt).toLocaleString('pt-BR') : ''}` : 'Carregue antes da reunião'}</small>
        </aside>
      </section>

      <section className="statsGrid four demoMetrics">
        <div className="statCard"><span>Receita demo</span><strong>{formatMoney(metrics.revenue, 'BRL')}</strong><small>{metrics.activeSales.length} venda(s) aprovadas</small></div>
        <div className="statCard"><span>Conversão foto → compra</span><strong>{metrics.conversion}</strong><small>{metrics.purchasedPhotos}/{database.photos.length} fotos compradas</small></div>
        <div className="statCard"><span>Pós-passeio</span><strong>{metrics.postTourSales}</strong><small>{metrics.approvedCheckouts} checkout(s) aprovado(s)</small></div>
        <div className="statCard"><span>Entregas</span><strong>{metrics.delivered}</strong><small>downloads/entregas confirmadas</small></div>
      </section>

      <section className="demoGuideGrid">
        <aside className="panel demoStepList">
          <div className="panelTitleRow">
            <div>
              <p className="eyebrow">Roteiro de apresentação</p>
              <h2>Sequência recomendada</h2>
            </div>
          </div>
          {demoSteps.map((step, index) => (
            <button key={step.id} type="button" className={`demoStepButton ${index === activeStep ? 'active' : ''}`} onClick={() => setActiveStep(index)}>
              <span>{index + 1}</span>
              <strong>{step.title.replace(/^\d+\.\s*/, '')}</strong>
              <small>{step.duration}</small>
            </button>
          ))}
        </aside>

        <article className="panel demoCurrentStep">
          <div className="panelTitleRow">
            <div>
              <p className="eyebrow">Etapa atual • {currentStep.duration}</p>
              <h2>{currentStep.title}</h2>
            </div>
            <div className="actionRow compact">
              <button className="ghostButton" type="button" disabled={activeStep === 0} onClick={() => setActiveStep((current) => Math.max(0, current - 1))}>Voltar</button>
              <button className="primaryButton" type="button" onClick={() => setActiveStep((current) => Math.min(demoSteps.length - 1, current + 1))}>Próxima</button>
            </div>
          </div>

          <div className="demoTalkTrack">
            <div>
              <span>Fala sugerida</span>
              <p>{currentStep.pitch}</p>
            </div>
            <div>
              <span>O que mostrar</span>
              <p>{currentStep.show}</p>
            </div>
            <div>
              <span>Resultado percebido</span>
              <p>{currentStep.result}</p>
            </div>
          </div>

          <div className="demoStageMockup">
            <div className="demoBrowserChrome"><span /><span /><span /><strong>PicTour Demo Station</strong></div>
            <div className="demoStageContent">
              <div>
                <p className="eyebrow">Sessão em destaque</p>
                <h3>{selectedSession?.customerName || 'Cliente demo'}</h3>
                <p>{selectedSession?.code || 'PT-DEMO'} • {selectedSession?.locationName || database.settings.locationName}</p>
              </div>
              <div className="demoMiniGrid">
                {database.photos.slice(0, 6).map((photo) => (
                  <div key={photo.id} style={{ backgroundImage: `url(${photo.previewUrl || ''})` }}>
                    <span>{photo.code}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="infoBox">{message}</div>
          <div className="actionRow wrap">
            {currentStep.route && <button className="primaryButton" type="button" onClick={() => onNavigate(currentStep.route!)}>Abrir {currentStep.show}</button>}
            <button className="ghostButton" type="button" onClick={openGallery}>Abrir galeria da sessão</button>
            <button className="ghostButton" type="button" onClick={onOpenPhotographerPortal}>Abrir fotógrafo mobile</button>
            <button className="ghostButton" type="button" onClick={() => onNavigate('reports')}>Abrir BI/Funil</button>
          </div>
        </article>
      </section>

      <section className="panel demoObjectionPanel">
        <div>
          <p className="eyebrow">Respostas rápidas para venda</p>
          <h2>Objeções comuns</h2>
        </div>
        <div className="demoObjectionGrid">
          <article><strong>“E se a internet cair?”</strong><p>O Desktop opera localmente, o app mobile tem fila offline e a cloud entra como camada de venda/entrega quando disponível.</p></article>
          <article><strong>“O cliente pode tirar print?”</strong><p>Preview usa watermark dinâmica, escudo visual, baixa resolução e proteção anti-print. Não é invencível, mas reduz uso indevido.</p></article>
          <article><strong>“Minha equipe troca de caixa.”</strong><p>O Caixa registra abertura, sangria, fechamento, troca de turno e histórico de 30 dias em TXT/CSV.</p></article>
          <article><strong>“Quero vender depois do passeio.”</strong><p>A Galeria Premium abre QR/link com checkout digital e só exibe produtos digitais no online.</p></article>
        </div>
      </section>
    </div>
  );
}
