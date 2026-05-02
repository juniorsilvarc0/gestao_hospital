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
import { PacientesListPage } from '@/pages/pacientes/PacientesListPage';
import { PacienteFormPage } from '@/pages/pacientes/PacienteFormPage';
import { PacienteDetailPage } from '@/pages/pacientes/PacienteDetailPage';
import { AgendaPage } from '@/pages/agenda/AgendaPage';
import { RecursosPage } from '@/pages/agenda/RecursosPage';
import { PainelChamadaPage } from '@/pages/PainelChamadaPage';
import { RecepcaoPage } from '@/pages/recepcao/RecepcaoPage';
import { TriagemPage } from '@/pages/triagem/TriagemPage';
import { AtendimentoDetalhePage } from '@/pages/atendimentos/AtendimentoDetalhePage';
import { MapaLeitosPage } from '@/pages/leitos/MapaLeitosPage';
import { PepPage } from '@/pages/pep/PepPage';
import { EvolucaoFormPage } from '@/pages/pep/EvolucaoFormPage';
import { PrescricaoFormPage } from '@/pages/pep/PrescricaoFormPage';
import { SinaisVitaisFormPage } from '@/pages/pep/SinaisVitaisFormPage';
import { DocumentoFormPage } from '@/pages/pep/DocumentoFormPage';
import { LaudosCentralPage } from '@/pages/laudos/LaudosCentralPage';
import { PainelFarmaciaPage } from '@/pages/farmacia/PainelFarmaciaPage';
import { LivroControladosPage } from '@/pages/farmacia/LivroControladosPage';
import { MapaSalasPage } from '@/pages/centro-cirurgico/MapaSalasPage';
import { AgendaCirurgiasPage } from '@/pages/centro-cirurgico/AgendaCirurgiasPage';
import { CirurgiaDetalhePage } from '@/pages/centro-cirurgico/CirurgiaDetalhePage';
import { AgendarCirurgiaPage } from '@/pages/centro-cirurgico/AgendarCirurgiaPage';
import { KitsCirurgicosPage } from '@/pages/cadastros/KitsCirurgicosPage';
import { CadernosGabaritosPage } from '@/pages/cadastros/CadernosGabaritosPage';
import { PacotesPage } from '@/pages/cadastros/PacotesPage';
import { ContasListPage } from '@/pages/contas/ContasListPage';
import { ContaDetalhePage } from '@/pages/contas/ContaDetalhePage';
import { LotesTissPage } from '@/pages/tiss/LotesTissPage';
import { LoteTissDetalhePage } from '@/pages/tiss/LoteTissDetalhePage';
import { GlosasListPage } from '@/pages/glosas/GlosasListPage';
import { GlosaDetalhePage } from '@/pages/glosas/GlosaDetalhePage';
import { GlosasDashboardPage } from '@/pages/glosas/GlosasDashboardPage';
import { ImportarGlosasTissPage } from '@/pages/glosas/ImportarGlosasTissPage';
import { NovaGlosaPage } from '@/pages/glosas/NovaGlosaPage';
import { CriteriosListPage } from '@/pages/repasse/CriteriosListPage';
import { CriterioFormPage } from '@/pages/repasse/CriterioFormPage';
import { RepassesListPage } from '@/pages/repasse/RepassesListPage';
import { RepasseDetalhePage } from '@/pages/repasse/RepasseDetalhePage';
import { ApurarCompetenciaPage } from '@/pages/repasse/ApurarCompetenciaPage';
import { FolhaPage } from '@/pages/repasse/FolhaPage';
import { FolhaPrestadorPage } from '@/pages/repasse/FolhaPrestadorPage';
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
      <Route path="/painel-chamada" element={<PainelChamadaPage />} />

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
        <Route path="/pacientes" element={<PacientesListPage />} />
        <Route
          path="/pacientes/novo"
          element={<PacienteFormPage mode="create" />}
        />
        <Route path="/pacientes/:uuid" element={<PacienteDetailPage />} />
        <Route
          path="/pacientes/:uuid/editar"
          element={<PacienteFormPage mode="edit" />}
        />
        <Route path="/agenda" element={<AgendaPage />} />
        <Route path="/agenda/recursos" element={<RecursosPage />} />
        <Route path="/recepcao" element={<RecepcaoPage />} />
        <Route path="/triagem" element={<TriagemPage />} />
        <Route
          path="/atendimentos/:uuid"
          element={<AtendimentoDetalhePage />}
        />
        <Route path="/leitos" element={<MapaLeitosPage />} />
        <Route path="/pep/:atendimentoUuid" element={<PepPage />} />
        <Route
          path="/pep/:atendimentoUuid/evolucoes/nova"
          element={<EvolucaoFormPage />}
        />
        <Route
          path="/pep/:atendimentoUuid/prescricoes/nova"
          element={<PrescricaoFormPage />}
        />
        <Route
          path="/pep/:atendimentoUuid/sinais-vitais/novo"
          element={<SinaisVitaisFormPage />}
        />
        <Route
          path="/atendimentos/:uuid/documentos/novo"
          element={<DocumentoFormPage />}
        />
        <Route path="/laudos" element={<LaudosCentralPage />} />

        {/* Farmácia (Fase 7) */}
        <Route path="/farmacia/painel" element={<PainelFarmaciaPage />} />
        <Route
          path="/farmacia/controlados"
          element={<LivroControladosPage />}
        />

        {/* Centro Cirúrgico (Fase 7) */}
        <Route
          path="/centro-cirurgico/mapa"
          element={<MapaSalasPage />}
        />
        <Route path="/cirurgias" element={<AgendaCirurgiasPage />} />
        <Route path="/cirurgias/nova" element={<AgendarCirurgiaPage />} />
        <Route path="/cirurgias/:uuid" element={<CirurgiaDetalhePage />} />

        {/* Cadastros vinculados ao centro cirúrgico */}
        <Route path="/cadastros/kits" element={<KitsCirurgicosPage />} />
        <Route
          path="/cadastros/gabaritos"
          element={<CadernosGabaritosPage />}
        />

        {/* Faturamento (Fase 8) */}
        <Route path="/cadastros/pacotes" element={<PacotesPage />} />
        <Route path="/contas" element={<ContasListPage />} />
        <Route path="/contas/:uuid" element={<ContaDetalhePage />} />

        {/* TISS (Fase 8) */}
        <Route path="/tiss/lotes" element={<LotesTissPage />} />
        <Route path="/tiss/lotes/:uuid" element={<LoteTissDetalhePage />} />

        {/* Glosas (Fase 8) */}
        <Route path="/glosas" element={<GlosasListPage />} />
        <Route path="/glosas/dashboard" element={<GlosasDashboardPage />} />
        <Route path="/glosas/importar" element={<ImportarGlosasTissPage />} />
        <Route path="/glosas/nova" element={<NovaGlosaPage />} />
        <Route path="/glosas/:uuid" element={<GlosaDetalhePage />} />

        {/* Repasse Médico (Fase 9) */}
        <Route path="/repasse" element={<RepassesListPage />} />
        <Route path="/repasse/apurar" element={<ApurarCompetenciaPage />} />
        <Route path="/repasse/criterios" element={<CriteriosListPage />} />
        <Route
          path="/repasse/criterios/novo"
          element={<CriterioFormPage mode="create" />}
        />
        <Route
          path="/repasse/criterios/:uuid"
          element={<CriterioFormPage mode="edit" />}
        />
        <Route path="/repasse/folha" element={<FolhaPage />} />
        <Route
          path="/repasse/folha/:prestadorUuid"
          element={<FolhaPrestadorPage />}
        />
        <Route path="/repasse/:uuid" element={<RepasseDetalhePage />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
