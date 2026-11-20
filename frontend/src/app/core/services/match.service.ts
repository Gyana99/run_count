import { Injectable, inject, signal } from '@angular/core';
import { ApiError, ApiService } from './api.service';
import { MatchRecord } from '../models/api.models';
import { matchSummary, newMatch } from '../engine/engine';
import { MatchSetup, MatchState } from '../models/models';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'conflict';

const MAX_HISTORY = 60;
const RETRY_MS = 4000;

/**
 * The match being scored. The engine runs here in the browser; after every change the whole
 * match is saved to the server, one save at a time. If the server cannot be reached the change
 * stays in memory and the save is retried.
 */
@Injectable({ providedIn: 'root' })
export class MatchService {
  private readonly api = inject(ApiService);

  private readonly _state = signal<MatchState | null>(null);
  readonly state = this._state.asReadonly();
  readonly matchId = signal<string | null>(null);
  readonly ownerId = signal<number | null>(null);
  readonly error = signal<string | null>(null);
  readonly canUndo = signal(false);
  readonly saveStatus = signal<SaveStatus>('idle');

  private history: MatchState[] = [];
  private version = 0;
  private dirty = false;
  private saving = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  /** Creates the match on the server and returns its id. */
  async create(setup: MatchSetup): Promise<string> {
    const state = newMatch(setup);
    const r = await this.api.createMatch(state, matchSummary(state));
    return r.id;
  }

  /** Opens a match for scoring. Unsaved changes for the same match are kept and saved again. */
  async load(id: string): Promise<MatchRecord | null> {
    if (this.dirty && this.matchId() === id && this._state()) {
      this.error.set(null);
      void this.flush();
      return null;
    }
    this.cancelRetry();
    this.dirty = false;
    const record = await this.api.getMatch(id);
    this.history = [];
    this.canUndo.set(false);
    this.error.set(null);
    this.matchId.set(record.id);
    this.ownerId.set(record.ownerId);
    this.version = record.version;
    this.saveStatus.set('saved');
    this._state.set(record.state);
    return record;
  }

  /** Throws away unsaved local changes and loads the server copy. */
  async reload(): Promise<void> {
    const id = this.matchId();
    if (!id) return;
    this.dirty = false;
    await this.load(id);
  }

  /** Run an engine action on a copy. If the engine rejects it nothing changes. */
  act(fn: (draft: MatchState) => string | null | void): boolean {
    const cur = this._state();
    if (!cur) return false;
    if (this.saveStatus() === 'conflict') {
      this.error.set('This match was changed somewhere else. Reload to continue.');
      return false;
    }
    const draft = structuredClone(cur);
    const err = fn(draft);
    if (err) {
      this.error.set(err);
      return false;
    }
    this.error.set(null);
    this.history.push(cur);
    if (this.history.length > MAX_HISTORY) this.history.shift();
    this.canUndo.set(true);
    this._state.set(draft);
    this.markDirty();
    return true;
  }

  undo(): void {
    if (this.saveStatus() === 'conflict') return;
    const prev = this.history.pop();
    if (!prev) return;
    this.error.set(null);
    this._state.set(prev);
    this.canUndo.set(this.history.length > 0);
    this.markDirty();
  }

  private markDirty(): void {
    this.dirty = true;
    this.cancelRetry();
    void this.flush();
  }

  private cancelRetry(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private async flush(): Promise<void> {
    if (this.saving) return;
    this.saving = true;
    try {
      while (this.dirty) {
        const id = this.matchId();
        const state = this._state();
        if (!id || !state) {
          this.dirty = false;
          break;
        }
        this.dirty = false;
        this.saveStatus.set('saving');
        try {
          const r = await this.api.saveMatch(id, this.version, state, matchSummary(state));
          if (this.matchId() === id) this.version = r.version;
          this.saveStatus.set(this.dirty ? 'saving' : 'saved');
        } catch (e) {
          const status = e instanceof ApiError ? e.status : 0;
          this.error.set(e instanceof Error ? e.message : 'Could not save.');
          if (status === 409) {
            this.saveStatus.set('conflict');
          } else if (status === 401 || status === 403) {
            this.dirty = true; // keep the change; it is saved after you log in again
            this.saveStatus.set('error');
          } else {
            this.dirty = true;
            this.saveStatus.set('error');
            this.retryTimer = setTimeout(() => void this.flush(), RETRY_MS);
          }
          break;
        }
      }
    } finally {
      this.saving = false;
    }
  }
}
