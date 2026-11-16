export default function GlassCard({ as = 'div', className = '', children, ...rest }) {
  const Tag = as;
  return (
    <Tag className={`glass p-6 ${className}`} {...rest}>
      {children}
    </Tag>
  );
}
