import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

type AccessQrCardProps = {
  url: string;
  accessCode?: string;
  label?: string;
};

export function AccessQrCard({ url, accessCode, label = 'Galeria pós-passeio' }: AccessQrCardProps) {
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [qrError, setQrError] = useState('');

  useEffect(() => {
    let active = true;

    async function generateQr() {
      try {
        setQrError('');
        const dataUrl = await QRCode.toDataURL(url, {
          errorCorrectionLevel: 'M',
          margin: 1,
          scale: 8,
          color: {
            dark: '#050B14',
            light: '#FFFFFF'
          }
        });

        if (active) setQrDataUrl(dataUrl);
      } catch (error) {
        console.error(error);
        if (active) {
          setQrDataUrl('');
          setQrError('Não consegui gerar o QR automaticamente. Use o link abaixo.');
        }
      }
    }

    generateQr();
    return () => {
      active = false;
    };
  }, [url]);

  return (
    <div className="accessQrCard realQrCard">
      <div className="qrRealBox" aria-label="QR Code escaneável da galeria pós-passeio">
        {qrDataUrl ? <img src={qrDataUrl} alt="QR Code da galeria pós-passeio" /> : <span>QR</span>}
      </div>
      <div className="accessQrCopy">
        <span>{label}</span>
        <strong>{accessCode || '----'}</strong>
        <small>Código de acesso</small>
        {qrError && <small className="dangerText">{qrError}</small>}
      </div>
    </div>
  );
}
