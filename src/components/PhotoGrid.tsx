import type { AntiPrintSettings, Photo } from '../lib/types';
import { ProtectedPreview } from './ProtectedPreview';

type PhotoGridProps = {
  photos: Photo[];
  focusedPhotoId?: string;
  onFocusPhoto: (photoId: string) => void;
  onTogglePhoto: (photoId: string) => void;
  onToggleFavorite: (photoId: string) => void;
  antiPrint?: AntiPrintSettings;
  stationName?: string;
};

export function PhotoGrid({ photos, focusedPhotoId, onFocusPhoto, onTogglePhoto, onToggleFavorite, antiPrint, stationName }: PhotoGridProps) {
  if (!photos.length) {
    return (
      <div className="emptyState">
        <strong>Nenhuma foto importada ainda</strong>
        <span>Vá para Captura e importe arquivos ou uma pasta para começar a vender.</span>
      </div>
    );
  }

  return (
    <div className="photoGrid salePhotoGrid">
      {photos.map((photo) => {
        const isPurchased = photo.status === 'PURCHASED';
        return (
          <article
            key={photo.id}
            className={`photoCard ${photo.selected ? 'selected' : ''} ${focusedPhotoId === photo.id ? 'focused' : ''} ${isPurchased ? 'purchased' : ''} ${photo.favorite ? 'favorite' : ''}`}
            onClick={() => onFocusPhoto(photo.id)}
          >
            <ProtectedPreview photo={photo} watermarkText={`${photo.sessionCode} • ${photo.code}`} antiPrint={antiPrint} stationName={stationName} />
            <div className="photoCardFooter salePhotoFooter">
              <div>
                <strong>{photo.code}</strong>
                <span>{photo.kind === 'CHROMA' ? `Chroma${photo.backgroundName ? ` • ${photo.backgroundName}` : ''}` : photo.kind === 'CAMERA' ? 'Câmera' : 'Upload'}</span>
              </div>
              <em>{isPurchased ? 'Comprada' : photo.selected ? 'Selecionada' : focusedPhotoId === photo.id ? 'No monitor' : 'Preview'}</em>
            </div>
            <div className="photoCardActions">
              <button
                className={`miniActionButton ${photo.selected ? 'active' : ''}`}
                type="button"
                disabled={isPurchased}
                onClick={(event) => {
                  event.stopPropagation();
                  onTogglePhoto(photo.id);
                }}
              >
                {photo.selected ? 'Remover' : 'Selecionar'}
              </button>
              <button
                className={`miniActionButton favoriteButton ${photo.favorite ? 'active' : ''}`}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleFavorite(photo.id);
                }}
                aria-label={photo.favorite ? 'Remover dos favoritos' : 'Favoritar foto'}
              >
                {photo.favorite ? '★ Favorita' : '☆ Favoritar'}
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
