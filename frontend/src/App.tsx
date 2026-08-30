import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { InterviewAccessRoute } from './components/InterviewAccessRoute';
import { ProtectedRoute } from './components/ProtectedRoute';
import { TechAccessRoute } from './components/TechAccessRoute';
import { AppShell } from './layouts/AppShell';
import { CandidateJoinPage } from './pages/CandidateJoinPage';
import { CandidatesPage } from './pages/CandidatesPage';
import { DashboardPage } from './pages/DashboardPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { InterviewManagementPage } from './pages/InterviewManagementPage';
import { LiveInterviewListPage } from './pages/LiveInterviewListPage';
import { LiveInterviewLobbyPage } from './pages/LiveInterviewLobbyPage';
import { LiveInterviewReviewPage } from './pages/LiveInterviewReviewPage';
import { LiveInterviewRoomPage } from './pages/LiveInterviewRoomPage';
import { LoginPage } from './pages/LoginPage';
import { QuestionBankPage } from './pages/QuestionBankPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import { TechCandidateJoinPage } from './pages/TechCandidateJoinPage';
import { TechnicalInterviewListPage } from './pages/TechnicalInterviewListPage';
import { TechnicalReviewPage } from './pages/TechnicalReviewPage';
import { TechnicalTakePage } from './pages/TechnicalTakePage';
import { UsersPage } from './pages/UsersPage';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/join/:token" element={<CandidateJoinPage />} />
        <Route path="/tech-join/:token" element={<TechCandidateJoinPage />} />

        <Route element={<InterviewAccessRoute />}>
          <Route
            path="/live-interview/:id/lobby"
            element={<LiveInterviewLobbyPage />}
          />
          <Route
            path="/live-interview/:id/room"
            element={<LiveInterviewRoomPage />}
          />
        </Route>

        <Route element={<TechAccessRoute />}>
          <Route
            path="/technical-interview/:id/take"
            element={<TechnicalTakePage />}
          />
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/interviews" element={<InterviewManagementPage />} />
            <Route path="/live-interview" element={<LiveInterviewListPage />} />
            <Route
              path="/live-interview/:id/review"
              element={<LiveInterviewReviewPage />}
            />
            <Route
              path="/technical-interview"
              element={<TechnicalInterviewListPage />}
            />
            <Route
              path="/technical-interview/:id/review"
              element={<TechnicalReviewPage />}
            />
            <Route path="/candidates" element={<CandidatesPage />} />
            <Route path="/question-bank" element={<QuestionBankPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthProvider>
  );
}
