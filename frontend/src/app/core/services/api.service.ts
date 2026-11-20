import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { firstValueFrom } from 'rxjs';
import { AuthResult, MatchListItem, MatchRecord, MatchSummary, User } from '../models/api.models';
import { MatchState } from '../models/models';
import { environment } from '../../../environments/environment';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly version?: number,
  ) {
    super(message);
  }
}

/** Every call to the Node server goes through here. */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  /** Base address of the API, from src/environments/environment*.ts */
  private readonly base = environment.apiUrl;

  private async call<T>(req: Observable<T>): Promise<T> {
    try {
      return await firstValueFrom(req);
    } catch (e) {
      if (e instanceof HttpErrorResponse) {
        const body = e.error as { error?: string; version?: number } | null;
        const message =
          body?.error ?? (e.status === 0 ? 'Cannot reach the server. Check your connection.' : 'Something went wrong. Try again.');
        throw new ApiError(message, e.status, body?.version);
      }
      throw e;
    }
  }

  config(): Promise<{ allowRegistration: boolean }> {
    return this.call(this.http.get<{ allowRegistration: boolean }>(`${this.base}/config`));
  }
  login(username: string, password: string): Promise<AuthResult> {
    return this.call(this.http.post<AuthResult>(`${this.base}/auth/login`, { username, password }));
  }
  register(username: string, password: string): Promise<AuthResult> {
    return this.call(this.http.post<AuthResult>(`${this.base}/auth/register`, { username, password }));
  }
  me(): Promise<{ user: User }> {
    return this.call(this.http.get<{ user: User }>(`${this.base}/auth/me`));
  }

  async listMatches(scope: 'public' | 'mine' = 'public'): Promise<MatchListItem[]> {
    const r = await this.call(this.http.get<{ matches: MatchListItem[] }>(`${this.base}/matches`, { params: { scope } }));
    return r.matches;
  }
  getMatch(id: string): Promise<MatchRecord> {
    return this.call(this.http.get<MatchRecord>(`${this.base}/matches/${encodeURIComponent(id)}`));
  }
  createMatch(state: MatchState, summary: MatchSummary): Promise<{ id: string; version: number }> {
    return this.call(this.http.post<{ id: string; version: number }>(`${this.base}/matches`, { state, summary }));
  }
  saveMatch(id: string, version: number, state: MatchState, summary: MatchSummary): Promise<{ version: number; updatedAt: string }> {
    return this.call(
      this.http.put<{ version: number; updatedAt: string }>(`${this.base}/matches/${encodeURIComponent(id)}`, { state, summary, version }),
    );
  }
  deleteMatch(id: string): Promise<void> {
    return this.call(this.http.delete<void>(`${this.base}/matches/${encodeURIComponent(id)}`));
  }

  /** Live updates (server-sent events). Emits the full match every time the scorer saves. */
  streamMatch(id: string): Observable<{ record?: MatchRecord; connected: boolean; deleted?: boolean }> {
    return new Observable((subscriber) => {
      const source = new EventSource(`${this.base}/matches/${encodeURIComponent(id)}/stream`);
      source.onopen = () => subscriber.next({ connected: true });
      source.onerror = () => subscriber.next({ connected: false });
      source.addEventListener('state', (e) => {
        try {
          subscriber.next({ connected: true, record: JSON.parse((e as MessageEvent<string>).data) as MatchRecord });
        } catch {
          /* ignore a malformed event */
        }
      });
      source.addEventListener('deleted', () => {
        source.close();
        subscriber.next({ connected: false, deleted: true });
        subscriber.complete();
      });
      return () => source.close();
    });
  }
}
