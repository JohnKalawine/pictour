import { useEffect, useMemo, useState } from 'react';
import { formatMoney } from '../lib/money';
import type { CurrencyCode } from '../lib/types';
import { ProtectedPreview } from './ProtectedPreview';

const fallbackSnapshot: CustomerDisplaySnapshot = {
  companyName: 'PicTour Demo',
  sessionCode: 'PT-4821',
  packageName: 'Aguardando seleção',
  selectedCount: 0,
  totalCents: 0,
  currency: 'BRL',
  customerMessage: 'Escolha suas fotos favoritas com o vendedor.',
  photoCode: 'F01',
  photoLabel: 'Preview protegida',
  photoPreviewUrl: undefined,
  displayMode: 'SINGLE',
  photos: [],
  watermarkText: 'PICTOUR • PREVIEW',
  qrLabel: 'QR Code pós-passeio'
};

function buildDisplayPhotos(snapshot: CustomerDisplaySnapshot) {
  const base = snapshot.photos?.length
    ? snapshot.photos
    : [{ id: 'display-photo', code: snapshot.photoCode, label: snapshot.photoLabel, previewUrl: snapshot.photoPreviewUrl, selected: true, status: 'SELECTED' }];

  if (snapshot.displayMode === 'TRIPLE') return base.slice(0, 3);
  if (snapshot.displayMode === 'GRID') return base.slice(0, 60);
  const focused = base.find((photo) => photo.id === snapshot.focusedPhotoId) || base[0];
  return focused ? [focused] : [];
}

export function CustomerDisplayView() {
  const [snapshot, setSnapshot] = useState<CustomerDisplaySnapshot>(fallbackSnapshot);
  const displayPhotos = useMemo(() => buildDisplayPhotos(snapshot), [snapshot]);
  const mode = snapshot.displayMode || 'SINGLE';

  useEffect(() => {
    const unsubscribe = window.pictourDesktop?.onCustomerDisplayUpdate((nextSnapshot) => {
      if (nextSnapshot) setSnapshot(nextSnapshot);
    });

    return () => unsubscribe?.();
  }, []);

  return (
    <main className={`customerDisplayShell displayMode${mode}`}>
      <section className="customerHero">
        <div className="customerHeader">
          <div>
            <span>Monitor do cliente</span>
            <h1>{snapshot.companyName}</h1>
          </div>
          <div className="sessionBadge">{snapshot.sessionCode}</div>
        </div>

        {mode === 'SINGLE' ? (
          <ProtectedPreview
            large
            watermarkText={snapshot.watermarkText}
            photo={{
              id: displayPhotos[0]?.id || 'display-photo',
              code: displayPhotos[0]?.code ?? snapshot.photoCode ?? 'F01',
              label: displayPhotos[0]?.label ?? snapshot.photoLabel ?? 'Preview protegida',
              previewUrl: displayPhotos[0]?.previewUrl ?? snapshot.photoPreviewUrl,
              sessionCode: snapshot.sessionCode,
              kind: 'CHROMA',
              selected: true,
              status: 'SELECTED'
            }}
          />
        ) : (
          <div className={`customerPhotoGrid ${mode === 'TRIPLE' ? 'triple' : 'all'}`}>
            {displayPhotos.map((photo, index) => (
              <article key={`${photo.id}-${index}`} className={photo.id === snapshot.focusedPhotoId ? 'active' : ''}>
                <ProtectedPreview
                  watermarkText={snapshot.watermarkText}
                  photo={{
                    id: photo.id || `display-${index}`,
                    code: photo.code ?? `F${index + 1}`,
                    label: photo.label ?? 'Foto selecionada',
                    previewUrl: photo.previewUrl,
                    sessionCode: snapshot.sessionCode,
                    kind: 'CHROMA',
                    selected: Boolean(photo.selected),
                    status: photo.status === 'PURCHASED' ? 'PURCHASED' : 'SELECTED'
                  }}
                />
                <span>{photo.code ?? `F${index + 1}`}</span>
              </article>
            ))}
            {!displayPhotos.length && <div className="emptyState">Nenhuma foto disponível para exibir.</div>}
          </div>
        )}
      </section>

      <aside className="customerSummary">
        <div>
          <span>Pacote</span>
          <strong>{snapshot.packageName}</strong>
        </div>
        <div>
          <span>Fotos selecionadas</span>
          <strong>{snapshot.selectedCount}</strong>
        </div>
        <div>
          <span>Total</span>
          <strong>{formatMoney(snapshot.totalCents, snapshot.currency as CurrencyCode)}</strong>
        </div>
        <div>
          <span>Exibição</span>
          <strong>{mode === 'SINGLE' ? '1 foto' : mode === 'TRIPLE' ? '3 fotos' : 'Todas em grid'}</strong>
        </div>
        <p>{snapshot.customerMessage}</p>
        <div className="fakeQr">
          <div />
          <span>{snapshot.qrLabel}</span>
        </div>
      </aside>
    </main>
  );
}
