import { APP_VERSION } from '../lib/appVersion';
import { useMemo, useState } from 'react';
import type {
  AppSettings,
  CloudPublishSessionInput,
  CloudPublishSessionResult,
  CloudSyncSalesInput,
  CloudSyncSalesResult,
  CheckMercadoPagoCheckoutInput,
  CheckMercadoPagoCheckoutResult,
  CreateMercadoPagoCheckoutInput,
  CreateMercadoPagoCheckoutResult,
  ExportPurchasedPhotosInput,
  OnlineCheckout,
  PackageOption,
  Photo,
  PhotoSession,
  PublicGalleryInfo,
  RegisterManualSaleInput,
  CashierSale
} from '../lib/types';
import { calculatePackageTotalCents, formatMoney, getPackageUnitLabel } from '../lib/money';
import { buildProtectedGalleryUrl, getDaysUntilExpiration } from '../lib/postTour';
import { ProtectedPreview } from '../components/ProtectedPreview';
import { AccessQrCard } from '../components/AccessQrCard';

type PostTourProps = {
  sessions: PhotoSession[];
  selectedSessionCode: string;
  photos: Photo[];
  selectedPackage: PackageOption;
  packageOptions: PackageOption[];
  onlineCheckouts: OnlineCheckout[];
  cashierSales: CashierSale[];
  settings: AppSettings;
  onSessionChange: (sessionCode: string) => void;
  onPackageChange: (packageId: string) => void;
  onTogglePhoto: (photoId: string) => void;
  onSetPhotoSelection: (photoIds: string[], selected: boolean) => Promise<void>;
  onRegisterSale: (input: RegisterManualSaleInput) => Promise<void>;
  onExportPurchasedPhotos: (input: ExportPurchasedPhotosInput) => Promise<void>;
  onCreateMercadoPagoCheckout: (input: CreateMercadoPagoCheckoutInput) => Promise<CreateMercadoPagoCheckoutResult>;
  onCheckMercadoPagoCheckout: (input: CheckMercadoPagoCheckoutInput) => Promise<CheckMercadoPagoCheckoutResult>;
  onOpenExternalUrl: (url: string) => Promise<void>;
  publicGallery?: PublicGalleryInfo;
  onOpenPublicGallery: (sessionCode: string) => Promise<void>;
  onPublishSessionToCloud: (input: CloudPublishSessionInput) => Promise<CloudPublishSessionResult>;
  onSyncCloudSales: (input?: CloudSyncSalesInput) => Promise<CloudSyncSalesResult>;
  onCreateSaleDelivery: (saleId: string) => Promise<unknown>;
  onOpenSaleDelivery: (saleId: string) => Promise<unknown>;
};

export function PostTour({
  sessions,
  selectedSessionCode,
  photos,
  selectedPackage,
  packageOptions,
  onlineCheckouts,
  cashierSales,
  settings,
  onSessionChange,
  onPackageChange,
  onTogglePhoto,
  onSetPhotoSelection,
  onRegisterSale,
  onExportPurchasedPhotos,
  onCreateMercadoPagoCheckout,
  onCheckMercadoPagoCheckout,
  onOpenExternalUrl,
  publicGallery,
  onOpenPublicGallery,
  onPublishSessionToCloud,
  onSyncCloudSales,
  onCreateSaleDelivery,
  onOpenSaleDelivery
}: PostTourProps) {
  const [checkoutMethod, setCheckoutMethod] = useState<'PIX_ONLINE' | 'CREDIT_CARD_ONLINE' | 'DEBIT_CARD_ONLINE'>('PIX_ONLINE');
  const [buyerEmail, setBuyerEmail] = useState('');
  const [copyMessage, setCopyMessage] = useState('Pronto para compartilhar com o cliente.');
  const [downloadMessage, setDownloadMessage] = useState('Fotos compradas ficam disponíveis para exportação local.');
  const [gatewayMessage, setGatewayMessage] = useState('Crie um checkout sandbox para testar Pix/cartão pelo Mercado Pago.');
  const [activeCheckoutId, setActiveCheckoutId] = useState<string>('');
  const [creatingCheckout, setCreatingCheckout] = useState(false);
  const [checkingCheckout, setCheckingCheckout] = useState(false);
  const [publishingCloud, setPublishingCloud] = useState(false);
  const [cloudMessage, setCloudMessage] = useState('Publique a sessão para gerar uma galeria acessível fora do Wi‑Fi.');
  const [syncingCloudSales, setSyncingCloudSales] = useState(false);
  const [cloudSalesMessage, setCloudSalesMessage] = useState('Quando vender pelo celular/cloud, sincronize para trazer a venda ao Caixa local.');

  const hasOpenSessions = sessions.length > 0;
  const activeSession = sessions.find((session) => session.code === selectedSessionCode) ?? sessions[0];
  const pendingPhotos = photos.filter((photo) => photo.status !== 'PURCHASED');
  const purchasedPhotos = photos.filter((photo) => photo.status === 'PURCHASED');
  const deliverySales = useMemo(() => {
    if (!activeSession) return [];
    return cashierSales
      .filter((sale) => sale.saleStatus !== 'CANCELLED' && sale.sessionCode === activeSession.code && (sale.photoIds || []).length)
      .slice(0, 6);
  }, [activeSession, cashierSales]);
  const selectedPhotos = pendingPhotos.filter((photo) => photo.selected);
  const selectedPackageTotalCents = calculatePackageTotalCents(selectedPackage, selectedPhotos.length);
  const galleryUrl = buildProtectedGalleryUrl(activeSession);
  const daysLeft = getDaysUntilExpiration(activeSession?.expiresAt);
  const mercadoPagoSettings = settings.mercadoPago;
  const cloudSettings = settings.cloud;
  const cloudUrl = activeSession?.cloudGalleryUrl || (activeSession?.postTourUrl && !activeSession.postTourUrl.includes('galeria.pictour.app') ? activeSession.postTourUrl : '');
  const cloudProtectedUrl = cloudUrl ? `${cloudUrl}?code=${encodeURIComponent(activeSession?.accessCode || '')}` : '';
  const lastCloudPublish = activeSession?.cloudPublishedAt
    ? new Date(activeSession.cloudPublishedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
    : '';
  const cloudSyncedPhotos = photos.filter((photo) => photo.cloudStatus === 'SYNCED').length;
  const cloudFailedPhotos = photos.filter((photo) => photo.cloudStatus === 'FAILED').length;
  const lastSyncSummary = activeSession?.cloudLastSyncSummary;
  const lastSalesSync = activeSession?.cloudLastSalesSyncAt
    ? new Date(activeSession.cloudLastSalesSyncAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
    : '';


  const sessionCheckouts = useMemo(() => {
    if (!activeSession) return [];
    return onlineCheckouts
      .filter((checkout) => checkout.sessionCode === activeSession.code)
      .slice(0, 5);
  }, [activeSession, onlineCheckouts]);

  const activeCheckout = useMemo(() => {
    return sessionCheckouts.find((checkout) => checkout.id === activeCheckoutId) ?? sessionCheckouts[0];
  }, [activeCheckoutId, sessionCheckouts]);

  const checkoutUrl = activeCheckout?.environment === 'sandbox'
    ? activeCheckout?.sandboxCheckoutUrl || activeCheckout?.checkoutUrl
    : activeCheckout?.checkoutUrl || activeCheckout?.sandboxCheckoutUrl;

  const offerText = useMemo(() => {
    if (!pendingPhotos.length) return 'Todas as fotos desta sessão já foram compradas.';
    if (!selectedPhotos.length) return 'Selecione fotos pendentes ou use “Selecionar pendentes” para montar a compra.';
    return `${selectedPhotos.length} foto(s) selecionada(s) para compra pós-passeio.`;
  }, [pendingPhotos.length, selectedPhotos.length]);

  async function copyGalleryUrl() {
    try {
      await navigator.clipboard.writeText(galleryUrl);
      setCopyMessage('Link copiado para a área de transferência.');
    } catch {
      setCopyMessage('Não consegui copiar automaticamente. Copie o link manualmente.');
    }
  }

  async function openLocalGallery() {
    if (!activeSession) return;
    await onOpenPublicGallery(activeSession.code);
    setCopyMessage('Galeria local aberta no navegador. No celular, use o QR ou o link da rede.');
  }

  async function publishCloudSession() {
    if (!activeSession) return;
    setPublishingCloud(true);
    try {
      const result = await onPublishSessionToCloud({ sessionCode: activeSession.code });
      setCloudMessage(result.message);
      if (result.protectedUrl) {
        setCopyMessage('Sessão publicada. O QR principal agora aponta para a galeria cloud.');
      }
    } finally {
      setPublishingCloud(false);
    }
  }

  async function retryFailedCloudPhotos() {
    if (!activeSession) return;
    setPublishingCloud(true);
    try {
      const result = await onPublishSessionToCloud({ sessionCode: activeSession.code, mode: 'FAILED_ONLY' });
      setCloudMessage(result.message);
    } finally {
      setPublishingCloud(false);
    }
  }


  async function syncCloudSales() {
    if (!activeSession) return;
    setSyncingCloudSales(true);
    try {
      const result = await onSyncCloudSales({ sessionCode: activeSession.code });
      setCloudSalesMessage(result.message);
      if (result.updatedPhotos > 0) {
        setDownloadMessage('Vendas da cloud sincronizadas. Fotos compradas já aparecem liberadas no desktop.');
      }
    } finally {
      setSyncingCloudSales(false);
    }
  }

  async function openCloudGallery() {
    if (!cloudProtectedUrl) {
      setCloudMessage('Publique a sessão na cloud antes de abrir o link público.');
      return;
    }
    await onOpenExternalUrl(cloudProtectedUrl);
    setCloudMessage('Galeria cloud aberta no navegador.');
  }

  async function selectAllPending() {
    await onSetPhotoSelection(pendingPhotos.map((photo) => photo.id), true);
  }

  async function clearPendingSelection() {
    await onSetPhotoSelection(pendingPhotos.map((photo) => photo.id), false);
  }

  async function simulatePostTourPurchase() {
    if (!selectedPhotos.length) {
      alert('Selecione pelo menos uma foto pendente para simular a compra pós-passeio.');
      return;
    }

    await onRegisterSale({
      sessionCode: activeSession.code,
      sellerName: 'Galeria pós-passeio',
      method: checkoutMethod,
      currency: 'BRL',
      amountCents: selectedPackageTotalCents,
      amountBaseCents: selectedPackageTotalCents,
      photoIds: selectedPhotos.map((photo) => photo.id),
      channel: 'POST_TOUR'
    });

    setDownloadMessage('Pagamento aprovado. As fotos compradas já podem ser exportadas/entregues.');
  }

  async function createMercadoPagoCheckout() {
    if (!selectedPhotos.length) {
      setGatewayMessage('Selecione pelo menos uma foto pendente antes de criar o checkout.');
      return;
    }

    setCreatingCheckout(true);
    try {
      const result = await onCreateMercadoPagoCheckout({
        sessionCode: activeSession.code,
        photoIds: selectedPhotos.map((photo) => photo.id),
        packageName: selectedPackage.name,
        amountCents: selectedPackageTotalCents,
        currency: 'BRL',
        buyerEmail: buyerEmail.trim() || undefined
      });

      setGatewayMessage(result.message);
      if (result.checkout) {
        setActiveCheckoutId(result.checkout.id);
        const url = result.checkout.environment === 'sandbox'
          ? result.checkout.sandboxCheckoutUrl || result.checkout.checkoutUrl
          : result.checkout.checkoutUrl || result.checkout.sandboxCheckoutUrl;
        if (url) await onOpenExternalUrl(url);
      }
    } finally {
      setCreatingCheckout(false);
    }
  }

  async function openMercadoPagoCheckout() {
    if (!checkoutUrl) {
      setGatewayMessage('Nenhum link de checkout disponível ainda. Crie um checkout primeiro.');
      return;
    }
    await onOpenExternalUrl(checkoutUrl);
  }

  async function checkMercadoPagoPayment() {
    if (!activeCheckout) {
      setGatewayMessage('Nenhum checkout selecionado para consulta.');
      return;
    }

    setCheckingCheckout(true);
    try {
      const result = await onCheckMercadoPagoCheckout({ checkoutId: activeCheckout.id });
      setGatewayMessage(result.message);
      if (result.status === 'APPROVED') {
        setDownloadMessage('Pagamento aprovado pelo Mercado Pago. Fotos liberadas para exportação.');
      }
    } finally {
      setCheckingCheckout(false);
    }
  }

  async function exportPurchasedPhotos() {
    if (!activeSession) return;
    if (!purchasedPhotos.length) {
      setDownloadMessage('Ainda não há fotos compradas nesta sessão para baixar.');
      return;
    }

    await onExportPurchasedPhotos({
      sessionCode: activeSession.code,
      photoIds: purchasedPhotos.map((photo) => photo.id)
    });
    setDownloadMessage('Exportação solicitada. A pasta de entrega será aberta automaticamente.');
  }

  return (
    <div className="postTourLayout">
      <section className="panel postTourHero">
        <div>
          <p className="eyebrow">Pós-passeio</p>
          <h2>Cloud, pacotes reais, Mercado Pago e sync de vendas</h2>
          <p className="mutedParagraph">
            Compartilhe o QR/link com o cliente no celular, venda depois do passeio e sincronize as compras aprovadas da cloud de volta para o Caixa local.
          </p>
        </div>

        <div className="postTourSelectors">
          <label>
            Sessão
            <select value={selectedSessionCode} onChange={(event) => onSessionChange(event.target.value)} disabled={!hasOpenSessions}>
              {!hasOpenSessions && <option value="">Nenhuma sessão aberta</option>}
              {sessions.map((session) => (
                <option key={session.id} value={session.code}>{session.code} — {session.customerName}</option>
              ))}
            </select>
          </label>
          <label>
            Oferta
            <select value={selectedPackage.id} onChange={(event) => onPackageChange(event.target.value)}>
              {packageOptions.map((packageOption) => (
                <option key={packageOption.id} value={packageOption.id}>{packageOption.name} — {formatMoney(packageOption.priceCents, packageOption.currency)} / {getPackageUnitLabel(packageOption)}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {!hasOpenSessions && (
        <div className="infoBox warnBox">Nenhuma sessão aberta disponível. Vá em Sessões e crie ou reabra uma sessão para usar o pós-passeio.</div>
      )}

      <section className="postTourGrid">
        <div className="panel accessPanel">
          <div className="panelHeader inline">
            <div>
              <p className="eyebrow">Acesso do cliente</p>
              <h2>{activeSession?.customerName ?? 'Cliente'}</h2>
            </div>
            <span className="pill open">{daysLeft} dia(s)</span>
          </div>

          <AccessQrCard url={galleryUrl} accessCode={activeSession?.accessCode} />

          <div className="galleryStatusGrid">
            <div className={`gatewayStatus ${publicGallery?.enabled ? 'enabled' : 'disabled'}`}>
              <strong>{publicGallery?.enabled ? 'Galeria local ativa' : 'Galeria local inativa'}</strong>
              <span>{publicGallery?.primaryUrl || 'Servidor não iniciado'}</span>
            </div>
            <div className={`gatewayStatus ${cloudUrl ? 'enabled' : 'disabled'}`}>
              <strong>{cloudUrl ? 'Galeria cloud publicada' : 'Cloud pendente'}</strong>
              <span>{lastCloudPublish || cloudSettings?.apiBaseUrl || 'Configure a API cloud'}</span>
            </div>
          </div>

          <label className="fieldLabel">Link protegido do QR principal</label>
          <div className="copyLine doubleAction">
            <input value={galleryUrl} readOnly />
            <button className="ghostButton" type="button" onClick={copyGalleryUrl} disabled={!hasOpenSessions}>Copiar</button>
            <button className="ghostButton" type="button" onClick={openLocalGallery} disabled={!hasOpenSessions}>Abrir local</button>
          </div>
          <p className="mutedParagraph noBottom">{copyMessage}</p>

          <div className="cloudPublishBox">
            <div>
              <strong>Publicação cloud</strong>
              <span>{cloudMessage}</span>
            </div>
            <div className="cloudPublishActions">
              <button className="primaryButton" type="button" onClick={publishCloudSession} disabled={!hasOpenSessions || !cloudSettings?.enabled || publishingCloud || !photos.length}>
                {publishingCloud ? 'Publicando...' : 'Publicar sessão'}
              </button>
              <button className="ghostButton" type="button" onClick={openCloudGallery} disabled={!hasOpenSessions || !cloudUrl}>Abrir cloud</button>
              <button className="ghostButton" type="button" onClick={retryFailedCloudPhotos} disabled={!hasOpenSessions || !cloudSettings?.enabled || publishingCloud || !cloudFailedPhotos}>Reenviar falhas</button>
              <button className="ghostButton" type="button" onClick={syncCloudSales} disabled={!hasOpenSessions || !cloudSettings?.enabled || syncingCloudSales || !cloudUrl}>
                {syncingCloudSales ? 'Sincronizando...' : 'Sincronizar vendas'}
              </button>
            </div>
          </div>

          <div className="infoBox">
            {cloudSalesMessage} {lastSalesSync ? `Última sincronização de vendas: ${lastSalesSync}.` : ''}
          </div>

          <div className="postTourStats">
            <div><strong>{photos.length}</strong><span>fotos</span></div>
            <div><strong>{pendingPhotos.length}</strong><span>pendentes</span></div>
            <div><strong>{purchasedPhotos.length}</strong><span>compradas</span></div>
            <div><strong>{cloudSyncedPhotos}</strong><span>sync cloud</span></div>
          </div>

          <div className="infoBox successBox">
            Antes da publicação, o QR usa a galeria local. Depois de publicar, ele usa a galeria cloud. Sync de fotos: {lastSyncSummary ? `${lastSyncSummary.syncedCount} enviadas • ${lastSyncSummary.skippedCount} atualizadas • ${lastSyncSummary.failedCount} falhas` : 'ainda não publicado'}. {cloudFailedPhotos ? `${cloudFailedPhotos} foto(s) precisam reenviar.` : 'Tudo limpo por enquanto.'}
          </div>
        </div>

        <div className="panel customerGalleryPreview">
          <div className="panelHeader inline">
            <div>
              <p className="eyebrow">Preview do cliente</p>
              <h2>Preview interno</h2>
            </div>
            <strong>{formatMoney(selectedPackageTotalCents, 'BRL')}</strong>
          </div>

          <div className="customerPhoneMock">
            <div className="phoneTopBar"><span /> <strong>PicTour</strong> <span /></div>
            <h3>{activeSession?.locationName}</h3>
            <p>{offerText}</p>
            <div className="phonePhotoList">
              {pendingPhotos.slice(0, 4).map((photo) => (
                <button
                  key={photo.id}
                  type="button"
                  className={`phonePhotoCard ${photo.selected ? 'active' : ''}`}
                  onClick={() => onTogglePhoto(photo.id)}
                >
                  <ProtectedPreview photo={photo} watermarkText={`${activeSession?.code} • ${photo.code} • PREVIEW`} />
                </button>
              ))}
              {!pendingPhotos.length && <div className="emptyState compactEmpty"><strong>Galeria concluída</strong><span>Não há fotos pendentes para compra.</span></div>}
            </div>
          </div>
        </div>

        <aside className="panel postTourCheckout">
          <p className="eyebrow">Checkout online</p>
          <h2>Mercado Pago</h2>

          <div className={`gatewayStatus ${mercadoPagoSettings?.enabled ? 'enabled' : 'disabled'}`}>
            <strong>{mercadoPagoSettings?.enabled ? 'Gateway ativo' : 'Gateway desativado'}</strong>
            <span>{mercadoPagoSettings?.environment === 'production' ? 'Produção' : 'Sandbox'}</span>
          </div>

          <label>E-mail do comprador, opcional no teste</label>
          <input
            value={buyerEmail}
            placeholder="cliente@email.com"
            onChange={(event) => setBuyerEmail(event.target.value)}
          />

          <div className="checkoutTotal postTourTotal">
            <span>Oferta selecionada</span>
            <strong>{formatMoney(selectedPackageTotalCents, 'BRL')}</strong>
          </div>

          <div className="selectionActions">
            <button className="ghostButton" type="button" onClick={selectAllPending} disabled={!hasOpenSessions}>Selecionar pendentes</button>
            <button className="ghostButton" type="button" onClick={clearPendingSelection} disabled={!hasOpenSessions}>Limpar seleção</button>
          </div>

          <button className="primaryButton fullWidth" type="button" onClick={createMercadoPagoCheckout} disabled={!hasOpenSessions || !selectedPhotos.length || creatingCheckout}>
            {creatingCheckout ? 'Criando checkout...' : 'Criar checkout Mercado Pago'}
          </button>

          <div className="checkoutTools">
            <button className="ghostButton" type="button" onClick={openMercadoPagoCheckout} disabled={!checkoutUrl}>Abrir checkout</button>
            <button className="ghostButton" type="button" onClick={checkMercadoPagoPayment} disabled={!activeCheckout || checkingCheckout}>
              {checkingCheckout ? 'Consultando...' : 'Consultar pagamento'}
            </button>
          </div>

          <div className="infoBox">{gatewayMessage}</div>

          <details className="simulatedFallback">
            <summary>Fallback de teste sem internet/gateway</summary>
            <label>Método simulado</label>
            <select value={checkoutMethod} onChange={(event) => setCheckoutMethod(event.target.value as typeof checkoutMethod)}>
              <option value="PIX_ONLINE">Pix online</option>
              <option value="CREDIT_CARD_ONLINE">Cartão de crédito online</option>
              <option value="DEBIT_CARD_ONLINE">Cartão de débito online</option>
            </select>
            <button className="ghostButton fullWidth" type="button" onClick={simulatePostTourPurchase} disabled={!hasOpenSessions || !selectedPhotos.length}>
              Simular pagamento aprovado
            </button>
          </details>
        </aside>
      </section>

      <section className="panel gatewayHistoryPanel">
        <div className="panelHeader inline">
          <div>
            <p className="eyebrow">Histórico online</p>
            <h2>Checkouts desta sessão</h2>
          </div>
          <span className="pill">{sessionCheckouts.length}</span>
        </div>

        <div className="checkoutHistoryList">
          {sessionCheckouts.map((checkout) => (
            <button
              key={checkout.id}
              type="button"
              className={`checkoutHistoryItem ${activeCheckout?.id === checkout.id ? 'active' : ''}`}
              onClick={() => setActiveCheckoutId(checkout.id)}
            >
              <span>{checkout.packageName}</span>
              <strong>{formatMoney(checkout.amountCents, checkout.currency)}</strong>
              <em>{checkout.status} • {checkout.gatewayStatus || 'aguardando'}</em>
            </button>
          ))}
          {!sessionCheckouts.length && <div className="emptyState compactEmpty"><strong>Nenhum checkout criado</strong><span>Selecione fotos e crie o primeiro checkout sandbox.</span></div>}
        </div>
      </section>

      <section className="panel gatewayHistoryPanel">
        <div className="panelHeader inline">
          <div>
            <p className="eyebrow">Entrega profissional • v{APP_VERSION}</p>
            <h2>Links/QR de download por venda</h2>
            <p className="mutedParagraph noBottom">Cada venda pode gerar uma página pública de entrega com fotos sem marca d’água e download em ZIP.</p>
          </div>
          <span className="pill">{deliverySales.length}</span>
        </div>

        <div className="checkoutHistoryList">
          {deliverySales.map((sale) => (
            <div key={sale.id} className="checkoutHistoryItem active">
              <span>{sale.code} • {sale.packageName || 'Venda de fotos'}</span>
              <strong>{sale.deliverySlug ? 'Link pronto' : 'Gerar link'}</strong>
              <em>{sale.deliveryExpiresAt ? `Expira ${new Date(sale.deliveryExpiresAt).toLocaleDateString('pt-BR')}` : 'Validade padrão: 7 dias'} • {sale.photoIds?.length || 0} foto(s)</em>
              <div className="checkoutTools">
                <button className="ghostButton" type="button" onClick={() => onCreateSaleDelivery(sale.id)}>Gerar/atualizar</button>
                <button className="ghostButton" type="button" onClick={() => onOpenSaleDelivery(sale.id)}>Abrir entrega</button>
              </div>
            </div>
          ))}
          {!deliverySales.length && <div className="emptyState compactEmpty"><strong>Nenhuma venda com entrega ainda</strong><span>Após aprovar uma compra, o link de entrega aparecerá aqui.</span></div>}
        </div>
      </section>

      <section className="panel downloadPanel">
        <div className="panelHeader inline">
          <div>
            <p className="eyebrow">Entrega pós-compra</p>
            <h2>Fotos liberadas para download</h2>
            <p className="mutedParagraph noBottom">{downloadMessage}</p>
          </div>
          <button className="primaryButton" type="button" onClick={exportPurchasedPhotos} disabled={!hasOpenSessions || !purchasedPhotos.length}>
            Baixar fotos compradas
          </button>
        </div>

        <div className="downloadPhotoGrid">
          {purchasedPhotos.map((photo) => (
            <article key={photo.id} className="downloadPhotoCard">
              <ProtectedPreview photo={photo} watermarkText={`${activeSession?.code} • ENTREGUE`} />
              <div>
                <strong>{photo.code} — {photo.label}</strong>
                <span>{photo.kind === 'CHROMA' ? `Chroma • ${photo.backgroundName || 'Cenário'}` : photo.kind}</span>
              </div>
            </article>
          ))}
          {!purchasedPhotos.length && (
            <div className="emptyState compactEmpty">
              <strong>Nenhuma foto liberada ainda</strong>
              <span>Aprove pelo Mercado Pago ou use o fallback de teste para liberar downloads.</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
