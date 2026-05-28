import type { AuthUser, ThemeMode } from '../lib/types';
import { APP_VERSION_LABEL } from '../lib/appVersion';

const titles: Record<string, string> = {
  dashboard: 'Visão geral',
  operation: 'Status da operação',
  'demo-guide': 'Demo comercial guiada',
  sessions: 'Sessões fotográficas',
  capture: 'Captura',
  chroma: 'Chroma Studio',
  'quick-sale': 'Venda Rápida',
  'post-tour': 'Pós-passeio',
  readiness: 'Implantação',
  saas: 'SaaS/Licença',
  reports: 'BI por funil',
  photographer: 'Fotógrafo Web',
  cashier: 'Caixa',
  audit: 'Auditoria',
  diagnostics: 'Diagnóstico',
  settings: 'Configurações'
};

type TopbarProps = {
  route: string;
  theme: ThemeMode;
  currentUser?: AuthUser | null;
  onToggleTheme: () => void;
  onLogout: () => void;
};

export function Topbar({ route, theme, currentUser, onToggleTheme, onLogout }: TopbarProps) {
  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">{APP_VERSION_LABEL}</p>
        <h1>{titles[route] ?? 'PicTour'}</h1>
      </div>
      <div className="topbarActions">
        <div className="searchBox">Buscar sessão, cliente ou código...</div>
        {currentUser && (
          <div className="userBadge">
            <strong>{currentUser.name}</strong>
            <span>{currentUser.role === 'MANAGER' ? 'Gestor/adm' : currentUser.adminPermissions ? 'Fotógrafo/Caixa + adm' : 'Fotógrafo/Caixa'}</span>
          </div>
        )}
        <button className="ghostButton" type="button" onClick={onToggleTheme}>
          {theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
        </button>
        <button className="ghostButton" type="button" onClick={onLogout}>Sair</button>
      </div>
    </header>
  );
}
