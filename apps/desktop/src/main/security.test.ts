import { describe, expect, it } from 'vitest';
import { APP_ORIGIN, PROD_CSP, devCsp, isAllowedNavigation } from './security';

describe('CSP', () => {
  it('produção não permite inline, eval nem origens externas', () => {
    expect(PROD_CSP).toContain("default-src 'self'");
    expect(PROD_CSP).toContain("script-src 'self'");
    expect(PROD_CSP).toContain("object-src 'none'");
    expect(PROD_CSP).not.toMatch(/unsafe-inline|unsafe-eval|https?:/);
  });

  it('desenvolvimento libera só o WebSocket do Vite', () => {
    const csp = devCsp('http://localhost:5173');
    expect(csp).toContain("connect-src 'self' ws://localhost:5173");
    expect(csp).not.toMatch(/unsafe-eval/);
  });
});

describe('isAllowedNavigation', () => {
  it('permite só a origem do app', () => {
    expect(isAllowedNavigation(`${APP_ORIGIN}/index.html#/historico`, APP_ORIGIN)).toBe(true);
    expect(isAllowedNavigation('https://exemplo.com/', APP_ORIGIN)).toBe(false);
    expect(isAllowedNavigation('file:///etc/passwd', APP_ORIGIN)).toBe(false);
    expect(isAllowedNavigation('app://outro/index.html', APP_ORIGIN)).toBe(false);
    expect(isAllowedNavigation('lixo', APP_ORIGIN)).toBe(false);
    expect(isAllowedNavigation('http://localhost:5173/#/', 'http://localhost:5173')).toBe(true);
    expect(isAllowedNavigation('http://localhost:5174/', 'http://localhost:5173')).toBe(false);
  });
});
