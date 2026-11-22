import { Navigate, useOutletContext } from 'react-router';
import GestaoMaster from './GestaoMaster';

export default function MasterRoute() {
  const context = useOutletContext<{ perfil?: string }>();
  if (!context.perfil) return <p role="status">Verificando acesso MASTER…</p>;
  return context.perfil === 'MASTER' ? (
    <GestaoMaster />
  ) : (
    <Navigate to="/evento" replace />
  );
}
