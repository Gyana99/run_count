import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly mode = signal<'login' | 'register'>('login');
  readonly busy = signal(false);
  readonly error = signal('');
  readonly allowRegistration = this.auth.allowRegistration;

  username = '';
  password = '';
  confirm = '';

  ngOnInit(): void {
    void this.auth.loadConfig();
    if (this.auth.user()) void this.router.navigateByUrl(this.returnUrl());
  }

  setMode(mode: 'login' | 'register'): void {
    this.mode.set(mode);
    this.error.set('');
  }

  async submit(): Promise<void> {
    const username = this.username.trim();
    if (!username || !this.password) return this.error.set('Enter your username and password.');
    if (this.mode() === 'register') {
      if (this.password.length < 8) return this.error.set('Use at least 8 characters for the password.');
      if (this.password !== this.confirm) return this.error.set('The two passwords do not match.');
    }
    this.error.set('');
    this.busy.set(true);
    try {
      if (this.mode() === 'login') await this.auth.login(username, this.password);
      else await this.auth.register(username, this.password);
      await this.router.navigateByUrl(this.returnUrl());
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Could not log in. Try again.');
    } finally {
      this.busy.set(false);
    }
  }

  /** Only follow return links that stay inside this app. */
  private returnUrl(): string {
    const url = this.route.snapshot.queryParamMap.get('returnUrl');
    return url && url.startsWith('/') && !url.startsWith('//') ? url : '/scorer';
  }
}
