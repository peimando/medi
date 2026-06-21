import { lazy, Suspense } from "react";
import { useParams } from "react-router-dom";
import { Spinner } from "../components/Spinner";

const AdminEstablishments = lazy(() => import("./AdminEstablishments"));
const AdminFloors         = lazy(() => import("./AdminFloors"));
const AdminServices       = lazy(() => import("./AdminServices"));
const AdminBoxes          = lazy(() => import("./AdminBoxes"));
const AdminRoles          = lazy(() => import("./AdminRoles"));
const AdminUsers          = lazy(() => import("./AdminUsers"));
const AdminDisplays       = lazy(() => import("./AdminDisplays"));
const AdminKiosks         = lazy(() => import("./AdminKiosks"));
const AdminSystemConfig   = lazy(() => import("./AdminSystemConfig"));

const SECTIONS = [
  { key: 'establishments', label: 'Establecimientos', icon: '🏛️', desc: 'Hospitales y sedes' },
  { key: 'floors',         label: 'Pisos',            icon: '🏗️', desc: 'Niveles, alas y sectores' },
  { key: 'services',       label: 'Servicios',        icon: '🏥', desc: 'Triage, Consultoría, etc.' },
  { key: 'displays',       label: 'Pantallas',        icon: '📺', desc: 'Cartelería digital por piso/sector' },
  { key: 'kiosks',         label: 'Kioskos',          icon: '🖥️', desc: 'Totems de registro por sector' },
  { key: 'boxes',          label: 'Consultorios',     icon: '🚪', desc: 'Boxes, ventanillas, salas' },
  { key: 'roles',          label: 'Roles',            icon: '👤', desc: 'Roles y permisos del personal' },
  { key: 'users',          label: 'Usuarios',         icon: '👥', desc: 'Personal del hospital' },
  { key: 'system',         label: 'Config. Sistema',  icon: '⚙️', desc: 'Parámetros del sistema' },
];

const SECTION_MAP = {
  establishments: AdminEstablishments,
  floors:         AdminFloors,
  services:       AdminServices,
  displays:       AdminDisplays,
  kiosks:         AdminKiosks,
  boxes:          AdminBoxes,
  roles:          AdminRoles,
  users:          AdminUsers,
  system:         AdminSystemConfig,
};

function AdminPlaceholder() {
  return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
}

export default function AdminView({ toast, config }) {
  const { section = 'establishments' } = useParams();
  const Component = SECTION_MAP[section];
  if (!Component) return <AdminPlaceholder />;
  return (
    <Suspense fallback={<AdminPlaceholder />}>
      <Component toast={toast} config={config} />
    </Suspense>
  );
}

export { SECTIONS };
