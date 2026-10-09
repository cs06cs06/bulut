// SvelteKit tür tanımları
declare global {
  namespace App {
    interface Locals {
      userEmail: string | null;
      accessConfigured: boolean;
    }
    interface Platform {
      env: {
        DB: D1Database;
        ACCESS_TEAM_DOMAIN?: string;
        ACCESS_AUD?: string;
        ANTHROPIC_API_KEY?: string;
        ANTHROPIC_BASE_URL?: string;
      };
    }
  }
}

export {};
