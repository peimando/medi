export const Spinner = ({ size = 'md', color = 'border-white', className = '' }) => {
  const s = { sm: 'w-4 h-4 border-2', md: 'w-7 h-7 border-2', lg: 'w-10 h-10 border-3' };
  return <div className={`${s[size]} ${color} border-t-transparent rounded-full animate-spin ${className}`} />;
};

export const Skeleton = ({ className = '' }) => (
  <div className={`animate-pulse bg-gray-200 rounded-xl ${className}`} />
);

export const PageSkeleton = () => (
  <div className="p-6 space-y-4" style={{ background: '#f8fafc', minHeight: '100vh' }}>
    <Skeleton className="h-8 w-48" />
    <Skeleton className="h-4 w-96" />
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
      <Skeleton className="h-32" />
      <Skeleton className="h-32" />
      <Skeleton className="h-32" />
    </div>
    <Skeleton className="h-64" />
  </div>
);
