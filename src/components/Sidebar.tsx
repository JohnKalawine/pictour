import type { NavKey } from '../lib/types';
import pictourIcon from '../assets/PicTourIcon.png';

const items: Array<{ key: NavKey; label: string; icon: string }> = [
  { key: 'dashboard', label: 'Dashboard', icon: '▣' },
  { key: 'operation', label: 'Operação', icon: '◌' },
  { key: 'readiness', label: 'Implantação', icon: '▧' },
  { key: 'demo-guide', label: 'Demo Guiada', icon: '◨' },
  { key: 'saas', label: 'SaaS/Licença', icon: '◫' },
  { key: 'sessions', label: 'Sessões', icon: '◎' },
  { key: 'capture', label: 'Captura', icon: '◉' },
  { key: 'chroma', label: 'Chroma Studio', icon: '✦' },
  { key: 'quick-sale', label: 'Venda Rápida', icon: '◆' },
  { key: 'post-tour', label: 'Pós-passeio', icon: '◇' },
  { key: 'reports', label: 'BI/Funil', icon: '▥' },
  { key: 'photographer', label: 'Fotógrafo Web', icon: '▤' },
  { key: 'cashier', label: 'Caixa', icon: '◈' },
  { key: 'audit', label: 'Auditoria', icon: '☷' },
  { key: 'diagnostics', label: 'Diagnóstico', icon: '✓' },
  { key: 'settings', label: 'Configurações', icon: '⚙' }
];

type SidebarProps = {
  active: NavKey;
  canAccessSettings: boolean;
  visibleNavKeys?: Set<NavKey>;
  companyName?: string;
  collapsed?: boolean;
  onToggleCollapsed: () => void;
  onChange: (key: NavKey) => void;
};

export function Sidebar({ active, canAccessSettings, visibleNavKeys, companyName, collapsed = false, onToggleCollapsed, onChange }: SidebarProps) {
  const visibleItems = items.filter((item) => {
    if (visibleNavKeys) return visibleNavKeys.has(item.key);
    return (item.key !== 'settings' && item.key !== 'diagnostics') || canAccessSettings;
  });
  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`} aria-hidden={collapsed}>
      <div className="brandBlock">
        <div className="brandMark logoBrandMark"><img src={pictourIcon} alt="PicTour" /></div>
        <div className="brandCopy">
          <strong>PicTour</strong>
          <span>{companyName || 'Capture Station'}</span>
          <small>Capture Station</small>
        </div>
        <button
          className="sidebarToggleButton"
          type="button"
          title="Esconder menu lateral"
          aria-label="Esconder menu lateral"
          onClick={onToggleCollapsed}
        >
          ‹
        </button>
      </div>

      <nav className="navList">
        {visibleItems.map((item) => (
          <button
            key={item.key}
            className={`navItem ${active === item.key ? 'active' : ''}`}
            type="button"
            onClick={() => onChange(item.key)}
          >
            <span>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      <div className="sidebarFooter">
        <span className="statusDot" />
        Operação local pronta
      </div>
    </aside>
  );
}
