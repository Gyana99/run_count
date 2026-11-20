import { Injectable, signal } from '@angular/core';
import { newMatch } from './engine';
import { MatchSetup, MatchState } from './models';

const KEY = 'run-count-view:match';
const HISTORY_KEY = 'run-count-view:history';
const MAX_HISTORY = 60;

/**
 * Holds the match as an immutable-style signal. Every action works on a deep
 * copy; if the engine returns an error the copy is thrown away, otherwise the
 * previous state is pushed on the undo stack.
 */
@Injectable({ providedIn: 'root' })
export class MatchService {
  private readonly _state = signal<MatchState | null>(this.load<MatchState>(KEY));
  private history: MatchState[] = this.load<MatchState[]>(HISTORY_KEY) ?? [];

  readonly state = this._state.asReadonly();
  readonly error = signal<string | null>(null);
  readonly canUndo = signal(this.history.length > 0);

  start(setup: MatchSetup): void {
    this.history = [];
    this.canUndo.set(false);
    this.error.set(null);
    this._state.set(newMatch(setup));
    this.persist();
  }

  /** Run an engine action. Returns true on success. */
  act(fn: (draft: MatchState) => string | null | void): boolean {
    const cur = this._state();
    if (!cur) return false;
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
    this.persist();
    return true;
  }

  undo(): void {
    const prev = this.history.pop();
    if (!prev) return;
    this.error.set(null);
    this._state.set(prev);
    this.canUndo.set(this.history.length > 0);
    this.persist();
  }

  reset(): void {
    this.history = [];
    this.canUndo.set(false);
    this.error.set(null);
    this._state.set(null);
    try {
      localStorage.removeItem(KEY);
      localStorage.removeItem(HISTORY_KEY);
    } catch {
      /* storage unavailable */
    }
  }

  private persist(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this._state()));
      localStorage.setItem(HISTORY_KEY, JSON.stringify(this.history));
    } catch {
      /* storage full or unavailable: keep running in memory */
    }
  }

  private load<T>(key: string): T | null {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }
}
