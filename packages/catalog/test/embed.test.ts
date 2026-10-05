import { describe, expect, it } from "vitest"
import { cosine, embedText, EMBED_DIM, tokenize } from "../src/embed.ts"

describe("embedText", () => {
  it("is deterministic and L2-normalized", () => {
    const a = embedText("PDF manipulation and text extraction")
    const b = embedText("PDF manipulation and text extraction")
    expect(a).toEqual(b)
    expect(a.length).toBe(EMBED_DIM)
    let norm = 0
    for (const v of a) norm += v * v
    expect(Math.sqrt(norm)).toBeCloseTo(1, 10)
  })

  it("scores similar text higher than unrelated text", () => {
    const base = embedText("PDF text extraction and document conversion")
    const near = embedText("Extract text from PDF documents and convert them")
    const far = embedText("Kubernetes cluster deployment and observability")
    expect(cosine(base, near)).toBeGreaterThan(cosine(base, far))
  })

  it("tokenizes words and bigrams", () => {
    expect(tokenize("PDF! text")).toEqual(["pdf", "text", "pdf_text"])
  })
})
