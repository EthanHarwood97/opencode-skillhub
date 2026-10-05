export type Cluster = { id: string; label: string; category: string; top: string; alternatives: string[] }
export type ClustersFile = { version: 1; generatedAt: string; clusters: Cluster[] }
