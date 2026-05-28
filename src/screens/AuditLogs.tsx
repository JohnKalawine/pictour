import { useMemo, useState } from 'react';
import type { AuditCategory, AuditLog, AuditLogFilters, AuditSeverity, AuthUser } from '../lib/types';

const categoryLabels: Record<AuditCategory | 'ALL', string> = {
  ALL: 'Todas',
  AUTH: 'Login e segurança',
  SETTINGS: 'Configurações',
  SESSION: 'Sessões',
  PHOTO: 'Fotos',
  SALE: 'Vendas',
  CASHIER: 'Caixa',
  CLOUD: 'Cloud',
  BACKUP: 'Backup',
  CUSTOMER_DISPLAY: 'Monitor do cliente',
  SYSTEM: 'Sistema'
};

const severityLabels: Record<AuditSeverity | 'ALL', string> = {
  ALL: 'Todas',
  INFO: 'Informativo',
  WARNING: 'Atenção',
  CRITICAL: 'Crítico'
};

const categoryOptions: Array<AuditCategory | 'ALL'> = ['ALL', 'AUTH', 'SETTINGS', 'SESSION', 'PHOTO', 'SALE', 'CASHIER', 'CLOUD', 'BACKUP', 'CUSTOMER_DISPLAY', 'SYSTEM'];
const severityOptions: Array<AuditSeverity | 'ALL'> = ['ALL', 'INFO', 'WARNING', 'CRITICAL'];

type AuditLogsProps = {
  logs: AuditLog[];
  currentUser: AuthUser;
  onExportCsv: (logs: AuditLog[]) => Promise<void>;
};

function formatDate(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });
}

function matchesPeriod(log: AuditLog, period: AuditLogFilters['period']) {
  if (!period || period === 'ALL') return true;
  const createdAt = new Date(log.createdAt || '').getTime();
  if (!Number.isFinite(createdAt)) return false;
  const now = Date.now();
  const ranges = {
    '1H': 60 * 60 * 1000,
    '3H': 3 * 60 * 60 * 1000,
    DAY: 24 * 60 * 60 * 1000,
    WEEK: 7 * 24 * 60 * 60 * 1000,
    MONTH: 30 * 24 * 60 * 60 * 1000
  } as const;
  return now - createdAt <= ranges[period];
}

function shortDetails(details?: Record<string, unknown>) {
  if (!details || !Object.keys(details).length) return '—';
  try {
    const text = JSON.stringify(details);
    return text.length > 180 ? `${text.slice(0, 180)}...` : text;
  } catch {
    return 'Detalhes indisponíveis';
  }
}

export function AuditLogs({ logs, currentUser, onExportCsv }: AuditLogsProps) {
  const [filters, setFilters] = useState<AuditLogFilters>({ category: 'ALL', severity: 'ALL', period: 'DAY', query: '', actorUsername: '' });
  const [expandedId, setExpandedId] = useState<string>('');
  const [message, setMessage] = useState('Auditoria pronta. Ações sensíveis de caixa, venda, assinatura, galeria e entrega ficam registradas mesmo quando o resultado é negativo.');

  const actors = useMemo(() => {
    const unique = new Map<string, string>();
    logs.forEach((log) => {
      const key = (log.actorUsername || log.actorName || '').trim();
      if (key) unique.set(key.toLowerCase(), log.actorName || key);
    });
    return Array.from(unique.entries()).map(([username, name]) => ({ username, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const query = String(filters.query || '').trim().toLowerCase();
    const actor = String(filters.actorUsername || '').trim().toLowerCase();
    return [...logs]
      .filter((log) => !filters.category || filters.category === 'ALL' || log.category === filters.category)
      .filter((log) => !filters.severity || filters.severity === 'ALL' || log.severity === filters.severity)
      .filter((log) => matchesPeriod(log, filters.period))
      .filter((log) => !actor || String(log.actorUsername || log.actorName || '').toLowerCase() === actor)
      .filter((log) => {
        if (!query) return true;
        const haystack = [log.action, log.summary, log.actorName, log.actorUsername, log.entityLabel, log.entityId, JSON.stringify(log.details || {})].join(' ').toLowerCase();
        return haystack.includes(query);
      })
      .sort((a, b) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime());
  }, [filters, logs]);

  const criticalCount = filteredLogs.filter((log) => log.severity === 'CRITICAL').length;
  const warningCount = filteredLogs.filter((log) => log.severity === 'WARNING').length;

  async function exportFiltered() {
    await onExportCsv(filteredLogs);
    setMessage(`${filteredLogs.length} registro(s) enviados para exportação CSV.`);
  }

  return (
    <div className="screenStack auditScreen">
      <section className="panel heroPanel auditHeroPanel">
        <div>
          <p className="eyebrow">Auditoria</p>
          <h2>Logs de ações sensíveis</h2>
          <p className="mutedParagraph">Rastreie login, configurações, caixa assinado, sangrias, troca de turno, venda modular, galeria digital, backup, cloud, storage e entrega de fotos.</p>
        </div>
        <div className="auditHeroStats">
          <div><strong>{filteredLogs.length}</strong><span>eventos filtrados</span></div>
          <div><strong>{criticalCount}</strong><span>críticos</span></div>
          <div><strong>{warningCount}</strong><span>alertas</span></div>
        </div>
      </section>

      <section className="panel auditFilterPanel">
        <div className="cashierFilterGrid auditFilterGrid">
          <label>
            Período
            <select value={filters.period || 'ALL'} onChange={(event) => setFilters((current) => ({ ...current, period: event.target.value as AuditLogFilters['period'] }))}>
              <option value="1H">Última 1h</option>
              <option value="3H">Últimas 3h</option>
              <option value="DAY">Dia todo</option>
              <option value="WEEK">1 semana</option>
              <option value="MONTH">1 mês</option>
              <option value="ALL">Tudo</option>
            </select>
          </label>
          <label>
            Categoria
            <select value={filters.category || 'ALL'} onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value as AuditCategory | 'ALL' }))}>
              {categoryOptions.map((category) => <option key={category} value={category}>{categoryLabels[category]}</option>)}
            </select>
          </label>
          <label>
            Severidade
            <select value={filters.severity || 'ALL'} onChange={(event) => setFilters((current) => ({ ...current, severity: event.target.value as AuditSeverity | 'ALL' }))}>
              {severityOptions.map((severity) => <option key={severity} value={severity}>{severityLabels[severity]}</option>)}
            </select>
          </label>
          <label>
            Usuário
            <select value={filters.actorUsername || ''} onChange={(event) => setFilters((current) => ({ ...current, actorUsername: event.target.value }))}>
              <option value="">Todos</option>
              {actors.map((actor) => <option key={actor.username} value={actor.username}>{actor.name} @{actor.username}</option>)}
            </select>
          </label>
          <label>
            Buscar
            <input value={filters.query || ''} placeholder="venda, backup, sessão..." onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))} />
          </label>
          <button className="ghostButton" type="button" onClick={exportFiltered}>Exportar CSV</button>
        </div>
        <div className="infoBox">{message} Usuário atual: <strong>{currentUser.name}</strong> @{currentUser.username}</div>
      </section>

      <section className="panel auditTablePanel">
        <div className="tableWrapper">
          <table className="cashierTable auditTable">
            <thead>
              <tr>
                <th>Data/hora</th>
                <th>Nível</th>
                <th>Categoria</th>
                <th>Ação</th>
                <th>Usuário</th>
                <th>Resumo</th>
                <th>Entidade</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((log) => (
                <tr key={log.id} className={`auditRow severity${log.severity}`} onClick={() => setExpandedId((current) => current === log.id ? '' : log.id)}>
                  <td>{formatDate(log.createdAt)}</td>
                  <td><span className={`severityPill severity${log.severity}`}>{severityLabels[log.severity]}</span></td>
                  <td>{categoryLabels[log.category] || log.category}</td>
                  <td><code>{log.action}</code></td>
                  <td>{log.actorName || 'Sistema'}{log.actorUsername ? <small>@{log.actorUsername}</small> : null}</td>
                  <td>{log.summary}<div className={`auditDetails ${expandedId === log.id ? 'expanded' : ''}`}>{shortDetails(log.details)}</div></td>
                  <td>{[log.entityType, log.entityLabel || log.entityId].filter(Boolean).join(' • ') || '—'}</td>
                </tr>
              ))}
              {!filteredLogs.length && (
                <tr><td colSpan={7}>Nenhum log encontrado com os filtros atuais.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
