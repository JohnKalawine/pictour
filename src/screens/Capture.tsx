import { useEffect, useMemo, useRef, useState } from 'react';
import { backgrounds } from '../lib/mockData';
import type { PhotoSession, QuickScenario } from '../lib/types';

type CaptureProps = {
  sessions: PhotoSession[];
  selectedSessionCode: string;
  quickScenarios?: QuickScenario[];
  onSelectSession: (sessionCode: string) => void;
  onImportFiles: () => void;
  onImportFolder: () => void;
  onCameraCapture: (dataUrl: string) => Promise<void>;
  syncMessage: string;
};

type CameraDevice = {
  deviceId: string;
  label: string;
};

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

export function Capture({
  sessions,
  selectedSessionCode,
  quickScenarios = [],
  onSelectSession,
  onImportFiles,
  onImportFolder,
  onCameraCapture,
  syncMessage
}: CaptureProps) {
  const activeSession = sessions.find((session) => session.code === selectedSessionCode) ?? sessions[0];
  const hasOpenSessions = sessions.length > 0;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [cameraStatus, setCameraStatus] = useState('Câmera parada. Clique em “Iniciar câmera”.');
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [flash, setFlash] = useState(false);
  const configuredQuickScenarios = useMemo(() => (
    quickScenarios.length
      ? quickScenarios.filter((scenario) => scenario.isActive !== false).sort((a, b) => Number(a.sortOrder || 999) - Number(b.sortOrder || 999))
      : backgrounds.map((name, index) => ({ id: `quick_default_${index}`, name, imageUrl: undefined, thumbnailUrl: undefined, isDefault: true, isActive: true, sortOrder: index + 1 }))
  ), [quickScenarios]) as QuickScenario[];
  const [selectedQuickBackground, setSelectedQuickBackground] = useState(configuredQuickScenarios[0]?.id || '');
  const [quickScenarioMessage, setQuickScenarioMessage] = useState('Escolha um cenário rápido para deixar a próxima etapa de edição pré-organizada.');

  async function refreshDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setCameraStatus('Este ambiente não expôs acesso à câmera. Rode pelo Electron com npm run dev.');
      return;
    }

    const allDevices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = allDevices
      .filter((device) => device.kind === 'videoinput')
      .map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || `Câmera ${index + 1}`
      }));

    setDevices(videoDevices);
    setSelectedDeviceId((current) => current || videoDevices[0]?.deviceId || '');
  }

  async function startCamera(deviceId = selectedDeviceId) {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraStatus('Captura por câmera não está disponível neste ambiente.');
      return;
    }

    try {
      stopStream(streamRef.current);
      const constraints: MediaStreamConstraints = {
        video: deviceId
          ? { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
          : { width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setIsCameraOn(true);
      setCameraStatus('Câmera ao vivo. Enquadre o cliente e clique em “Tirar foto”.');
      await refreshDevices();
    } catch (error) {
      console.error(error);
      setIsCameraOn(false);
      setCameraStatus('Não consegui acessar a câmera. Verifique permissão do Windows/navegador e se outra aplicação está usando a câmera.');
    }
  }

  function stopCamera() {
    stopStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsCameraOn(false);
    setCameraStatus('Câmera parada.');
  }

  async function changeCamera(nextDeviceId: string) {
    setSelectedDeviceId(nextDeviceId);
    if (isCameraOn) await startCamera(nextDeviceId);
  }

  async function captureFrame() {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!activeSession) {
      setCameraStatus('Crie ou selecione uma sessão antes de fotografar.');
      return;
    }

    if (!video || !canvas || !video.videoWidth || !video.videoHeight) {
      setCameraStatus('A câmera ainda não está pronta para captura. Aguarde o preview carregar.');
      return;
    }

    try {
      setIsCapturing(true);
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas indisponível.');

      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/png', 0.95);
      await onCameraCapture(dataUrl);

      setFlash(true);
      window.setTimeout(() => setFlash(false), 180);
      setCameraStatus(`Foto salva na sessão ${activeSession.code}.`);
    } catch (error) {
      console.error(error);
      setCameraStatus('Não consegui salvar a foto capturada. Tente novamente.');
    } finally {
      setIsCapturing(false);
    }
  }

  useEffect(() => {
    refreshDevices().catch((error) => {
      console.error(error);
      setCameraStatus('Não consegui listar câmeras disponíveis.');
    });

    return () => stopCamera();
  }, []);

  useEffect(() => {
    if (!configuredQuickScenarios.length) return;
    if (!configuredQuickScenarios.some((scenario) => scenario.id === selectedQuickBackground)) {
      setSelectedQuickBackground(configuredQuickScenarios[0].id);
    }
  }, [configuredQuickScenarios, selectedQuickBackground]);

  return (
    <div className="captureLayout">
      <section className="panel cameraPanel">
        <div className="panelHeader inline">
          <div>
            <p className="eyebrow">Capture Station</p>
            <h2>Câmera / importação local</h2>
          </div>
          <span className="pill open">{activeSession?.code ?? 'Sem sessão'}</span>
        </div>

        <div className="captureControlsGrid">
          <div>
            <label className="fieldLabel">Sessão ativa</label>
            <select value={activeSession?.code ?? ''} onChange={(event) => onSelectSession(event.target.value)} disabled={!hasOpenSessions}>
              {!hasOpenSessions && <option value="">Nenhuma sessão aberta</option>}
              {sessions.map((session) => (
                <option key={session.id} value={session.code}>{session.code} — {session.customerName}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="fieldLabel">Câmera</label>
            <select value={selectedDeviceId} onChange={(event) => changeCamera(event.target.value)}>
              {devices.length === 0 && <option value="">Nenhuma câmera detectada</option>}
              {devices.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>{device.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className={`cameraFrame liveFrame ${isCameraOn ? 'isLive' : ''}`}>
          <video ref={videoRef} className="cameraVideo" muted playsInline />
          {!isCameraOn && (
            <div className="cameraIdleOverlay">
              <div className="dropZoneIcon">📸</div>
              <strong>Preview da câmera</strong>
              <span>{hasOpenSessions ? 'Inicie a câmera para fotografar direto pelo PicTour.' : 'Crie ou reabra uma sessão antes de capturar fotos.'}</span>
            </div>
          )}
          <div className="cameraGrid" />
          <div className="cameraCrosshair" />
          {flash && <div className="captureFlash" />}
          <div className="cameraHint">{cameraStatus}</div>
        </div>
        <canvas ref={canvasRef} className="hiddenCanvas" />

        <div className="actionRow wrapActions">
          {!isCameraOn ? (
            <button className="primaryButton" type="button" onClick={() => startCamera()} disabled={!hasOpenSessions}>Iniciar câmera</button>
          ) : (
            <button className="ghostButton" type="button" onClick={stopCamera}>Parar câmera</button>
          )}
          <button className="primaryButton" type="button" onClick={captureFrame} disabled={!hasOpenSessions || !isCameraOn || isCapturing}>
            {isCapturing ? 'Salvando...' : 'Tirar foto'}
          </button>
          <button className="ghostButton" type="button" onClick={onImportFiles} disabled={!hasOpenSessions}>Importar arquivos</button>
          <button className="ghostButton" type="button" onClick={onImportFolder} disabled={!hasOpenSessions}>Importar pasta</button>
        </div>

        {!hasOpenSessions && (
          <div className="infoBox warnBox">Nenhuma sessão aberta disponível. Vá em Sessões e crie ou reabra uma sessão para usar a captura.</div>
        )}
        <div className="infoBox">{syncMessage}</div>
      </section>

      <aside className="panel sidePanel">
        <p className="eyebrow">Cenários rápidos</p>
        <h2>Aplicar automaticamente</h2>
        <p className="mutedText">Selecione o cenário de referência da sessão. A captura continua salvando o original, mas o operador agora tem feedback claro do cenário escolhido.</p>
        <div className="backgroundList">
          {configuredQuickScenarios.map((scenario) => (
            <button
              key={scenario.id}
              type="button"
              className={scenario.id === selectedQuickBackground ? 'active' : ''}
              onClick={() => {
                setSelectedQuickBackground(scenario.id);
                setQuickScenarioMessage(`Cenário rápido selecionado: ${scenario.name}.`);
              }}
            >
              {scenario.thumbnailUrl || scenario.imageUrl ? <img className="backgroundThumb imageThumb" src={scenario.thumbnailUrl || scenario.imageUrl} alt="" /> : <span className="backgroundThumb" />}
              <div>
                <strong>{scenario.name}</strong>
                <small>{scenario.id === selectedQuickBackground ? 'Selecionado' : scenario.isDefault ? 'Padrão' : 'Personalizado'}</small>
              </div>
            </button>
          ))}
          {!configuredQuickScenarios.length && <div className="infoBox compactInfo">Nenhum cenário rápido ativo. Ative ou cadastre em Configurações.</div>}
        </div>
        <div className="infoBox compactInfo">{quickScenarioMessage}</div>
      </aside>
    </div>
  );
}
