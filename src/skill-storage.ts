import { createDefaultTrustStrategy } from "@tanstack/ai-code-mode-skills"
import type { Skill, SkillIndexEntry, SkillStorage } from "@tanstack/ai-code-mode-skills"

const SKILL_PREFIX = "wc-fr:skill:"
const INDEX_KEY = "wc-fr:skill-index"

/**
 * Browser-native localStorage-backed SkillStorage.
 * Persists learned extraction patterns across page loads without a server.
 */
export function createLocalStorageSkillStorage(): SkillStorage {
  const trustStrategy = createDefaultTrustStrategy()

  function loadIndex(): Promise<SkillIndexEntry[]> {
    try {
      const raw = localStorage.getItem(INDEX_KEY)
      return Promise.resolve(raw ? (JSON.parse(raw) as SkillIndexEntry[]) : [])
    } catch {
      return Promise.resolve([])
    }
  }

  function _writeIndex(index: SkillIndexEntry[]): void {
    localStorage.setItem(INDEX_KEY, JSON.stringify(index))
  }

  function loadAll(): Promise<Skill[]> {
    const skills: Skill[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key?.startsWith(SKILL_PREFIX)) continue
      try {
        const raw = localStorage.getItem(key)
        if (raw) skills.push(JSON.parse(raw) as Skill)
      } catch {
        // skip corrupted entries
      }
    }
    return Promise.resolve(skills)
  }

  function get(name: string): Promise<Skill | null> {
    try {
      const raw = localStorage.getItem(SKILL_PREFIX + name)
      return Promise.resolve(raw ? (JSON.parse(raw) as Skill) : null)
    } catch {
      return Promise.resolve(null)
    }
  }

  async function save(skill: Omit<Skill, "createdAt" | "updatedAt">): Promise<Skill> {
    const existing = await get(skill.name)
    const now = new Date().toISOString()
    const full: Skill = { ...skill, createdAt: existing?.createdAt ?? now, updatedAt: now }
    localStorage.setItem(SKILL_PREFIX + skill.name, JSON.stringify(full))

    const index = await loadIndex()
    const entry: SkillIndexEntry = {
      id: full.id,
      name: full.name,
      description: full.description,
      usageHints: full.usageHints,
      trustLevel: full.trustLevel,
    }
    const pos = index.findIndex((e) => e.name === skill.name)
    if (pos >= 0) index[pos] = entry
    else index.push(entry)
    _writeIndex(index)

    return full
  }

  async function deleteSkill(name: string): Promise<boolean> {
    if (localStorage.getItem(SKILL_PREFIX + name) === null) return false
    localStorage.removeItem(SKILL_PREFIX + name)
    _writeIndex((await loadIndex()).filter((e) => e.name !== name))
    return true
  }

  async function search(
    query: string,
    options: { limit?: number } = {},
  ): Promise<SkillIndexEntry[]> {
    const { limit = 5 } = options
    const index = await loadIndex()
    const terms = query.toLowerCase().split(/\s+/)

    return index
      .map((entry) => {
        const text = [entry.name, entry.description, ...entry.usageHints].join(" ").toLowerCase()
        let score = 0
        for (const term of terms) {
          if (text.includes(term)) score++
          if (entry.name.toLowerCase().includes(term)) score += 2
        }
        return { entry, score }
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s) => s.entry)
  }

  async function updateStats(name: string, success: boolean): Promise<void> {
    const skill = await get(name)
    if (!skill) return
    const { executions, successRate } = skill.stats
    const n = executions + 1
    const newStats = { executions: n, successRate: (successRate * executions + (success ? 1 : 0)) / n }
    const newTrust = trustStrategy.calculateTrustLevel(skill.trustLevel, newStats)
    const updated: Skill = { ...skill, stats: newStats, trustLevel: newTrust, updatedAt: new Date().toISOString() }
    localStorage.setItem(SKILL_PREFIX + name, JSON.stringify(updated))

    const index = await loadIndex()
    const pos = index.findIndex((e) => e.name === name)
    if (pos >= 0) {
      index[pos] = { ...index[pos], trustLevel: newTrust }
      _writeIndex(index)
    }
  }

  return { loadIndex, loadAll, get, save, delete: deleteSkill, search, updateStats, trustStrategy }
}
