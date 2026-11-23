export default function PrintLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white text-[var(--ink)] print:bg-white">
      {children}
    </div>
  );
}
