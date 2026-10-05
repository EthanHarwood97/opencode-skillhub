import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render } from "@testing-library/react"
import type { ReactElement } from "react"
import { MemoryRouter, Route, Routes } from "react-router"
import { ToastHost } from "../src/components/toast.tsx"

const wrap = (ui: ReactElement) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={queryClient}>
      <ToastHost>{ui}</ToastHost>
    </QueryClientProvider>
  )
}

export function renderPage(ui: ReactElement, route = "/") {
  return render(wrap(<MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>))
}

export function renderRoute(pattern: string, route: string, ui: ReactElement) {
  return render(
    wrap(
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path={pattern} element={ui} />
        </Routes>
      </MemoryRouter>,
    ),
  )
}
