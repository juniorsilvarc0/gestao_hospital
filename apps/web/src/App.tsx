/**
 * App — roteador principal pós-Fase 2.
 *
 * Rotas públicas: /login, /auth/forgot-password, /auth/reset-password.
 * Rotas protegidas (atrás de `<ProtectedRoute>` + `<AppLayout>`):
 *   - / (HomePage)
 *   - /profile/password (troca de senha)
 *   - /auth/mfa-setup (setup MFA — exige login)
 */
import { useEffect } from 'react';
import { Route, Routes, useNavigate } from 'react-router-dom';
import { LoginPage } from '@/pages/LoginPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { HomePage } from '@/pages/HomePage';
import { ChangePasswordPage } from '@/pages/ChangePasswordPage';
import { MfaSetupPage } from '@/pages/MfaSetupPage';
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage';
import { ResetPasswordPage } from '@/pages/ResetPasswordPage';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppLayout } from '@/components/AppLayout';
import { setOnUnauthorized } from '@/lib/api-client';

export function App(): JSX.Element {
  const navigate = useNavigate();

  // Liga o callback global de "sessão expirada" do api-client à navegação.
  useEffect(() => {
    setOnUnauthorized(() => {
      navigate('/login', { replace: true });
    });
    return () => {
      setOnUnauthorized(null);
    };
  }, [navigate]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/auth/reset-password" element={<ResetPasswordPage />} />

      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<HomePage />} />
        <Route path="/profile/password" element={<ChangePasswordPage />} />
        <Route path="/auth/mfa-setup" element={<MfaSetupPage />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
