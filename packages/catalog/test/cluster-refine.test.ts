import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { kmeans, readClusterState, refineClusters, writeClusterState } from "../src/cluster-refine.ts"
import { makeRecord } from "./helpers.ts"

const rec = (id: string, text: string, total = 50, tags: string[] = []) =>
  makeRecord({ id, name: text, description: text, tags, scores: { ...makeRecord({ id }).scores, total } })

describe("kmeans", () => {
  it("separates two well-separated blobs deterministically", () => {
    const a = Float64Array.from([1, 0, 0])
    const b = Float64Array.from([0, 1, 0])
    const vectors = [a, a, b, b]
    const one = kmeans(vectors, 2, 7)
    const two = kmeans(vectors, 2, 7)
    expect(one.assignments).toEqual(two.assignments)
    expect(one.assignments[0]).toBe(one.assignments[1])
    expect(one.assignments[2]).toBe(one.assignments[3])
    expect(one.assignments[0]).not.toBe(one.assignments[2])
  })
})

const records = [
  rec("a/pdf1", "pdf text extraction from documents", 80, ["pdf"]),
  rec("a/pdf2", "extract text from pdf documents", 70, ["pdf"]),
  rec("a/k8s1", "kubernetes deployment and cluster observability", 60, ["kubernetes"]),
  rec("a/k8s2", "observability for kubernetes cluster deployments", 50, ["kubernetes"]),
]

describe("refineClusters", () => {
  it("groups related skills across the two clusters", () => {
    const { records: out, state, assignments, duplicates } = refineClusters(records, { k: 2, seed: 7, now: new Date("2026-10-05T00:00:00Z") })
    expect(assignments["a/pdf1"]).toBe(assignments["a/pdf2"])
    expect(assignments["a/k8s1"]).toBe(assignments["a/k8s2"])
    expect(assignments["a/pdf1"]).not.toBe(assignments["a/k8s1"])
    expect(state.clusters).toHaveLength(2)
    expect(out.find((r) => r.id === "a/pdf1")!.clusterId).toBe(assignments["a/pdf1"])
    expect(duplicates).toEqual([])
  })

  it("keeps cluster ids stable across runs via centroid matching", () => {
    const first = refineClusters(records, { k: 2, seed: 7, now: new Date("2026-10-05T00:00:00Z") })
    const second = refineClusters(records, { k: 2, seed: 7, prev: first.state, now: new Date("2026-10-06T00:00:00Z") })
    expect(second.assignments).toEqual(first.assignments)
    expect(second.state.clusters.map((c) => c.id).sort()).toEqual(first.state.clusters.map((c) => c.id).sort())
  })

  it("links near-identical records to a canonical entry", () => {
    const exact = [rec("a/one", "seo audit for websites", 90, ["seo"]), rec("a/copy", "seo audit for websites", 60, ["seo"])]
    const { records: out, duplicates } = refineClusters(exact, { k: 2, seed: 1, now: new Date("2026-10-05T00:00:00Z") })
    expect(duplicates).toEqual([{ canonical: "a/one", duplicate: "a/copy" }])
    expect(out.find((r) => r.id === "a/copy")!.relations.duplicates).toEqual(["a/one"])
    expect(out.find((r) => r.id === "a/one")!.relations.duplicates).toEqual(["a/copy"])
  })

  it("round-trips cluster state", () => {
    const dir = mkdtempSync(join(tmpdir(), "skillhub-clusters-"))
    const file = join(dir, "clusters-state.json")
    const { state } = refineClusters(records, { k: 2, seed: 7, now: new Date("2026-10-05T00:00:00Z") })
    writeClusterState(file, state)
    expect(readClusterState(file)).toEqual(state)
    expect(readClusterState(join(dir, "missing.json"))).toBeUndefined()
  })
})
