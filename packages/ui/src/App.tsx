import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createHashRouter, Outlet, RouterProvider } from "react-router"
import { RailNav } from "./components/RailNav.tsx"
import { ToastHost } from "./components/toast.tsx"
import ClustersPage from "./pages/ClustersPage.tsx"
import DetailPage from "./pages/DetailPage.tsx"
import GalleryPage from "./pages/GalleryPage.tsx"
import HowItWorksPage from "./pages/HowItWorksPage.tsx"
import OverviewPage from "./pages/OverviewPage.tsx"
import ReviewPage from "./pages/ReviewPage.tsx"
import TrendingPage from "./pages/TrendingPage.tsx"

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: false } },
})

function Shell() {
  return (
    <div className="appShell">
      <RailNav />
      <main className="appMain">
        <Outlet />
      </main>
    </div>
  )
}

const router = createHashRouter([
  {
    path: "/",
    element: <Shell />,
    children: [
      { index: true, element: <OverviewPage /> },
      { path: "gallery", element: <GalleryPage /> },
      { path: "clusters", element: <ClustersPage /> },
      { path: "trending", element: <TrendingPage /> },
      { path: "review", element: <ReviewPage /> },
      { path: "how", element: <HowItWorksPage /> },
      { path: "skills/*", element: <DetailPage /> },
    ],
  },
])

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastHost>
        <RouterProvider router={router} />
      </ToastHost>
    </QueryClientProvider>
  )
}
