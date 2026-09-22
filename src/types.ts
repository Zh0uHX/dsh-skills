export interface CatalogSkill {
  id: string;
  skillId: string;
  name: string;
  source: string;
  installs: number;
  url: string;
  description?: string;
}

export interface SkillBundle {
  skill: CatalogSkill;
  files: Array<{ path: string; contents: string }>;
  upstreamHash: string;
}

export interface SkillsSource {
  search(query: string): Promise<CatalogSkill[]>;
  details(skill: CatalogSkill): Promise<CatalogSkill>;
  download(skill: CatalogSkill): Promise<SkillBundle>;
}

export interface InstalledSkill {
  id: string;
  skill: CatalogSkill;
  directory: string;
  contentHash: string;
  upstreamHash: string;
  installedAt: string;
  updatedAt: string;
  problem?: string;
}

export interface UpdateCheck {
  id: string;
  status: 'current' | 'available' | 'error';
  message?: string;
}

export class SkillError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) {
    super(message);
    this.name = 'SkillError';
  }
}
