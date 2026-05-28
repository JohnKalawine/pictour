import { useEffect, useMemo, useState } from 'react';
import type { AppUpdateInfo, SystemDiagnostics } from '../lib/types';
import { licenseStatusLabels, planLabels } from '../lib/license';

type DiagnosticsProps = {
  onOpenDataFolder: () => void;
  onCheckForUpdates: () => Promise<AppUpdateInfo | void>;
};

type CameraStatus = {
  supported: boolean;
  count: number;
  labels: string[];
  message: string;
};

function statusText(ok: boolean) {
  return ok ? 'OK' : 'Atenção';
}

export function Diagnostics({ onOpenDataFolder, onCheckForUpdates }: DiagnosticsProps) {
  const [diagnostics, setDiagnostics] = useState<SystemDiagnostics | null>(null);
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>({ supported: false, count: 0, labels: [], message: 'Verificando câmera...' });
  const [message, setMessage] = useState('Diagnóstico operacional pronto para rodar.');
  const [updateMessage, setUpdateMessage] = useState('Verificação de atualização ainda não executada.');

  async function loadDiagnostics() {
    try {
      const result = await window.pictourDesktop?.getDiagnostics?.();
      if (result) setDiagnostics(result);
      setMessage('Diagnóstico atualizado.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao carregar diagnóstico.');
    }
  }

  async function loadCameras() {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setCameraStatus({ supported: false, count: 0, labels: [], message: 'Este ambiente não permite listar câmeras.' });
      return;
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter((device) => device.kind === 'videoinput');
      setCameraStatus({
        supported: true,
        count: cameras.length,
        labels: cameras.map((camera, index) => camera.label || `Câmera ${index + 1}`),
        message: cameras.length ? `${cameras.length} câmera(s) detectada(s).` : 'Nenhuma câmera detectada ainda. Tente iniciar a câmera na aba Captura.'
      });
    } catch (error) {
      setCameraStatus({ supported: true, count: 0, labels: [], message: error instanceof Error ? error.message : 'Falha ao listar câmeras.' });
    }
  }

  useEffect(() => {
    loadDiagnostics();
    loadCameras();
  }, []);

  const checks = useMemo(() => {
    if (!diagnostics) return [];
    return [
      { label: 'Banco local', ok: diagnostics.databaseExists, detail: diagnostics.databasePath },
      { label: 'Migração segura', ok: Boolean((diagnostics.schemaVersion || 0) >= 28), detail: diagnostics.lastMigrationBackupPath ? `Backup pré-migração: ${diagnostics.lastMigrationBackupPath}` : `Schema ${diagnostics.schemaVersion || '—'} pronto` },
      { label: 'Atualizações', ok: !diagnostics.updateAvailable, detail: diagnostics.updateAvailable ? `Nova versão: ${diagnostics.updateLatestVersion}` : (diagnostics.lastUpdateCheckMessage || `Versão atual: ${diagnostics.appVersion}`) },
      { label: 'Biblioteca de fotos', ok: diagnostics.photoLibraryExists, detail: diagnostics.photoLibraryPath },
      { label: 'Galeria local', ok: diagnostics.publicGallery.enabled, detail: `${diagnostics.publicGallery.primaryUrl} • porta ${diagnostics.publicGallery.port}` },
      { label: 'Monitor do cliente', ok: diagnostics.customerDisplayOpen, detail: diagnostics.customerDisplayOpen ? 'Janela aberta' : 'Janela fechada' },
      { label: 'Mercado Pago', ok: diagnostics.mercadoPagoConfigured, detail: diagnostics.mercadoPagoConfigured ? 'Credenciais configuradas' : 'Não configurado ou desativado' },
      { label: 'Cloud/backend', ok: diagnostics.cloudConfigured, detail: diagnostics.cloudConfigured ? 'API cloud configurada' : 'Cloud desativada ou sem URL' },
      { label: 'Licença', ok: Boolean(diagnostics.licenseReady), detail: `${diagnostics.licensePlan ? planLabels[diagnostics.licensePlan] : 'Plano'} • ${diagnostics.licenseStatus ? licenseStatusLabels[diagnostics.licenseStatus] : 'sem status'} • ${diagnostics.licenseDaysLeft === null || diagnostics.licenseDaysLeft === undefined ? 'sem validade' : `${diagnostics.licenseDaysLeft} dia(s)`}` },
      { label: 'Recorte IA', ok: diagnostics.backgroundRemovalInstalled, detail: diagnostics.backgroundRemovalInstalled ? '@imgly/background-removal encontrado' : 'Pacote IA não instalado; fallback de chroma verde continua funcionando' },
      { label: 'Senha padrão admin', ok: !diagnostics.defaultAdminStillNeedsPasswordChange, detail: diagnostics.defaultAdminStillNeedsPasswordChange ? 'Troque a senha admin antes de usar em produção' : 'Senha inicial já foi trocada' },
      { label: 'Câmera', ok: cameraStatus.count > 0, detail: cameraStatus.message }
    ];
  }, [cameraStatus, diagnostics]);

  async function handleUpdateCheck() {
    const result = await onCheckForUpdates();
    if (result?.message) setUpdateMessage(result.message);
    await loadDiagnostics();
  }

  return (
    <div className="screenStack">
      <section className="panel">
        <div className="panelHeader inline">
          <div>
            <p className="eyebrow">Diagnóstico</p>
            <h2>Checklist operacional do PicTour</h2>
            <p className="mutedText">Use esta tela antes de colocar o balcão para vender: câmera, banco, galeria, cloud, Mercado Pago e IA.</p>
          </div>
          <div className="actionRow">
            <button className="ghostButton" type="button" onClick={onOpenDataFolder}>Abrir pasta de dados</button>
            <button className="ghostButton" type="button" onClick={handleUpdateCheck}>Verificar atualização</button>
            <button className="primaryButton" type="button" onClick={() => { loadDiagnostics(); loadCameras(); }}>Atualizar</button>
          </div>
        </div>
        <div className="infoBox">{message}</div>
        <div className="infoBox">{updateMessage}</div>
      </section>

      {diagnostics && (
        <section className="statsGrid four">
          <div className="statCard"><span>Versão</span><strong>{diagnostics.appVersion}</strong><small>{diagnostics.isPackaged ? 'Instalado/empacotado' : 'Modo desenvolvimento'}</small></div>
          <div className="statCard"><span>Dados locais</span><strong>{diagnostics.sessionCount}/{diagnostics.photoCount}</strong><small>Sessões / Fotos</small></div>
          <div className="statCard"><span>Vendas</span><strong>{diagnostics.saleCount}</strong><small>Registros no caixa</small></div>
          <div className="statCard"><span>Schema local</span><strong>{diagnostics.schemaVersion || '—'}</strong><small>{diagnostics.lastMigratedAt ? `Migrado: ${new Date(diagnostics.lastMigratedAt).toLocaleDateString('pt-BR')}` : 'Sem migração recente'}</small></div>
        </section>
      )}

      <section className="diagnosticGrid">
        {checks.map((check) => (
          <article key={check.label} className={`diagnosticCard ${check.ok ? 'ok' : 'warn'}`}>
            <div>
              <span>{check.label}</span>
              <strong>{statusText(check.ok)}</strong>
            </div>
            <p>{check.detail}</p>
          </article>
        ))}
      </section>

      {cameraStatus.labels.length > 0 && (
        <section className="panel">
          <p className="eyebrow">Câmeras detectadas</p>
          <div className="tagList">
            {cameraStatus.labels.map((label) => <span key={label} className="pillTag">{label}</span>)}
          </div>
        </section>
      )}
    </div>
  );
}
