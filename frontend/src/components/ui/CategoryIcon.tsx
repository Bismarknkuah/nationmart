// Tiny stateless wrapper for our category SVG paths.
// Usage: <CategoryIcon path={cat.iconPath} className="w-6 h-6" />

export function CategoryIcon({ path, className = 'w-6 h-6' }: { path: string; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={path} />
    </svg>
  );
}
