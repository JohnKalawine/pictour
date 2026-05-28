import { APP_VERSION_LABEL } from '../lib/appVersion';
import { useState } from 'react';
import pictourIcon from '../assets/PicTourIcon.png';
import type { AuthUser, ChangePasswordResult, LoginResult } from '../lib/types';

type LoginScreenProps = {
  onLogin: (username: string, password: string) => Promise<LoginResult>;
  onChangePassword: (username: string, currentPassword: string, newPassword: string) => Promise<ChangePasswordResult>;
  onLoggedIn: (user: AuthUser) => void;
};

export function LoginScreen({ onLogin, onChangePassword, onLoggedIn }: LoginScreenProps) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin12345');
  const [message, setMessage] = useState('Login padrão inicial: admin / admin12345');
  const [loading, setLoading] = useState(false);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [pendingUser, setPendingUser] = useState<AuthUser | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      const result = await onLogin(username, password);
      setMessage(result.message);
      if (result.ok && result.user) {
        if (result.user.forcePasswordChange) {
          setPendingUser(result.user);
          setMustChangePassword(true);
          setMessage('Primeiro acesso detectado. Troque a senha padrão antes de continuar. Segurança de balcão não pode ser enfeite de Natal.');
          return;
        }
        onLoggedIn(result.user);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordChange(event: React.FormEvent) {
    event.preventDefault();
    if (!pendingUser) return;
    if (newPassword !== confirmPassword) {
      setMessage('A confirmação não bate com a nova senha.');
      return;
    }
    setLoading(true);
    try {
      const result = await onChangePassword(pendingUser.username, password, newPassword);
      setMessage(result.message);
      if (result.ok && result.user) onLoggedIn(result.user);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="loginShell">
      <section className="loginCard">
        <div className="loginLogo"><img src={pictourIcon} alt="PicTour" /></div>
        <p className="eyebrow">{APP_VERSION_LABEL}</p>
        <h1>{mustChangePassword ? 'Trocar senha inicial' : 'Entrar na operação'}</h1>
        <p className="mutedParagraph">
          {mustChangePassword
            ? 'A senha padrão precisa ser trocada no primeiro uso da empresa.'
            : 'Use um usuário gestor/adm, fotógrafo ou caixa cadastrado. Configurações ficam protegidas por permissão.'}
        </p>

        {!mustChangePassword ? (
          <form className="loginForm" onSubmit={handleSubmit}>
            <label>Login</label>
            <input value={username} onChange={(event) => setUsername(event.target.value)} autoFocus />
            <label>Senha</label>
            <input value={password} type="password" onChange={(event) => setPassword(event.target.value)} />
            <button className="primaryButton fullWidth" type="submit" disabled={loading}>{loading ? 'Entrando...' : 'Entrar'}</button>
          </form>
        ) : (
          <form className="loginForm" onSubmit={handlePasswordChange}>
            <label>Nova senha</label>
            <input value={newPassword} type="password" onChange={(event) => setNewPassword(event.target.value)} autoFocus />
            <label>Confirmar nova senha</label>
            <input value={confirmPassword} type="password" onChange={(event) => setConfirmPassword(event.target.value)} />
            <button className="primaryButton fullWidth" type="submit" disabled={loading}>{loading ? 'Salvando...' : 'Salvar e entrar'}</button>
            <button className="ghostButton fullWidth" type="button" disabled={loading} onClick={() => { setMustChangePassword(false); setPendingUser(null); }}>
              Voltar ao login
            </button>
          </form>
        )}

        <div className="infoBox">{message}</div>
      </section>
    </main>
  );
}
