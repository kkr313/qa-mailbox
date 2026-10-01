const CONTEXT = /(otp|code|password|passcode|pin|token|verification|verify|auth)/i;
const CANDIDATE = /\b([0-9]{4,8}|[0-9]{3}[- ][0-9]{3})\b/g;

// Values that look like codes but almost never are (years, ports, amounts).
function isNoise(value, haystack, index) {
  const before = haystack.slice(Math.max(0, index - 12), index);
  if (/[$€£₹]\s*$/.test(before)) return true;
  if (/\d[.,]$/.test(before)) return true;
  if (/^(19|20)\d{2}$/.test(value)) return true;
  return false;
}

/**
 * Returns the most likely one-time code found in the subject/body, or null.
 */
export function extractOtp({ subject = '', body = '' } = {}) {
  const sources = [
    { text: subject, weight: 3 },
    { text: body, weight: 1 },
  ];

  let best = null;

  for (const { text, weight } of sources) {
    if (!text) continue;
    const flat = text.replace(/\s+/g, ' ');
    for (const match of flat.matchAll(CANDIDATE)) {
      const raw = match[0];
      const value = raw.replace(/[- ]/g, '');
      if (isNoise(value, flat, match.index)) continue;

      const window = flat.slice(Math.max(0, match.index - 60), match.index + raw.length + 40);
      let score = weight;
      if (CONTEXT.test(window)) score += 5;
      if (value.length === 6) score += 2;
      else if (value.length === 4 || value.length === 8) score += 1;

      if (!best || score > best.score) best = { value, score };
    }
  }

  return best && best.score >= 3 ? best.value : null;
}
