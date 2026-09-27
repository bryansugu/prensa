import { Outlet, createRootRoute } from "@tanstack/react-router";
import { Footer } from "@/components/app/Footer";
import { Header } from "@/components/app/Header";
import { ToastProvider } from "@/components/ds/toast";
import { TooltipProvider } from "@/components/ds/tooltip";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <TooltipProvider>
      <ToastProvider>
        <div className="flex min-h-dvh flex-col">
          <Header />
          <main id="contenido" className="flex-1">
            <Outlet />
          </main>
          <Footer />
        </div>
      </ToastProvider>
    </TooltipProvider>
  );
}
