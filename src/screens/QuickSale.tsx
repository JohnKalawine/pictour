import { useEffect, useMemo, useState } from 'react';
import type { AntiPrintSettings, AppUser, AuthUser, CashShift, CurrencyCode, ExchangeRates, PackageOption, Photo, PhotoSession, RegisterManualSaleInput, TenderMethod } from '../lib/types';
import { convertBrlCentsToCurrencyCents, formatMoney, getPackageUnitLabel, normalizeExchangeRates } from '../lib/money';
import { PhotoGrid } from '../components/PhotoGrid';

type PhotoSaleFilter = 'ALL' | 'UNSOLD' | 'SOLD' | 'FAVORITE';
type SaleItemSlot = { id: string; packageId: string; photoId?: string };
type TenderDraft = { id: string; method: TenderMethod; currency: CurrencyCode; amountInput: string };

type QuickSaleMonitorPreview = {
  packageName: string;
  selectedCount: number;
  totalCents: number;
  currency: CurrencyCode;
  photoIds: string[];
  focusedPhotoId?: string;
  customerMessage: string;
};

type QuickSaleProps = {
  sessions: PhotoSession[];
  selectedSessionCode: string;
  photos: Photo[];
  selectedPackage: PackageOption;
  packageOptions: PackageOption[];
  exchangeRates: ExchangeRates;
  focusedPhotoId?: string;
  users: AppUser[];
  currentUser?: AuthUser | null;
  onSessionChange: (sessionCode: string) => void;
  onPackageChange: (packageId: string) => void;
  onFocusPhoto: (photoId: string) => void;
  onTogglePhoto: (photoId: string) => void;
  onToggleFavorite: (photoId: string) => void;
  onOpenCustomerDisplay: () => void;
  customerDisplayOpen: boolean;
  customerDisplayMode: 'SINGLE' | 'TRIPLE' | 'GRID';
  onCustomerDisplayModeChange: (mode: 'SINGLE' | 'TRIPLE' | 'GRID') => void;
  onCloseCustomerDisplay: () => void;
  openCashShift?: CashShift | null;
  onNavigateToCashier?: () => void;
  onRegisterSale: (input: RegisterManualSaleInput) => Promise<void>;
  onMonitorPreviewChange?: (preview: QuickSaleMonitorPreview) => void;
  antiPrint?: AntiPrintSettings;
  stationName?: string;
};

const paymentOptions: { method: TenderMethod; currency: CurrencyCode; label: string }[] = [
  { method: 'MANUAL_PIX', currency: 'BRL', label: 'Pix manual' },
  { method: 'EXTERNAL_CARD_MACHINE', currency: 'BRL', label: 'Cartão externo' },
  { method: 'CASH', currency: 'BRL', label: 'Dinheiro BRL' },
  { method: 'CASH', currency: 'USD', label: 'Dinheiro USD' },
  { method: 'CASH', currency: 'EUR', label: 'Dinheiro EUR' },
  { method: 'CASH', currency: 'PYG', label: 'Dinheiro PYG' },
  { method: 'CASH', currency: 'ARS', label: 'Dinheiro ARS' }
];

const methodLabels: Record<TenderMethod, string> = {
  PIX_ONLINE: 'Pix online',
  CREDIT_CARD_ONLINE: 'Crédito online',
  DEBIT_CARD_ONLINE: 'Débito online',
  CASH: 'Dinheiro',
  MIXED: 'Pagamento misto',
  MANUAL_PIX: 'Pix manual',
  EXTERNAL_CARD_MACHINE: 'Cartão externo'
};

const filterLabels: Record<PhotoSaleFilter, string> = {
  ALL: 'Todas',
  UNSOLD: 'Não vendidas',
  SOLD: 'Vendidas',
  FAVORITE: 'Favoritadas'
};

function makeSlotId() {
  return `slot_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeTenderId() {
  return `tender_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function parseMoneyToCents(value: string) {
  const normalized = String(value || '').replace(/\./g, '').replace(',', '.').replace(/[^0-9.]/g, '');
  return Math.max(0, Math.round(Number(normalized || 0) * 100));
}

function centsToInput(cents: number) {
  return String((Number(cents || 0) / 100).toFixed(2)).replace('.', ',');
}

function convertCurrencyCentsToBrlCents(amountCents: number, currency: CurrencyCode, exchangeRates?: Partial<ExchangeRates>) {
  if (currency === 'BRL') return Math.round(amountCents || 0);
  const rates = normalizeExchangeRates(exchangeRates);
  const rate = rates[currency] || 1;
  return Math.round((amountCents || 0) * rate);
}

function packageSummaryFromSlots(slots: SaleItemSlot[], packageOptions: PackageOption[]) {
  const counts = new Map<string, number>();
  slots.filter((slot) => slot.photoId).forEach((slot) => counts.set(slot.packageId, (counts.get(slot.packageId) || 0) + 1));
  const parts = Array.from(counts.entries()).map(([packageId, count]) => {
    const packageOption = packageOptions.find((item) => item.id === packageId);
    return `${packageOption?.name || 'Item'} ×${count}`;
  });
  return parts.length ? parts.join(' + ') : 'Venda modular de fotos';
}

function summarizeTenders(tenders: Array<{ method: TenderMethod; currency: CurrencyCode; amountCents: number }>) {
  return tenders.map((tender) => `${methodLabels[tender.method] || tender.method} ${tender.currency}: ${formatMoney(tender.amountCents, tender.currency)}`).join(' + ');
}

export function QuickSale({
  sessions,
  selectedSessionCode,
  photos,
  selectedPackage,
  packageOptions,
  exchangeRates,
  focusedPhotoId,
  users,
  currentUser,
  onSessionChange,
  onPackageChange,
  onFocusPhoto,
  onTogglePhoto: _legacyTogglePhoto,
  onToggleFavorite,
  onOpenCustomerDisplay,
  customerDisplayOpen,
  customerDisplayMode,
  onCustomerDisplayModeChange,
  onCloseCustomerDisplay,
  openCashShift,
  onNavigateToCashier,
  onRegisterSale,
  onMonitorPreviewChange,
  antiPrint,
  stationName
}: QuickSaleProps) {
  const activeSession = sessions.find((session) => session.code === selectedSessionCode);
  const cashIsOpen = Boolean(openCashShift?.id);
  const sessionIsOpen = Boolean(activeSession?.code) && activeSession?.status !== 'CLOSED';
  const [sellerName, setSellerName] = useState(currentUser?.name || 'Operador');
  const [photoFilter, setPhotoFilter] = useState<PhotoSaleFilter>('UNSOLD');
  const [saleSlots, setSaleSlots] = useState<SaleItemSlot[]>([]);
  const [activeSlotId, setActiveSlotId] = useState('');
  const [tenders, setTenders] = useState<TenderDraft[]>([{ id: makeTenderId(), method: 'MANUAL_PIX', currency: 'BRL', amountInput: '0,00' }]);

  const sellerOptions = useMemo(() => {
    const activeUsers = users.filter((user) => user.active !== false);
    return activeUsers.length ? activeUsers : (currentUser ? [currentUser as AppUser] : []);
  }, [currentUser, users]);

  useEffect(() => {
    if (currentUser?.name && (sellerName === 'Operador' || !sellerOptions.some((user) => user.name === sellerName))) {
      setSellerName(currentUser.name);
    }
  }, [currentUser, sellerName, sellerOptions]);

  useEffect(() => {
    setSaleSlots([]);
    setActiveSlotId('');
    setTenders([{ id: makeTenderId(), method: 'MANUAL_PIX', currency: 'BRL', amountInput: '0,00' }]);
  }, [selectedSessionCode]);

  const assignedPhotoIds = useMemo(() => new Set(saleSlots.map((slot) => slot.photoId).filter(Boolean) as string[]), [saleSlots]);
  const filledSlots = useMemo(() => saleSlots.filter((slot) => Boolean(slot.photoId)), [saleSlots]);
  const uniquePhotoIds = useMemo(() => Array.from(new Set(filledSlots.map((slot) => slot.photoId).filter(Boolean) as string[])), [filledSlots]);

  const totalBaseCents = useMemo(() => filledSlots.reduce((sum, slot) => {
    const packageOption = packageOptions.find((item) => item.id === slot.packageId);
    return sum + Number(packageOption?.priceCents || 0);
  }, 0), [filledSlots, packageOptions]);

  const normalizedTenders = useMemo(() => tenders.map((tender) => {
    const amountCents = parseMoneyToCents(tender.amountInput);
    return {
      ...tender,
      amountCents,
      amountBaseCents: convertCurrencyCentsToBrlCents(amountCents, tender.currency, exchangeRates)
    };
  }).filter((tender) => tender.amountCents > 0), [exchangeRates, tenders]);

  const paidBaseCents = useMemo(() => normalizedTenders.reduce((sum, tender) => sum + tender.amountBaseCents, 0), [normalizedTenders]);
  const remainingBaseCents = Math.max(0, totalBaseCents - paidBaseCents);
  const changeBaseCents = Math.max(0, paidBaseCents - totalBaseCents);
  const hasCashTender = normalizedTenders.some((tender) => tender.method === 'CASH');
  const saleSummary = packageSummaryFromSlots(saleSlots, packageOptions);
  const paymentSummary = summarizeTenders(normalizedTenders);

  const photosForGrid = useMemo(() => photos.map((photo) => ({
    ...photo,
    selected: assignedPhotoIds.has(photo.id)
  })), [assignedPhotoIds, photos]);

  useEffect(() => {
    onMonitorPreviewChange?.({
      packageName: saleSummary,
      selectedCount: filledSlots.length,
      totalCents: totalBaseCents,
      currency: 'BRL',
      photoIds: uniquePhotoIds,
      focusedPhotoId: activeSlotId ? saleSlots.find((slot) => slot.id === activeSlotId)?.photoId || focusedPhotoId : focusedPhotoId,
      customerMessage: filledSlots.length
        ? `Venda em montagem: ${filledSlots.length} item(ns), ${uniquePhotoIds.length} foto(s) única(s). Total: ${formatMoney(totalBaseCents)}. Pago: ${formatMoney(paidBaseCents)}${changeBaseCents ? ` • Troco: ${formatMoney(changeBaseCents)}` : ''}.`
        : 'Escolha um produto no “+” e selecione a foto para o cliente acompanhar no monitor.'
    });
  }, [activeSlotId, changeBaseCents, filledSlots.length, focusedPhotoId, onMonitorPreviewChange, paidBaseCents, saleSlots, saleSummary, totalBaseCents, uniquePhotoIds]);

  const filteredPhotos = useMemo(() => {
    if (photoFilter === 'SOLD') return photosForGrid.filter((photo) => photo.status === 'PURCHASED');
    if (photoFilter === 'UNSOLD') return photosForGrid.filter((photo) => photo.status !== 'PURCHASED');
    if (photoFilter === 'FAVORITE') return photosForGrid.filter((photo) => photo.favorite);
    return photosForGrid;
  }, [photoFilter, photosForGrid]);

  const filterStats = useMemo(() => ({
    all: photos.length,
    unsold: photos.filter((photo) => photo.status !== 'PURCHASED').length,
    sold: photos.filter((photo) => photo.status === 'PURCHASED').length,
    favorite: photos.filter((photo) => photo.favorite).length
  }), [photos]);

  function addPackageSlot(packageId: string) {
    const id = makeSlotId();
    setSaleSlots((current) => [...current, { id, packageId }]);
    setActiveSlotId(id);
    onPackageChange(packageId);
  }

  function removeSlot(slotId: string) {
    setSaleSlots((current) => current.filter((slot) => slot.id !== slotId));
    setActiveSlotId((current) => (current === slotId ? '' : current));
  }

  function assignPhotoToSlot(photoId: string) {
    const photo = photos.find((item) => item.id === photoId);
    if (!photo || photo.status === 'PURCHASED') return;

    setSaleSlots((current) => {
      let targetId = activeSlotId && current.some((slot) => slot.id === activeSlotId) ? activeSlotId : '';
      if (!targetId) targetId = current.find((slot) => !slot.photoId)?.id || '';

      if (!targetId) {
        targetId = makeSlotId();
        return [...current, { id: targetId, packageId: selectedPackage.id, photoId }];
      }

      return current.map((slot) => (slot.id === targetId ? { ...slot, photoId } : slot));
    });
  }

  function clearSlotPhoto(slotId: string) {
    setSaleSlots((current) => current.map((slot) => (slot.id === slotId ? { ...slot, photoId: undefined } : slot)));
    setActiveSlotId(slotId);
  }

  function addTender(method: TenderMethod = 'MANUAL_PIX', currency: CurrencyCode = 'BRL') {
    const amountCents = currency === 'BRL' ? remainingBaseCents : convertBrlCentsToCurrencyCents(remainingBaseCents, currency, exchangeRates);
    setTenders((current) => [...current, { id: makeTenderId(), method, currency, amountInput: centsToInput(amountCents) }]);
  }

  function updateTender(tenderId: string, patch: Partial<TenderDraft>) {
    setTenders((current) => current.map((item) => {
      if (item.id !== tenderId) return item;
      const next = { ...item, ...patch };
      const option = paymentOptions.find((payment) => `${payment.method}:${payment.currency}` === `${next.method}:${next.currency}`);
      return option ? { ...next, method: option.method, currency: option.currency } : next;
    }));
  }

  function removeTender(tenderId: string) {
    setTenders((current) => current.length <= 1 ? current : current.filter((item) => item.id !== tenderId));
  }

  function fillTenderWithRemaining(tenderId: string) {
    setTenders((current) => current.map((item) => {
      if (item.id !== tenderId) return item;
      const currentBase = convertCurrencyCentsToBrlCents(parseMoneyToCents(item.amountInput), item.currency, exchangeRates);
      const baseWithoutThis = Math.max(0, paidBaseCents - currentBase);
      const pendingBase = Math.max(0, totalBaseCents - baseWithoutThis);
      const pendingInCurrency = item.currency === 'BRL' ? pendingBase : convertBrlCentsToCurrencyCents(pendingBase, item.currency, exchangeRates);
      return { ...item, amountInput: centsToInput(pendingInCurrency) };
    }));
  }

  async function handleRegisterSale() {
    if (!cashIsOpen) {
      alert('Abra o caixa antes de vender. Isso mantém toda venda vinculada ao turno e evita diferença no fechamento.');
      return;
    }

    if (!sessionIsOpen) {
      alert('Esta sessão está encerrada. Reabra a sessão ou escolha uma sessão aberta antes de vender.');
      return;
    }

    if (!filledSlots.length) {
      alert('Adicione pelo menos um item no “+” e escolha uma foto para o slot antes de registrar a venda.');
      return;
    }

    if (!normalizedTenders.length) {
      alert('Informe ao menos uma forma de pagamento com valor recebido.');
      return;
    }

    if (paidBaseCents < totalBaseCents) {
      alert(`Pagamento insuficiente. Faltam ${formatMoney(remainingBaseCents)}.`);
      return;
    }

    if (changeBaseCents > 0 && !hasCashTender) {
      alert('Troco só deve existir quando há pagamento em dinheiro. Ajuste os valores de Pix/cartão para bater com o total.');
      return;
    }

    const saleTenders = normalizedTenders.map((tender) => ({
      id: tender.id,
      method: tender.method,
      currency: tender.currency,
      amountCents: tender.amountCents,
      amountBaseCents: tender.amountBaseCents,
      label: methodLabels[tender.method]
    }));

    await onRegisterSale({
      sessionCode: selectedSessionCode,
      sellerName,
      method: saleTenders.length > 1 ? 'MIXED' : saleTenders[0].method,
      currency: saleTenders.length > 1 ? 'BRL' : saleTenders[0].currency,
      amountCents: saleTenders.length > 1 ? totalBaseCents : saleTenders[0].currency === 'BRL' ? totalBaseCents : convertBrlCentsToCurrencyCents(totalBaseCents, saleTenders[0].currency, exchangeRates),
      amountBaseCents: totalBaseCents,
      paidBaseCents,
      changeBaseCents,
      paymentSummary,
      tenders: saleTenders,
      photoIds: uniquePhotoIds,
      packageName: saleSummary,
      cashShiftId: openCashShift?.id,
      saleLineItems: filledSlots.map((slot) => {
        const packageOption = packageOptions.find((item) => item.id === slot.packageId);
        const photo = photos.find((item) => item.id === slot.photoId);
        return {
          id: slot.id,
          packageId: slot.packageId,
          packageName: packageOption?.name || 'Item',
          photoId: slot.photoId,
          photoCode: photo?.code,
          priceCents: Number(packageOption?.priceCents || 0),
          currency: packageOption?.currency || 'BRL'
        };
      })
    });

    setSaleSlots([]);
    setActiveSlotId('');
    setTenders([{ id: makeTenderId(), method: 'MANUAL_PIX', currency: 'BRL', amountInput: '0,00' }]);
  }

  return (
    <div className="quickSaleLayout">
      <section className="panel salePhotosPanel">
        <div className="panelHeader inline">
          <div>
            <p className="eyebrow">Sessão ativa</p>
            <h2>Mostre, favorite e envie fotos para slots</h2>
          </div>
          <div className="miniSummary">
            <strong>{filledSlots.length}</strong>
            <span>itens na venda</span>
          </div>
        </div>

        <label className="fieldLabel">Sessão</label>
        <select value={selectedSessionCode} onChange={(event) => onSessionChange(event.target.value)}>
          {sessions.map((session) => (
            <option key={session.id} value={session.code}>{session.code} — {session.customerName}</option>
          ))}
          {!sessions.length && <option value="">Nenhuma sessão aberta</option>}
        </select>

        <div className="photoFilterBar">
          {(['ALL', 'UNSOLD', 'SOLD', 'FAVORITE'] as PhotoSaleFilter[]).map((filter) => {
            const count = filter === 'ALL' ? filterStats.all : filter === 'UNSOLD' ? filterStats.unsold : filter === 'SOLD' ? filterStats.sold : filterStats.favorite;
            return (
              <button
                key={filter}
                className={photoFilter === filter ? 'active' : ''}
                type="button"
                onClick={() => setPhotoFilter(filter)}
              >
                {filterLabels[filter]} <span>{count}</span>
              </button>
            );
          })}
        </div>

        <div className="infoBox compactInfo">
          Primeiro clique no “+” de um produto para criar um slot. Depois use “Selecionar” na foto: ela entra no slot ativo. Dá para vender digital, impressa e porta-retrato na mesma venda, com pagamentos divididos.
        </div>

        <PhotoGrid
          photos={filteredPhotos}
          focusedPhotoId={focusedPhotoId}
          onFocusPhoto={onFocusPhoto}
          onTogglePhoto={assignPhotoToSlot}
          onToggleFavorite={onToggleFavorite}
          antiPrint={antiPrint}
          stationName={stationName}
        />
      </section>

      <aside className="panel checkoutPanel modularCheckoutPanel">
        <p className="eyebrow">Checkout presencial modular</p>
        <h2>Fechar venda por itens</h2>

        {!cashIsOpen && (
          <div className="cashBlockedBox">
            <strong>Caixa fechado</strong>
            <span>Abra o caixa antes de registrar qualquer venda presencial.</span>
            <button className="miniButton" type="button" onClick={onNavigateToCashier}>Abrir caixa</button>
          </div>
        )}

        {!sessionIsOpen && selectedSessionCode && (
          <div className="cashBlockedBox">
            <strong>Sessão encerrada</strong>
            <span>Escolha uma sessão aberta ou reabra esta sessão na aba Sessões.</span>
          </div>
        )}

        {cashIsOpen && (
          <div className="cashReadyBox">
            Caixa aberto: <strong>{openCashShift?.code}</strong> desde {openCashShift?.openedAt ? new Date(openCashShift.openedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--'}.
          </div>
        )}

        <div className="packageAdderHeader">
          <label>Adicionar produtos/pacotes</label>
          <small>Cada “+” cria um slot de foto independente.</small>
        </div>
        <div className="packageAdderList">
          {packageOptions.map((packageOption) => (
            <button key={packageOption.id} className="packageAdderButton" type="button" onClick={() => addPackageSlot(packageOption.id)}>
              <span>
                <strong>{packageOption.name}</strong>
                <em>{formatMoney(packageOption.priceCents, packageOption.currency)} • {getPackageUnitLabel(packageOption)}</em>
              </span>
              <b>+</b>
            </button>
          ))}
        </div>

        <div className="saleSlotsPanel">
          <div className="packageAdderHeader">
            <label>Itens desta venda</label>
            <small>{saleSlots.length ? 'Clique em um slot para mandar a próxima foto para ele.' : 'Adicione um pacote no “+” para começar.'}</small>
          </div>

          <div className="saleSlotList">
            {saleSlots.map((slot, index) => {
              const packageOption = packageOptions.find((item) => item.id === slot.packageId);
              const photo = photos.find((item) => item.id === slot.photoId);
              return (
                <article key={slot.id} className={`saleSlotCard ${activeSlotId === slot.id ? 'active' : ''}`} onClick={() => setActiveSlotId(slot.id)}>
                  <div>
                    <span>Slot {index + 1}</span>
                    <strong>{packageOption?.name || 'Produto'}</strong>
                    <em>{photo ? `${photo.code} • ${photo.label || 'Foto escolhida'}` : 'Aguardando foto'}</em>
                  </div>
                  <aside>
                    <strong>{formatMoney(Number(packageOption?.priceCents || 0), packageOption?.currency || 'BRL')}</strong>
                    <button className="miniButton" type="button" onClick={(event) => { event.stopPropagation(); clearSlotPhoto(slot.id); }}>Trocar foto</button>
                    <button className="dangerMiniButton" type="button" onClick={(event) => { event.stopPropagation(); removeSlot(slot.id); }}>Remover</button>
                  </aside>
                </article>
              );
            })}
            {!saleSlots.length && <div className="emptyState compactEmpty">Nenhum item adicionado ainda.</div>}
          </div>
        </div>

        <label>Vendedor</label>
        <select value={sellerName} onChange={(event) => setSellerName(event.target.value)}>
          {sellerOptions.map((user) => (
            <option key={user.id} value={user.name}>{user.name} — {user.role === 'MANAGER' ? 'Gestor/adm' : 'Fotógrafo/Caixa'}</option>
          ))}
          {!sellerOptions.length && <option value="Operador">Operador</option>}
        </select>

        <div className="packageAdderHeader paymentSplitHeader">
          <label>Formas de pagamento</label>
          <small>Divida a venda entre Pix, cartão e dinheiro. O troco é calculado automaticamente.</small>
        </div>
        <div className="paymentSplitPanel">
          {tenders.map((tender) => {
            const currentOption = `${tender.method}:${tender.currency}`;
            return (
              <div className="paymentSplitRow" key={tender.id}>
                <select value={currentOption} onChange={(event) => {
                  const [method, currency] = event.target.value.split(':') as [TenderMethod, CurrencyCode];
                  updateTender(tender.id, { method, currency });
                }}>
                  {paymentOptions.map((option) => (
                    <option key={`${option.method}:${option.currency}`} value={`${option.method}:${option.currency}`}>{option.label}</option>
                  ))}
                </select>
                <input value={tender.amountInput} onChange={(event) => updateTender(tender.id, { amountInput: event.target.value })} placeholder="0,00" />
                <button className="miniButton" type="button" onClick={() => fillTenderWithRemaining(tender.id)}>Restante</button>
                <button className="dangerMiniButton" type="button" disabled={tenders.length <= 1} onClick={() => removeTender(tender.id)}>Remover</button>
              </div>
            );
          })}
          <div className="paymentQuickButtons">
            <button className="miniButton" type="button" onClick={() => addTender('MANUAL_PIX', 'BRL')}>+ Pix</button>
            <button className="miniButton" type="button" onClick={() => addTender('EXTERNAL_CARD_MACHINE', 'BRL')}>+ Cartão</button>
            <button className="miniButton" type="button" onClick={() => addTender('CASH', 'BRL')}>+ Dinheiro</button>
          </div>
        </div>

        <div className="checkoutTotal paymentTotalStack">
          <span>Total da venda</span>
          <strong>{formatMoney(totalBaseCents, 'BRL')}</strong>
          <small>Recebido: {formatMoney(paidBaseCents)} • {remainingBaseCents ? `Falta: ${formatMoney(remainingBaseCents)}` : changeBaseCents ? `Troco: ${formatMoney(changeBaseCents)}` : 'Pagamento exato'}</small>
        </div>

        {normalizedTenders.some((tender) => tender.currency !== 'BRL') && (
          <div className="infoBox">
            Pagamento em moeda estrangeira usa as cotações cadastradas em Configurações. O fechamento mantém o valor original por moeda e o equivalente base em BRL.
          </div>
        )}

        {changeBaseCents > 0 && (
          <div className="successBox compactInfo">
            Troco estimado: <strong>{formatMoney(changeBaseCents)}</strong>. Entregue o troco antes de finalizar a venda.
          </div>
        )}

        <div className="customerDisplayControls">
          <label>Monitor do cliente</label>
          <div className="segmentedControl">
            <button type="button" className={customerDisplayMode === 'SINGLE' ? 'active' : ''} onClick={() => onCustomerDisplayModeChange('SINGLE')}>1 foto</button>
            <button type="button" className={customerDisplayMode === 'TRIPLE' ? 'active' : ''} onClick={() => onCustomerDisplayModeChange('TRIPLE')}>3 fotos</button>
            <button type="button" className={customerDisplayMode === 'GRID' ? 'active' : ''} onClick={() => onCustomerDisplayModeChange('GRID')}>Todas</button>
          </div>
          <small>O grid força proporção horizontal, mesmo quando há muitas fotos.</small>
        </div>

        <div className="actionColumn">
          <button className="primaryButton" type="button" disabled={!cashIsOpen || !sessionIsOpen || paidBaseCents < totalBaseCents || !filledSlots.length} onClick={handleRegisterSale}>{cashIsOpen ? 'Registrar pagamento' : 'Abra o caixa para vender'}</button>
          <button className="ghostButton" type="button" onClick={onOpenCustomerDisplay}>{customerDisplayOpen ? 'Monitor aberto / sincronizado' : 'Abrir monitor do cliente'}</button>
          <button className="dangerGhostButton" type="button" onClick={onCloseCustomerDisplay}>Fechar monitor</button>
        </div>

        <div className="infoBox">
          Resumo: <strong>{saleSummary}</strong>. Fotos únicas para entrega/download: {uniquePhotoIds.length}. Itens cobrados: {filledSlots.length}. Pagamento: {paymentSummary || 'não informado'}.
        </div>
      </aside>
    </div>
  );
}
