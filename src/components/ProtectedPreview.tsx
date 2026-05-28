import { useEffect, useMemo, useRef, useState } from 'react';
import type { AntiPrintSettings, Photo } from '../lib/types';

const defaultAntiPrint: Required<AntiPrintSettings> = {
  enabled: true,
  watermarkText: 'PICTOUR PREVIEW',
  includeSessionCode: true,
  includePhotoCode: true,
  includeTimestamp: true,
  includeStationName: false,
  opacity: 34,
  density: 18,
  rotationDeg: -24,
  noiseIntensity: 16,
  previewBlur: 0,
  resolutionGuard: true,
  blockContextMenu: true,
  blockDrag: true,
  shieldOnBlur: true,
  shieldAfterInactivitySeconds: 0,
  showSessionMeta: true
};

type ProtectedPreviewProps = {
  photo?: Photo;
  watermarkText: string;
  large?: boolean;
  antiPrint?: AntiPrintSettings;
  stationName?: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function buildWatermarkText(photo: Photo | undefined, fallbackText: string, settings: Required<AntiPrintSettings>, stationName?: string) {
  const parts = [settings.watermarkText || fallbackText || 'PICTOUR PREVIEW'];
  if (settings.includeSessionCode && photo?.sessionCode) parts.push(photo.sessionCode);
  if (settings.includePhotoCode && photo?.code) parts.push(photo.code);
  if (settings.includeStationName && stationName) parts.push(stationName);
  if (settings.includeTimestamp) parts.push(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
  return parts.filter(Boolean).join(' • ');
}

export function ProtectedPreview({ photo, watermarkText, large = false, antiPrint, stationName }: ProtectedPreviewProps) {
  const settings = useMemo<Required<AntiPrintSettings>>(() => ({ ...defaultAntiPrint, ...(antiPrint || {}) }), [antiPrint]);
  const [shielded, setShielded] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!settings.enabled) return undefined;

    const showShield = () => {
      if (!settings.shieldOnBlur) return;
      setShielded(true);
      window.setTimeout(() => setShielded(false), 1400);
    };
    const handleVisibility = () => { if (document.hidden) showShield(); };
    const handleBlur = () => showShield();
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key === 'printscreen' || (event.ctrlKey && ['p', 's', 'u'].includes(key))) {
        setShielded(true);
        window.setTimeout(() => setShielded(false), 1800);
      }
    };
    const resetInactivity = () => {
      if (!settings.shieldAfterInactivitySeconds) return;
      setShielded(false);
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => setShielded(true), settings.shieldAfterInactivitySeconds * 1000);
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousemove', resetInactivity);
    window.addEventListener('pointerdown', resetInactivity);
    resetInactivity();

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousemove', resetInactivity);
      window.removeEventListener('pointerdown', resetInactivity);
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };
  }, [settings.enabled, settings.shieldOnBlur, settings.shieldAfterInactivitySeconds]);

  const finalText = buildWatermarkText(photo, watermarkText, settings, stationName);
  const markCount = clamp(Math.round(settings.density), 8, 48);
  const opacity = clamp(settings.opacity, 5, 85) / 100;
  const noiseOpacity = clamp(settings.noiseIntensity, 0, 60) / 100;
  const blur = clamp(settings.previewBlur, 0, 6);

  return (
    <div
      className={`protectedPreview ${large ? 'large' : ''} ${settings.enabled ? 'antiPrintEnabled' : ''} ${settings.resolutionGuard ? 'lowResGuard' : ''}`}
      onContextMenu={(event) => { if (settings.blockContextMenu) event.preventDefault(); }}
      style={{
        ['--wm-opacity' as string]: opacity,
        ['--wm-rotation' as string]: `${settings.rotationDeg}deg`,
        ['--noise-opacity' as string]: noiseOpacity,
        ['--preview-blur' as string]: `${blur}px`
      }}
    >
      {photo?.previewUrl ? (
        <img className="realPhotoPreview" src={photo.previewUrl} alt={photo.label} draggable={!settings.blockDrag} />
      ) : (
        <div className="mockPhotoScene">
          <div className="mockSun" />
          <div className="mockMountains" />
          <div className="mockSubject" />
          <div className="mockReflection" />
        </div>
      )}
      {settings.enabled && <div className="noiseOverlay" />}
      {settings.enabled && (
        <div className="watermarkPattern" aria-hidden="true">
          {Array.from({ length: markCount }, (_, index) => <span key={index}>{finalText}</span>)}
        </div>
      )}
      {settings.showSessionMeta && (
        <div className="previewMeta">
          <strong>{photo?.code ?? 'F01'}</strong>
          <span>{photo?.label ?? 'Preview protegida'}</span>
        </div>
      )}
      {shielded && (
        <div className="antiPrintShield">
          <strong>Preview protegido</strong>
          <span>Volte para a janela do PicTour para visualizar.</span>
        </div>
      )}
    </div>
  );
}
