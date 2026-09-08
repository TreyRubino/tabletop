import { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Command } from '@tabletop/core'

/* ------------------------------------------------------------------
   One storage mechanism. The campaign source, the command log and the
   session all live in the same SQLite file.

   JSON stays the *authoring* format, because a DM writing a campaign
   wants a text file in an editor, not a schema browser. It is imported
   once and then the database is authoritative: edit the file, restart,
   and a changed hash triggers a re-import as a new revision with the
   log preserved, because commands reference ids and ids are stable.
------------------------------------------------------------------ */

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS campaign (
  id         TEXT PRIMARY KEY,
  revision   INTEGER NOT NULL,
  hash       TEXT NOT NULL,
  source     TEXT NOT NULL,
  imported_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS log (
  seq         INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id TEXT NOT NULL,
  issued_by   TEXT NOT NULL,
  command     TEXT NOT NULL,
  at          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS log_by_campaign ON log(campaign_id, seq);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`

export interface LoggedCommand {
  seq: number
  command: Command
  issuedBy: string
}

export class Store {
  private db: DatabaseSync

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true })
    this.db = new DatabaseSync(path)
    this.db.exec(SCHEMA)
  }

  close() { this.db.close() }

  /* ---------------------------- campaign ---------------------------- */

  /**
   * Returns the stored source, importing or re-importing when the file's
   * hash differs. The command log survives a re-import on purpose: the DM
   * fixing a typo mid-campaign should not lose the session.
   */
  syncCampaign(id: string, json: string): { source: string; revision: number; reimported: boolean } {
    const hash = createHash('sha256').update(json).digest('hex')
    const row = this.db.prepare('SELECT revision, hash, source FROM campaign WHERE id = ?').get(id) as
      { revision: number; hash: string; source: string } | undefined

    if (row && row.hash === hash) {
      return { source: row.source, revision: row.revision, reimported: false }
    }

    const revision = (row?.revision ?? 0) + 1
    this.db.prepare(
      `INSERT INTO campaign (id, revision, hash, source, imported_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET revision = ?, hash = ?, source = ?, imported_at = ?`,
    ).run(id, revision, hash, json, new Date().toISOString(),
          revision, hash, json, new Date().toISOString())

    return { source: json, revision, reimported: !!row }
  }

  storedCampaign(id: string): string | null {
    const row = this.db.prepare('SELECT source FROM campaign WHERE id = ?').get(id) as
      { source: string } | undefined
    return row?.source ?? null
  }

  /* ---------------------------- log ---------------------------- */

  append(campaignId: string, command: Command, issuedBy: string): number {
    const r = this.db.prepare(
      'INSERT INTO log (campaign_id, issued_by, command, at) VALUES (?, ?, ?, ?)',
    ).run(campaignId, issuedBy, JSON.stringify(command), new Date().toISOString())
    return Number(r.lastInsertRowid)
  }

  log(campaignId: string): LoggedCommand[] {
    const rows = this.db.prepare(
      'SELECT seq, command, issued_by FROM log WHERE campaign_id = ? ORDER BY seq',
    ).all(campaignId) as { seq: number; command: string; issued_by: string }[]

    return rows.flatMap(r => {
      try {
        return [{ seq: r.seq, command: JSON.parse(r.command) as Command, issuedBy: r.issued_by }]
      } catch {
        // A malformed row must not take the session down mid-game.
        return []
      }
    })
  }

  /** Undo drops the last entry. The reducer is pure, so a refold is exact. */
  dropLast(campaignId: string): boolean {
    const row = this.db.prepare(
      'SELECT seq FROM log WHERE campaign_id = ? ORDER BY seq DESC LIMIT 1',
    ).get(campaignId) as { seq: number } | undefined
    if (!row) return false
    this.db.prepare('DELETE FROM log WHERE seq = ?').run(row.seq)
    return true
  }

  clearLog(campaignId: string): number {
    const n = this.log(campaignId).length
    this.db.prepare('DELETE FROM log WHERE campaign_id = ?').run(campaignId)
    return n
  }

  /* ---------------------------- meta ---------------------------- */

  get(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as
      { value: string } | undefined
    return row?.value ?? null
  }

  set(key: string, value: string) {
    this.db.prepare(
      'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?',
    ).run(key, value, value)
  }
}
