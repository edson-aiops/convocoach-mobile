/* mastery.js — cliente HTTP para o vocab-mastery-api (contrato v1.0.0)
 * Stack vanilla ES module; sem dependencias.
 * Degradacao graciosa em todas as chamadas (try/catch silencioso).
 */

export const MASTERY_API_URL = 'https://edsonpo-vocab-mastery-api.hf.space';

/** GET /mastery/targets — retorna array de palavras-alvo. Falha => []. */
export async function fetchTargets({ tiers = ['bronze', 'silver'], bands, limit = 15 } = {}) {
  try {
    const params = new URLSearchParams();
    if (tiers?.length) params.set('tiers', tiers.join(','));
    if (bands?.length) params.set('bands', bands.join(','));
    params.set('limit', String(limit));
    const res = await fetch(`${MASTERY_API_URL}/mastery/targets?${params}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });
    if (!res.ok) {
      console.warn('[mastery] fetchTargets HTTP', res.status);
      return [];
    }
    const data = await res.json();
    return data.words || [];
  } catch (e) {
    console.warn('[mastery] fetchTargets failed:', e.message);
    return [];
  }
}

/** POST /mastery/patch — reporta uso de uma palavra em conversa. Fire-and-forget. */
export async function reportConversationUse(word, scenario) {
  try {
    const res = await fetch(`${MASTERY_API_URL}/mastery/patch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        word: word.toLowerCase().trim(),
        source: 'conversation',
        delta: { used_count: 1 }
      })
    });
    if (!res.ok) {
      console.warn('[mastery] reportConversationUse HTTP', res.status);
    } else {
      console.log('[mastery] reported use:', word);
    }
  } catch (e) {
    console.warn('[mastery] reportConversationUse failed:', e.message);
  }
}
