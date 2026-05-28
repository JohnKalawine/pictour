import { useEffect, useMemo, useState } from 'react';
import type { AppLocation, PhotoSession, SetSessionStatusInput } from '../lib/types';

type SessionFilter = 'OPEN' | 'CLOSED' | 'ALL';

type SessionsProps = {
  sessions: PhotoSession[];
  locations: AppLocation[];
  selectedSessionCode: string;
  onSelectSession: (sessionCode: string) => void;
  onCreateSession: (customerName: string, locationName: string) => Promise<void>;
  onSetSessionStatus: (input: SetSessionStatusInput) => Promise<void>;
};

const filterLabels: Record<SessionFilter, string> = {
  OPEN: 'Abertas',
  CLOSED: 'Encerradas',
  ALL: 'Todas'
};

export function Sessions({ sessions, locations, selectedSessionCode, onSelectSession, onCreateSession, onSetSessionStatus }: SessionsProps) {
  const activeLocations = useMemo(() => locations.filter((location) => location.active !== false), [locations]);
  const [customerName, setCustomerName] = useState('');
  const [locationName, setLocationName] = useState(activeLocations[0]?.name || 'Parque Aventura');
  const [filter, setFilter] = useState<SessionFilter>('OPEN');

  useEffect(() => {
    if (activeLocations.length && !activeLocations.some((location) => location.name === locationName)) {
      setLocationName(activeLocations[0].name);
    }
  }, [activeLocations, locationName]);

  const sessionStats = useMemo(() => ({
    open: sessions.filter((session) => session.status !== 'CLOSED').length,
    closed: sessions.filter((session) => session.status === 'CLOSED').length,
    all: sessions.length
  }), [sessions]);

  const visibleSessions = useMemo(() => {
    if (filter === 'CLOSED') return sessions.filter((session) => session.status === 'CLOSED');
    if (filter === 'OPEN') return sessions.filter((session) => session.status !== 'CLOSED');
    return sessions;
  }, [filter, sessions]);

  async function handleCreateSession() {
    const cleanCustomerName = customerName.trim() || 'Cliente balcão';
    const cleanLocationName = locationName.trim() || activeLocations[0]?.name || 'Operação PicTour';
    await onCreateSession(cleanCustomerName, cleanLocationName);
    setCustomerName('');
    setFilter('OPEN');
  }

  async function handleCloseSession(session: PhotoSession) {
    const ok = window.confirm(`Encerrar a sessão ${session.code}? Ela sai da lista operacional padrão, mas continua disponível no filtro “Encerradas/Todas”.`);
    if (!ok) return;
    await onSetSessionStatus({ sessionCode: session.code, status: 'CLOSED' });
  }

  async function handleReopenSession(session: PhotoSession) {
    await onSetSessionStatus({ sessionCode: session.code, status: 'OPEN' });
    onSelectSession(session.code);
    setFilter('OPEN');
  }

  return (
    <div className="screenStack">
      <section className="panelHeader">
        <div>
          <p className="eyebrow">Sessões</p>
          <h2>Controle por visitante, grupo ou passeio</h2>
        </div>
      </section>

      <section className="panel compactForm">
        <div>
          <p className="eyebrow">Nova sessão</p>
          <h2>Criar atendimento</h2>
        </div>
        <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Nome do cliente ou grupo" />
        <select value={locationName} onChange={(event) => setLocationName(event.target.value)}>
          {activeLocations.map((location) => (
            <option key={location.id} value={location.name}>{location.name}</option>
          ))}
          {!activeLocations.length && <option value="Operação PicTour">Operação PicTour</option>}
        </select>
        <button className="primaryButton" type="button" onClick={handleCreateSession}>Nova sessão</button>
      </section>

      <section className="panel sessionControlPanel">
        <div>
          <p className="eyebrow">Limpeza operacional</p>
          <h2>Encerrar sessões finalizadas</h2>
          <p className="mutedText">Use “Encerrar” quando o atendimento daquele grupo acabou. Assim a Venda Rápida e Captura não viram um cemitério de sessões antigas.</p>
        </div>
        <div className="photoFilterBar sessionFilterBar">
          {(['OPEN', 'CLOSED', 'ALL'] as SessionFilter[]).map((item) => {
            const count = item === 'OPEN' ? sessionStats.open : item === 'CLOSED' ? sessionStats.closed : sessionStats.all;
            return (
              <button key={item} className={filter === item ? 'active' : ''} type="button" onClick={() => setFilter(item)}>
                {filterLabels[item]} <span>{count}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="tablePanel">
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Cliente</th>
              <th>Local</th>
              <th>Fotos</th>
              <th>Pós-passeio</th>
              <th>Status</th>
              <th>Ação</th>
            </tr>
          </thead>
          <tbody>
            {visibleSessions.map((session) => (
              <tr key={session.id} className={session.code === selectedSessionCode ? 'activeRow' : ''}>
                <td><strong>{session.code}</strong></td>
                <td>{session.customerName}</td>
                <td>{session.locationName}</td>
                <td>{session.photoCount}</td>
                <td>{session.postTourEnabled ? `Ativo até ${session.expiresAt}` : 'Desativado'}</td>
                <td><span className={`pill ${session.status.toLowerCase()}`}>{session.status === 'CLOSED' ? 'CLOSED' : session.status}</span></td>
                <td>
                  <div className="rowActions">
                    {session.status !== 'CLOSED' && <button className="miniButton" type="button" onClick={() => onSelectSession(session.code)}>Usar</button>}
                    {session.status !== 'CLOSED'
                      ? <button className="dangerMiniButton" type="button" onClick={() => handleCloseSession(session)}>Encerrar</button>
                      : <button className="miniButton" type="button" onClick={() => handleReopenSession(session)}>Reabrir</button>}
                  </div>
                </td>
              </tr>
            ))}
            {!visibleSessions.length && (
              <tr>
                <td colSpan={7} className="emptyTableCell">Nenhuma sessão neste filtro.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
