import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { AuthResult, User } from '../models/api.models';

const KEY = 'run-count-view:auth';

/** Who is logged in. The login token is kept in localStorage so a refresh keeps you signed in. */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly _user = signal<User | null>(null);
  private _token: string | null = null;

  readonly user = this._user.asReadonly();
  readonly allowRegistration = signal(true);

  constructor() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const saved = JSON.parse(raw) as AuthResult;
        if (saved?.token && saved.user?.username) this.setSession(saved, false);
      }
    } catch {
      /* storage unavailable or corrupt: stay logged out */
    }
  }

  get token(): string | null {
    return this._token;
  }

  setSession(r: AuthResult, persist = true): void {
    this._token = r.token;
    this._user.set(r.user);
    if (persist) {
      try {
        localStorage.setItem(KEY, JSON.stringify(r));
      } catch {
        /* keep the session in memory only */
      }
    }
  }

  async login(username: string, password: string): Promise<void> {
    this.setSession(await this.api.login(username, password));
  }

  async register(username: string, password: string): Promise<void> {
    this.setSession(await this.api.register(username, password));
  }

  async loadConfig(): Promise<void> {
    try {
      this.allowRegistration.set((await this.api.config()).allowRegistration);
    } catch {
      /* keep the default */
    }
  }

  logout(): void {
    this._token = null;
    this._user.set(null);
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* nothing to clear */
    }
  }
}
