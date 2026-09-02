/**
 * Mood Detector Utility
 * Integrates emotion detection into Tim-chatbot
 * Uses Gemini API to classify user emotions with context awareness
 */

const MOOD_KEYS = ['happy', 'excited', 'sad', 'angry', 'anxious', 'neutral'];

// Lexicon for fallback mood detection
const LEXICON = {
  happy: ['great', 'awesome', 'thanks', 'thank you', 'love', 'amazing', 'perfect', 'happy', 'good', 'glad', 'nice', 'excellent'],
  excited: ['excited', "can't wait", 'yes!', 'wow', 'omg', 'finally', "let's go"],
  sad: ['sad', 'disappointed', 'unhappy', 'upset', 'crying', 'down', 'depressed', 'sorry to hear', 'lost'],
  angry: ['angry', 'furious', 'terrible', 'worst', 'hate', 'awful', 'ridiculous', 'unacceptable', 'refund', 'broken', 'scam', 'annoyed', 'frustrat'],
  anxious: ['worried', 'nervous', 'anxious', 'scared', 'confused', 'not sure', 'unsure', 'help me', 'urgent'],
};

/**
 * Detect mood from user message using backend API
 * @param {string} text - User message text
 * @param {array} conversationHistory - Previous messages for context
 * @returns {Promise<{mood: string, confidence: number}>}
 */
export async function detectMoodAI(text, conversationHistory = []) {
  try {
    const response = await fetch('/api/detect-mood', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        history: conversationHistory
      })
    });

    if (!response.ok) {
      console.warn(`Mood detection API returned ${response.status}`);
      throw new Error('API error');
    }
    const data = await response.json();
    
    if (!MOOD_KEYS.includes(data.mood)) {
      console.warn('Invalid mood value from API:', data.mood);
      throw new Error('Invalid mood value');
    }

    return {
      mood: data.mood,
      confidence: Math.max(0, Math.min(1, Number(data.confidence) || 0.5))
    };
  } catch (err) {
    console.warn('AI mood detection failed, using fallback:', err.message);
    return detectMoodFallback(text);
  }
}

/**
 * Fallback mood detection using keyword matching
 * @param {string} text - User message text
 * @returns {{mood: string, confidence: number}}
 */
export function detectMoodFallback(text) {
  const t = text.toLowerCase();
  const scores = { happy: 0, excited: 0, sad: 0, angry: 0, anxious: 0, neutral: 0 };

  // Score keywords
  for (const [mood, words] of Object.entries(LEXICON)) {
    for (const w of words) {
      if (t.includes(w)) scores[mood] += 1;
    }
  }

  // Detect intensity markers
  if (/!!!|\?\?\?|[A-Z]{4,}/.test(text)) scores.angry += 0.5;
  if (/!{2,}|wow|amazing|love|great|yes|awesome/.test(t)) scores.happy += 0.5;
  if (/can't wait|finally|excited|so/.test(t)) scores.excited += 0.5;
  if (/help|please|urgent|asap/.test(t)) scores.anxious += 0.5;

  // Count negative patterns
  const negativeCount = (t.match(/don't|not|no|never|won't|can't/g) || []).length;
  if (negativeCount > 2) scores.sad += 0.5;

  // Get top mood
  const [topMood, topScore] = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  
  // Determine confidence based on score
  let confidence = 0.3;
  if (topScore > 0) {
    confidence = Math.min(0.8, 0.3 + topScore * 0.15);
  }

  const detectedMood = topScore > 0 ? topMood : 'neutral';
  console.log(`Fallback mood detection: "${text.slice(0, 40)}..." => ${detectedMood} (confidence: ${confidence.toFixed(2)})`);
  
  return {
    mood: detectedMood,
    confidence
  };
}

/**
 * Mood configuration
 */
export const MOOD_CONFIG = {
  happy: { label: 'Upbeat', icon: '☀', color: '#e0a52c' },
  excited: { label: 'Excited', icon: '⚡', color: '#3fb6a8' },
  sad: { label: 'Down', icon: '☁', color: '#5c7cfa' },
  angry: { label: 'Frustrated', icon: '!', color: '#c9584f' },
  anxious: { label: 'Anxious', icon: '~', color: '#9b7fd4' },
  neutral: { label: 'Neutral', icon: '•', color: '#8a8f98' }
};
