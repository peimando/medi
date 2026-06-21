import { Spinner } from './Spinner';

const variants = {
  primary: 'btn-primary',
  success: 'btn-success',
  danger:  'btn-danger',
  warning: 'btn-warning',
  ghost:   'btn-ghost',
};

const sizes = {
  sm: 'px-3 py-1.5 text-xs rounded-lg',
  md: 'px-4 py-2.5 text-sm rounded-xl',
  lg: 'px-6 py-3 text-base rounded-xl',
};

export const Btn = ({ children, onClick, loading = false, disabled = false, variant = 'primary', size = 'md', className = '', type = 'button' }) => (
  <button type={type} onClick={onClick} disabled={disabled || loading}
    className={`${variants[variant] || variants.primary} ${sizes[size] || sizes.md} ${className}`}>
    {loading && <Spinner size="sm" color={variant === 'ghost' ? 'border-gray-700' : 'border-white'} />}
    {children}
  </button>
);
