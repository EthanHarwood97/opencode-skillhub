import type {
  BriefDto,
  ClustersDto,
  InstallBestResultDto,
  InstallResultDto,
  ReviewDto,
  SkillDetail,
  SkillsPageDto,
  SkillsQuery,
  StatusDto,
  TrendingDto,
  UpdateReviewDto,
} from "./contract.ts"
import { filterSkills } from "./filter.ts"

type Runtime = { mode: "live" | "static"; token?: string }

const runtime = (): Runtime => (globalThis as { __SKILLHUB__?: Runtime }).__SKILLHUB__ ?? { mode: "static" }

export class ApiError extends Error {
  readonly code: string
  readonly status: number
  constructor(message: string, code: string, status: number) {
    super(message)
    this.code = code
    this.status = status
  }
}

const errorFrom = async (res: Response): Promise<ApiError> => {
  const body = (await res.json().catch(() => undefined)) as { error?: { code?: string; message?: string } } | undefined
  return new ApiError(body?.error?.message ?? `request failed (${res.status})`, body?.error?.code ?? "internal", res.status)
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init)
  if (!res.ok) throw await errorFrom(res)
  return (await res.json()) as T
}

const staticCache = new Map<string, Promise<unknown>>()

function loadStatic<T>(name: string): Promise<T> {
  const cached = staticCache.get(name)
  if (cached) return cached as Promise<T>
  const promise = fetch(`data/${name}.json`).then(async (res) => {
    if (!res.ok) throw new ApiError(`could not load data/${name}.json`, "not_found", res.status)
    return (await res.json()) as T
  })
  staticCache.set(name, promise)
  return promise as Promise<T>
}

export const isLive = (): boolean => runtime().mode === "live"

const mutationHeaders = (): Record<string, string> => {
  const { mode, token } = runtime()
  return {
    "content-type": "application/json",
    ...(mode === "live" && token ? { "x-skillhub-token": token } : {}),
  }
}

function requireLive(): void {
  if (!isLive()) {
    throw new ApiError("Actions are available when you run the dashboard locally (npm run skillhub -- ui).", "static_mode", 0)
  }
}

export const getStatus = (): Promise<StatusDto> => (isLive() ? request("/api/status") : loadStatic<StatusDto>("status"))

export async function getSkills(query: SkillsQuery): Promise<SkillsPageDto> {
  if (isLive()) {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") params.set(key, String(value))
    }
    return request(`/api/skills?${params.toString()}`)
  }
  const all = await loadStatic<SkillDetail[]>("skills")
  return filterSkills(all, query)
}

export async function getSkill(id: string): Promise<SkillDetail> {
  if (isLive()) return request(`/api/skills/${encodeURIComponent(id)}`)
  const all = await loadStatic<SkillDetail[]>("skills")
  const found = all.find((skill) => skill.id === id)
  if (!found) throw new ApiError(`no skill with id ${id}`, "not_found", 404)
  return found
}

export const getClusters = (): Promise<ClustersDto> => (isLive() ? request("/api/clusters") : loadStatic<ClustersDto>("clusters"))
export const getTrending = (): Promise<TrendingDto> => (isLive() ? request("/api/trending") : loadStatic<TrendingDto>("trending"))
export const getReview = (): Promise<ReviewDto> => (isLive() ? request("/api/review") : loadStatic<ReviewDto>("review"))

export async function getBrief(): Promise<BriefDto | null> {
  if (!isLive()) return null
  const res = await fetch("/api/brief")
  if (res.status === 404) return null
  if (!res.ok) throw await errorFrom(res)
  return (await res.json()) as BriefDto
}

export async function installSkillAction(id: string, dryRun: boolean): Promise<InstallResultDto> {
  requireLive()
  return request(`/api/skills/${encodeURIComponent(id)}/install`, { method: "POST", headers: mutationHeaders(), body: JSON.stringify({ dryRun }) })
}

export async function installBestAction(body: { perCategory: number; dryRun: boolean; activate: boolean }): Promise<InstallBestResultDto> {
  requireLive()
  return request("/api/install-best", { method: "POST", headers: mutationHeaders(), body: JSON.stringify(body) })
}

export async function setActive(id: string, active: boolean): Promise<{ status: string }> {
  requireLive()
  return request(`/api/skills/${encodeURIComponent(id)}/${active ? "activate" : "deactivate"}`, { method: "POST", headers: mutationHeaders(), body: "{}" })
}

export async function reviewUpdate(id: string): Promise<UpdateReviewDto> {
  requireLive()
  return request(`/api/skills/${encodeURIComponent(id)}/update`)
}

export async function applyUpdateAction(id: string): Promise<InstallResultDto["entry"]> {
  requireLive()
  return request(`/api/skills/${encodeURIComponent(id)}/update/apply`, { method: "POST", headers: mutationHeaders(), body: JSON.stringify({ confirm: true }) })
}
