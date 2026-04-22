import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";

export default function ProtectedRoute({ roles }) {
  const { loading, isAuthed, user } = useAuth();

  if (loading) return <div className="card">Loading...</div>;
  if (!isAuthed) return <Navigate to="/login" replace />;
  if (roles?.length && !roles.includes(user?.role)) return <Navigate to="/" replace />;
  return <Outlet />;
}

