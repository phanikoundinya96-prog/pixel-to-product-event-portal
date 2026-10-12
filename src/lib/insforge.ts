import { createClient } from '@insforge/sdk';

const baseUrl = import.meta.env.VITE_INSFORGE_BASE_URL || 'https://bp24s9q4.ap-southeast.insforge.app';
const anonKey = import.meta.env.VITE_INSFORGE_ANON_KEY || '';

if (!anonKey) {
  console.warn(
    '[InsForge] VITE_INSFORGE_ANON_KEY is not defined in the environment. Please check your .env.local file.'
  );
}

/**
 * Singleton InsForge client configured with public anonymous key for client-side API requests.
 * All database and storage operations are strictly enforced by PostgreSQL Row Level Security (RLS).
 */
export const insforge = createClient({
  baseUrl,
  anonKey,
});

export default insforge;
