/**
 * OpenRouter vision API for edge analysis when `vision.activeModel` is `openrouter`.
 * Uses the same safety JSON contract as local models.
 */

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export type OpenRouterVisionOptions = {
  model: string;
  fallbackModel?: string;
  maxTokens?: number;
  apiKey: string;
  /** Optional context for structured journal logs. */
  logContext?: {
    cameraId?: string;
    cameraName?: string;
    role?: string;
  };
};

export type OpenRouterUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

/**
 * @param imageMime e.g. image/jpeg
 * @param imageBase64 raw base64 without data URL prefix
 * @param prompt full safety analysis prompt
 */
export async function callOpenRouterVision(
  imageMime: string,
  imageBase64: string,
  prompt: string,
  options: OpenRouterVisionOptions,
): Promise<string> {
  const { model, fallbackModel, maxTokens = 512, apiKey, logContext } = options;
  if (!apiKey?.trim()) {
    throw new Error('OPENROUTER_API_KEY is not set (or empty)');
  }
  const dataUrl = `data:${imageMime};base64,${imageBase64}`;

  const body = (m: string) => ({
    model: m,
    temperature: 0.2,
    max_tokens: maxTokens,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      },
    ],
  });

  const doFetch = async (m: string) => {
    const started = Date.now();
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/axon-vision/edge',
        'X-Title': 'Axon Edge Vision',
      },
      body: JSON.stringify(body(m)),
    });
    const ms = Date.now() - started;
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      console.error(
        `[OpenRouter] FAIL camera=${logContext?.cameraId || '-'} role=${logContext?.role || '-'} model=${m} ms=${ms} status=${res.status} body=${t.slice(0, 200)}`,
      );
      throw new Error(`OpenRouter HTTP ${res.status}: ${t.slice(0, 500)}`);
    }
    const j = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: OpenRouterUsage;
      model?: string;
    };
    const usage = j.usage || {};
    const promptTokens = usage.prompt_tokens ?? '?';
    const completionTokens = usage.completion_tokens ?? '?';
    const totalTokens = usage.total_tokens ?? '?';
    console.log(
      `[OpenRouter] SENT camera=${logContext?.cameraId || '-'} name=${JSON.stringify(logContext?.cameraName || '')} role=${logContext?.role || '-'} model=${j.model || m} ms=${ms} prompt_tokens=${promptTokens} completion_tokens=${completionTokens} total_tokens=${totalTokens}`,
    );
    return j;
  };

  try {
    const j = await doFetch(model);
    const text = j.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error('OpenRouter returned empty content');
    return text;
  } catch (e) {
    if (!fallbackModel || fallbackModel === model) throw e;
    console.warn(
      `[OpenRouter] fallback camera=${logContext?.cameraId || '-'} from=${model} to=${fallbackModel}`,
    );
    const j = await doFetch(fallbackModel);
    const text = j.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error('OpenRouter returned empty content (fallback)');
    return text;
  }
}
