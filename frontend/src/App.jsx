import { Navigate, Route, Routes } from "react-router-dom";
import LoginPage from "./pages/LoginPage.jsx";
import RegisterPage from "./pages/RegisterPage.jsx";
import ConsultantDashboard from "./pages/ConsultantDashboard.jsx";
import ConsultantConnectTeamsPage from "./pages/ConsultantConnectTeamsPage.jsx";
import AppShell from "./components/AppShell.jsx";
import ManagerOverviewPage from "./pages/ManagerOverviewPage.jsx";
import ManagerConsultantsPage from "./pages/ManagerConsultantsPage.jsx";
import MeetingReportPage from "./pages/MeetingReportPage.jsx";
import AccountPage from "./pages/AccountPage.jsx";
import ConsultantDetailPage from "./pages/ConsultantDetailPage.jsx";
import ProtectedRoute from "./routes/ProtectedRoute.jsx";
import { useAuth } from "./auth/AuthContext.jsx";
import ManualScriptAnalysisPage from "./pages/ManualScriptAnalysisPage.jsx";
import ReportsListPage from "./pages/ReportsListPage.jsx";
import ManagerPerformancePage from "./pages/ManagerPerformancePage.jsx";
import PresalesCompleteReportPage from "./pages/PresalesCompleteReportPage.jsx";
import { useParams } from "react-router-dom";

function LegacyMeetingReportRedirect() {
  const { meetingId } = useParams();
  return <Navigate to={`/reports/${meetingId}`} replace />;
}

function HomeRedirect() {
  const { isAuthed, user } = useAuth();
  if (!isAuthed) return <Navigate to="/login" replace />;
  if (user?.role === "manager") return <Navigate to="/manager/overview" replace />;
  if (user?.role === "consultant") return <Navigate to="/consultant" replace />;
  return <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<HomeRedirect />} />

        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        <Route element={<ProtectedRoute roles={["manager", "admin"]} />}>
          <Route element={<AppShell />}>
            <Route path="/manager/overview" element={<ManagerOverviewPage />} />
            <Route path="/manager/consultants" element={<ManagerConsultantsPage />} />
            <Route path="/manager/demos" element={<Navigate to="/manager/consultants" replace />} />
            <Route path="/manager/manual-analysis" element={<ManualScriptAnalysisPage />} />
            <Route path="/manager/leaderboard" element={<ManagerPerformancePage />} />
            <Route path="/manager/presales-report" element={<PresalesCompleteReportPage />} />
            <Route path="/manager/reports" element={<ReportsListPage />} />
            <Route path="/reports/:meetingId" element={<MeetingReportPage />} />
            <Route path="/consultants/:consultantId" element={<ConsultantDetailPage />} />
            <Route path="/account" element={<AccountPage />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute roles={["manager", "admin", "consultant"]} />}>
          <Route element={<AppShell />}>
            <Route path="/reports/:meetingId" element={<MeetingReportPage />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute roles={["consultant", "admin"]} />}>
          <Route element={<AppShell />}>
            <Route path="/consultant" element={<ConsultantDashboard />} />
            <Route path="/consultant/connect-teams" element={<ConsultantConnectTeamsPage />} />
            <Route path="/account" element={<AccountPage />} />
            <Route path="/meetings/:meetingId/report" element={<LegacyMeetingReportRedirect />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

