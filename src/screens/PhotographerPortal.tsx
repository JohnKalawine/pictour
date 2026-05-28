import { APP_VERSION } from '../lib/appVersion';
import { useEffect, useMemo, useState } from 'react';
import type { Photo, PhotoSession, PublicGalleryInfo } from '../lib/types';
import { AccessQrCard } from '../components/AccessQrCard';

type PhotographerPortalProps = {
  sessions: PhotoSession[];
  photos: Photo[];
  publicGallery?: PublicGalleryInfo;
  selectedSessionCode: string;
  onSessionChange: (sessionCode: string) => void;
  onOpenPhotographerPortal: () => Promise<void>;
};

export function PhotographerPortal({ sessions, photos, publicGallery, selectedSessionCode, onSessionChange, onOpenPhotographerPortal }: PhotographerPortalProps) {
  const [copyMessage, setCopyMessage] = useState('Escaneie o QR no celular do fotógrafo para abrir o app mobile completo.');
  const activeSession = sessions.find((session) => session.code === selectedSessionCode) ?? sessions[0];
  const primaryUrl = publicGallery?.primaryUrl || publicGallery?.localUrl || 'http://127.0.0.1:3888';
  const photographerUrl = `${primaryUrl}/photo`;
  const activeSessionPhotos = useMemo(() => photos.filter((photo) => photo.sessionCode === activeSession?.code), [photos, activeSession?.code]);
  const recentExternalPhotos = activeSessionPhotos
    .filter((photo) => photo.kind === 'CAMERA' && photo.originalFileName?.includes('photographer-web'))
    .slice(-10)
    .reverse();
  const selectedCount = activeSessionPhotos.filter((photo) => photo.selected).length;
  const favoriteCount = activeSessionPhotos.filter((photo) => photo.favorite).length;
  const purchasedCount = activeSessionPhotos.filter((photo) => photo.status === 'PURCHASED').length;

  useEffect(() => {
    if (!sessions.length) return;
    const stillOpen = sessions.some((session) => session.code === selectedSessionCode);
    if (!stillOpen) onSessionChange(sessions[0].code);
  }, [sessions, selectedSessionCode, onSessionChange]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(photographerUrl);
      setCopyMessage('Link do app mobile copiado. Abra no celular conectado na mesma rede do desktop.');
    } catch {
      setCopyMessage('Não consegui copiar automaticamente. Copie o link manualmente.');
    }
  }

  return (
    <section className="screenStack photographerPortalScreen">
      <div className="sectionHeader">
        <div>
          <p className="eyebrow">v{APP_VERSION} • app mobile completo</p>
          <h2>App mobile/web para fotógrafo externo</h2>
          <p>Captura, envio, fila offline, acompanhamento da sessão, pré-seleção e favoritos pelo celular.</p>
        </div>
        <div className="headerActions">
          <button className="ghostButton" type="button" onClick={copyLink}>Copiar link</button>
          <button className="primaryButton" type="button" onClick={onOpenPhotographerPortal}>Abrir app mobile</button>
        </div>
      </div>

      <div className="twoColumnGrid">
        <div className="panelCard">
          <div className="panelTitleRow">
            <div>
              <span className="eyebrow">Acesso do fotógrafo</span>
              <h3>QR Code do app mobile v{APP_VERSION}</h3>
            </div>
            <span className="statusPill success">Rede local</span>
          </div>
          <AccessQrCard url={photographerUrl} accessCode={activeSession?.accessCode || activeSession?.code?.replace(/\D/g, '').slice(-4)} label="PicTour Mobile" />
          <div className="shareBox"><span>{photographerUrl}</span></div>
          <p className="mutedText">{copyMessage}</p>
          <div className="noticeBox compact">
            <strong>Operação atual:</strong> o fotógrafo acompanha a sessão, envia fotos, usa fila offline, marca favoritas/pré-selecionadas e alimenta o caixa/chroma/galeria sem importar manualmente.
          </div>
        </div>

        <div className="panelCard">
          <div className="panelTitleRow">
            <div>
              <span className="eyebrow">Sessão alvo</span>
              <h3>Operação em campo</h3>
            </div>
            <span className="statusPill">{sessions.length} aberta(s)</span>
          </div>

          <label className="fieldLabel">Sessão</label>
          <select className="inputField" value={activeSession?.code || ''} onChange={(event) => onSessionChange(event.target.value)}>
            {sessions.map((session) => (
              <option key={session.code} value={session.code}>{session.code} • {session.customerName} • {session.locationName}</option>
            ))}
          </select>

          {activeSession ? (
            <div className="sessionAccessCard">
              <span>Código de acesso</span>
              <strong>{activeSession.accessCode || activeSession.code.replace(/\D/g, '').slice(-4)}</strong>
              <small>O fotógrafo informa esse código no celular para evitar upload na sessão errada.</small>
            </div>
          ) : (
            <div className="emptyState">Crie uma sessão aberta para liberar envio externo.</div>
          )}

          <div className="metricGrid compactMetrics">
            <div className="metricCard"><span>Fotos</span><strong>{activeSessionPhotos.length}</strong></div>
            <div className="metricCard"><span>Selecionadas</span><strong>{selectedCount}</strong></div>
            <div className="metricCard"><span>Favoritas</span><strong>{favoriteCount}</strong></div>
            <div className="metricCard"><span>Compradas</span><strong>{purchasedCount}</strong></div>
          </div>
        </div>
      </div>

      <div className="panelCard">
        <div className="panelTitleRow">
          <div>
            <span className="eyebrow">Fluxo mobile operacional</span>
            <h3>Recursos disponíveis no celular</h3>
          </div>
          <span className="statusPill success">Pronto para campo</span>
        </div>
        <div className="featureGrid">
          <div className="featureCard"><strong>Captura/envio</strong><span>Upload múltiplo direto para a sessão aberta.</span></div>
          <div className="featureCard"><strong>Fila offline</strong><span>Guarda lote no celular e reenvia quando a rede voltar.</span></div>
          <div className="featureCard"><strong>Pré-seleção</strong><span>Marca fotos que o operador deve priorizar na venda.</span></div>
          <div className="featureCard"><strong>Favoritos</strong><span>Sinaliza melhores fotos do fotógrafo sem poluir o caixa.</span></div>
        </div>
      </div>

      <div className="panelCard">
        <div className="panelTitleRow">
          <div>
            <span className="eyebrow">Entrada recente</span>
            <h3>Últimos uploads externos</h3>
          </div>
          <span className="statusPill">Atualiza automaticamente</span>
        </div>
        {recentExternalPhotos.length ? (
          <div className="miniPhotoStrip">
            {recentExternalPhotos.map((photo) => (
              <article key={photo.id}>
                <img src={photo.previewUrl} alt={photo.code} />
                <strong>{photo.code}{photo.favorite ? ' ★' : ''}</strong>
                <span>{photo.selected ? 'Pré-selecionada' : photo.label}</span>
              </article>
            ))}
          </div>
        ) : (
          <div className="emptyState">Nenhuma foto enviada pelo app mobile ainda. O primeiro upload aparece aqui e também em Captura/Chroma/Venda.</div>
        )}
      </div>
    </section>
  );
}
