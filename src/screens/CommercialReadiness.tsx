import { useEffect, useMemo, useState } from 'react';
import type { AppSettings, AppUpdateInfo, CommercialOnboardingStep, LocalDatabase, SystemDiagnostics } from '../lib/types';
import { APP_VERSION_LABEL } from '../lib/appVersion';

type CommercialReadinessProps = {
  database: LocalDatabase;
  onNavigate: (route: 'settings' | 'diagnostics' | 'sessions' | 'capture' | 'reports') => void;
  onOpenDataFolder: () => void;
  onExportBackup: () => Promise<void>;
  onRestoreBackup: () => Promise<void>;
  onCheckForUpdates: () => Promise<AppUpdateInfo | void>;
  onUpdateSettings: (settings: Partial<AppSettings>) => Promise<void>;
  onLoadDemoData: () => Promise<void>;
};

const onboardingSteps: Array<{ id: CommercialOnboardingStep; title: string; description: string; action: string; route?: 'settings' | 'diagnostics' | 'sessions' | 'capture' | 'reports' }> = [
  { id: 'COMPANY', title: 'Empresa e estação', description: 'Nome do parque, cidade, estação principal e identidade operacional.', action: 'Abrir configurações', route: 'settings' },
  { id: 'LOCATIONS', title: 'Locais/atrações', description: 'Cadastre pontos de venda, atrações e estações para BI e filtros.', action: 'Configurar locais', route: 'settings' },
  { id: 'PACKAGES', title: 'Produtos, pacotes e regras de canal', description: 'Defina produtos digitais para galeria online e itens físicos apenas para balcão presencial.', action: 'Configurar pacotes', route: 'settings' },
  { id: 'MERCADO_PAGO', title: 'Mercado Pago real', description: 'Configure produção, Pix/cartão, webhook seguro e liberação automática da entrega.', action: 'Configurar pagamentos', route: 'settings' },
  { id: 'SECURITY', title: 'Segurança visual', description: 'Watermark dinâmica, escudo anti-print e proteção de preview.', action: 'Abrir segurança', route: 'settings' },
  { id: 'BACKUP', title: 'Backup e restauração', description: 'Faça o primeiro backup antes da operação real e valide a pasta de dados.', action: 'Exportar backup' },
  { id: 'DEMO_DONE', title: 'Modo demonstração', description: 'Carregue dados demo para apresentar o sistema vivo em reuniões comerciais.', action: 'Carregar demo' }
];

function statusBadge(ok: boolean) {
  return ok ? 'Pronto' : 'Pendente';
}

function formatDate(value?: string) {
  if (!value) return '—';
  return new Date(value).toLocaleString('pt-BR');
}

export function CommercialReadiness({ database, onNavigate, onOpenDataFolder, onExportBackup, onRestoreBackup, onCheckForUpdates, onUpdateSettings, onLoadDemoData }: CommercialReadinessProps) {
  const [diagnostics, setDiagnostics] = useState<SystemDiagnostics | null>(null);
  const [message, setMessage] = useState('Checklist comercial pronto para validar implantação.');
  const setup = database.settings.commercialSetup || {};
  const completed = new Set<CommercialOnboardingStep>(setup.completedStepIds || []);

  async function loadDiagnostics() {
    try {
      const result = await window.pictourDesktop?.getDiagnostics?.();
      if (result) setDiagnostics(result);
    } catch {
      setDiagnostics(null);
    }
  }

  useEffect(() => {
    loadDiagnostics();
  }, [database.version, database.sessions.length, database.photos.length, database.cashierSales.length]);

  const readiness = useMemo(() => {
    const settings = database.settings;
    const hasLocations = (settings.locations || []).some((item) => item.active !== false);
    const hasPackages = (settings.packages || []).some((item) => item.active !== false);
    const mpConfigured = Boolean(settings.mercadoPago?.enabled && settings.mercadoPago?.accessToken);
    const securePreview = Boolean(settings.antiPrint?.enabled);
    const backupReady = Boolean(setup.lastBackupAt || diagnostics?.lastBackupAt);
    const demoLoaded = Boolean(setup.demoModeLoaded || diagnostics?.demoModeLoaded);
    const completedCount = [settings.companyName, hasLocations, hasPackages, securePreview, backupReady, demoLoaded].filter(Boolean).length;
    return {
      companyReady: Boolean(settings.companyName && settings.locationName),
      hasLocations,
      hasPackages,
      mpConfigured,
      securePreview,
      backupReady,
      demoLoaded,
      score: Math.round((completedCount / 6) * 100)
    };
  }, [database.settings, diagnostics, setup.demoModeLoaded, setup.lastBackupAt]);

  async function toggleStep(stepId: CommercialOnboardingStep) {
    const next = completed.has(stepId)
      ? [...completed].filter((item) => item !== stepId)
      : [...completed, stepId];
    await onUpdateSettings({ commercialSetup: { ...setup, completedStepIds: next, onboardingCompleted: next.length >= onboardingSteps.length } });
    setMessage(completed.has(stepId) ? 'Etapa reaberta para revisão.' : 'Etapa marcada como concluída.');
  }

  async function handleStepAction(step: typeof onboardingSteps[number]) {
    if (step.id === 'BACKUP') {
      await onExportBackup();
      await loadDiagnostics();
      await toggleStep('BACKUP');
      return;
    }
    if (step.id === 'DEMO_DONE') {
      await onLoadDemoData();
      await loadDiagnostics();
      setMessage('Dados demo carregados. Agora o PicTour já abre com fluxo comercial demonstrável.');
      return;
    }
    if (step.route) onNavigate(step.route);
  }

  async function runCommercialCheck() {
    await loadDiagnostics();
    const result = await onCheckForUpdates();
    setMessage(result?.message || 'Checklist comercial atualizado.');
  }

  return (
    <div className="screenStack">
      <section className="heroPanel commercialHero">
        <div>
          <p className="eyebrow">{APP_VERSION_LABEL} • Comercial / SaaS</p>
          <h1>PicTour pronto para vender, instalar e demonstrar</h1>
          <p className="mutedText">Esta tela centraliza onboarding, demo, diagnóstico, backup, go-live, caixa assinado, cloud real e preparação comercial. O objetivo agora é sair de “produto apresentável” para “piloto vendável”.</p>
          <div className="actionRow">
            <button className="primaryButton" type="button" onClick={runCommercialCheck}>Rodar checklist</button>
            <button className="ghostButton" type="button" onClick={onOpenDataFolder}>Abrir pasta de dados</button>
            <button className="ghostButton" type="button" onClick={() => onNavigate('diagnostics')}>Diagnóstico completo</button>
          </div>
        </div>
        <div className="readinessScore">
          <span>Score comercial</span>
          <strong>{readiness.score}%</strong>
          <small>{APP_VERSION_LABEL}</small>
        </div>
      </section>

      <section className="statsGrid four">
        <div className="statCard"><span>Instalador</span><strong>{diagnostics?.isPackaged ? 'Empacotado' : 'Dev'}</strong><small>{diagnostics?.isPackaged ? 'Build instalada' : 'Use npm run build:app'}</small></div>
        <div className="statCard"><span>Backup</span><strong>{statusBadge(readiness.backupReady)}</strong><small>{formatDate(setup.lastBackupAt || diagnostics?.lastBackupAt)}</small></div>
        <div className="statCard"><span>Demo</span><strong>{readiness.demoLoaded ? 'Ativo' : 'Opcional'}</strong><small>{setup.demoLoadedAt ? formatDate(setup.demoLoadedAt) : 'Sem demo carregado'}</small></div>
        <div className="statCard"><span>Operação</span><strong>{database.sessions.length}/{database.cashierSales.length}</strong><small>Sessões / vendas</small></div>
      </section>

      <section className="panel">
        <div className="panelHeader inline">
          <div>
            <p className="eyebrow">Onboarding guiado</p>
            <h2>Checklist da primeira implantação</h2>
            <p className="mutedText">Marque etapas concluídas e use os atalhos para configurar o que ainda está pendente.</p>
          </div>
          <div className="actionRow">
            <button className="ghostButton" type="button" onClick={onRestoreBackup}>Restaurar backup</button>
            <button className="primaryButton" type="button" onClick={onExportBackup}>Exportar backup</button>
          </div>
        </div>
        <div className="infoBox">{message}</div>
        <div className="onboardingGrid">
          {onboardingSteps.map((step) => {
            const done = completed.has(step.id) ||
              (step.id === 'COMPANY' && readiness.companyReady) ||
              (step.id === 'LOCATIONS' && readiness.hasLocations) ||
              (step.id === 'PACKAGES' && readiness.hasPackages) ||
              (step.id === 'MERCADO_PAGO' && readiness.mpConfigured) ||
              (step.id === 'SECURITY' && readiness.securePreview) ||
              (step.id === 'BACKUP' && readiness.backupReady) ||
              (step.id === 'DEMO_DONE' && readiness.demoLoaded);
            return (
              <article key={step.id} className={`onboardingCard ${done ? 'done' : ''}`}>
                <div className="onboardingStatus">{done ? '✓' : '○'}</div>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                  <div className="actionRow compact">
                    <button className="ghostButton" type="button" onClick={() => handleStepAction(step)}>{step.action}</button>
                    <button className="linkButton" type="button" onClick={() => toggleStep(step.id)}>{completed.has(step.id) ? 'Reabrir' : 'Marcar OK'}</button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="panel twoColumnPanel">
        <div>
          <p className="eyebrow">Instalador profissional</p>
          <h2>Build comercial Windows</h2>
          <p className="mutedText">O projeto já possui electron-builder/NSIS. Para gerar o instalador no PC de build, rode:</p>
          <pre className="codeBlock">npm install{`\n`}npm run build:app</pre>
          <p className="mutedText">Saída esperada em <strong>release/</strong> com Setup.exe, atalhos e ícone PicTour.</p>
        </div>
        <div>
          <p className="eyebrow">Próximo roadmap</p>
          <h2>Roadmap comercial atual</h2>
          <div className="roadmapList">
            <span>v4.6.3 — Demo comercial guiada e dados fictícios premium</span>
            <span>Próximo: piloto real com landing, cloud, storage e Mercado Pago produção</span>
            <span>Landing page comercial do PicTour com screenshots reais</span>
            <span>Piloto controlado em atração/parque parceiro</span>
            <span>Depois: automação de assinatura e onboarding SaaS público</span>
          </div>
        </div>
      </section>
    </div>
  );
}
