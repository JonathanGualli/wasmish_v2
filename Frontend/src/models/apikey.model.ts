export interface ApiKey {
  id: string;
  name: string;
  keyPreview?: string;
  status: "active" | "inactive";
  lastUsedAt: string | null;
  createdAt: string;
}
