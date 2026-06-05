// src/ai/providers/groq-provider.ts
/**
 * Fournisseur Groq - API ultra-rapide pour fallback ou utilisation principale
 */

interface GroqOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
}

interface GroqResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  usage: {
    total_tokens: number;
    prompt_tokens: number;
    completion_tokens: number;
  };
}

export async function callGroq(prompt: string, options: GroqOptions = {}): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  
  if (!apiKey) {
    throw new Error('GROQ_API_KEY non définie dans .env.local');
  }
  
  const {
    model = 'llama-3.3-70b-versatile',
    temperature = 0.3,
    maxTokens = 1000,
    timeout = 30000
  } = options;
  
  const startTime = Date.now();
  
  console.log(`[GROQ] 🚀 Appel à ${model}...`);
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'Tu es un assistant industriel expert. Réponds en français de manière précise et technique.' },
          { role: 'user', content: prompt }
        ],
        temperature,
        max_tokens: maxTokens
      }),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Groq API error (${response.status}): ${errorText}`);
    }
    
    const data: GroqResponse = await response.json();
    const duration = Date.now() - startTime;
    
    console.log(`[GROQ] ✅ Réponse générée en ${duration}ms`);
    console.log(`[GROQ] 📊 Tokens: ${data.usage.total_tokens} (prompt: ${data.usage.prompt_tokens}, completion: ${data.usage.completion_tokens})`);
    
    return data.choices[0].message.content;
    
  } catch (error: any) {
    const duration = Date.now() - startTime;
    
    if (error.name === 'AbortError') {
      console.error(`[GROQ] ❌ Timeout après ${duration}ms`);
      throw new Error(`Groq timeout after ${timeout}ms`);
    }
    
    console.error(`[GROQ] ❌ Erreur:`, error.message);
    throw error;
  }
}

/**
 * Version streaming pour les réponses longues
 */
export async function* callGroqStream(prompt: string, options: GroqOptions = {}): AsyncIterable<string> {
  const apiKey = process.env.GROQ_API_KEY;
  
  if (!apiKey) {
    throw new Error('GROQ_API_KEY non définie dans .env.local');
  }
  
  const {
    model = 'llama-3.3-70b-versatile',
    temperature = 0.3,
    maxTokens = 1000
  } = options;
  
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'Tu es un assistant industriel expert. Réponds en français.' },
        { role: 'user', content: prompt }
      ],
      temperature,
      max_tokens: maxTokens,
      stream: true
    })
  });
  
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  
  if (!reader) throw new Error('Stream non disponible');
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    const chunk = decoder.decode(value);
    const lines = chunk.split('\n').filter(line => line.startsWith('data: '));
    
    for (const line of lines) {
      const data = line.slice(6);
      if (data === '[DONE]') continue;
      
      try {
        const parsed = JSON.parse(data);
        const content = parsed.choices[0]?.delta?.content;
        if (content) yield content;
      } catch (e) {
        // Ignorer les erreurs de parsing
      }
    }
  }
}