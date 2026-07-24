const OPENROUTER_CREDITS_URL = 'https://openrouter.ai/api/v1/credits';
const CACHE_TTL_MS = 60_000;

export type OpenRouterHealth = {
  ok: boolean;
  configured: boolean;
  active: boolean;
  totalCredits: number | null;
  totalUsage: number | null;
  balance: number | null;
  error?: string;
};

let cached: { at: number; value: Omit<OpenRouterHealth, 'active'> } | null = null;

/**
 * Check OpenRouter authentication and account credits without running inference.
 * The result is cached because the health UI polls frequently.
 */
export async function checkOpenRouterHealth(active: boolean): Promise<OpenRouterHealth> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    return {
      ok: false,
      configured: false,
      active,
      totalCredits: null,
      totalUsage: null,
      balance: null,
      error: 'API key is not configured',
    };
  }

  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return { ...cached.value, active };
  }

  let value: Omit<OpenRouterHealth, 'active'>;
  try {
    const response = await fetch(OPENROUTER_CREDITS_URL, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8_000),
    });

    if (!response.ok) {
      value = {
        ok: false,
        configured: true,
        totalCredits: null,
        totalUsage: null,
        balance: null,
        error:
          response.status === 401 || response.status === 403
            ? 'API key was rejected'
            : `OpenRouter returned HTTP ${response.status}`,
      };
    } else {
      const payload = (await response.json()) as {
        data?: { total_credits?: number; total_usage?: number };
      };
      const totalCredits = Number(payload.data?.total_credits);
      const totalUsage = Number(payload.data?.total_usage);

      if (!Number.isFinite(totalCredits) || !Number.isFinite(totalUsage)) {
        value = {
          ok: false,
          configured: true,
          totalCredits: null,
          totalUsage: null,
          balance: null,
          error: 'OpenRouter returned an invalid credits response',
        };
      } else {
        const balance = Math.max(0, totalCredits - totalUsage);
        value = {
          ok: balance > 0,
          configured: true,
          totalCredits,
          totalUsage,
          balance,
          error: balance > 0 ? undefined : 'Insufficient credits',
        };
      }
    }
  } catch (error) {
    value = {
      ok: false,
      configured: true,
      totalCredits: null,
      totalUsage: null,
      balance: null,
      error:
        error instanceof Error && error.name === 'TimeoutError'
          ? 'OpenRouter health check timed out'
          : 'Unable to reach OpenRouter',
    };
  }

  cached = { at: Date.now(), value };
  return { ...value, active };
}
