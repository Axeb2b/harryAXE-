import { AlertCircle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background px-4">
      <div className="stat-card w-full max-w-md mx-auto p-8 flex flex-col items-center text-center">
        <span className="brand-mark w-14 h-14 rounded-2xl mb-5 shadow-sm">
          <AlertCircle className="w-7 h-7" />
        </span>
        <p className="page-eyebrow mb-2">Error</p>
        <h1 className="page-title mb-2">404 — Page Not Found</h1>
        <p className="text-sm text-muted-foreground max-w-xs">
          Did you forget to add the page to the router?
        </p>
      </div>
    </div>
  );
}
