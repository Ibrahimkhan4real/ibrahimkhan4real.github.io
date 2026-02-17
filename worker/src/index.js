/**
 * Cloudflare Worker — RAG chatbot for Ibrahim's research site.
 *
 * Flow:
 *   1. Receive user query
 *   2. Embed the query via Gemini embedding API
 *   3. Cosine-similarity search over pre-computed chunk embeddings
 *   4. Send top-k chunks + query to Gemini for a grounded answer
 *   5. Return the response
 */

import RAG_INDEX from "./rag_index.json";

const GEMINI_EMBED_MODEL = "models/gemini-embedding-001";
const GEMINI_CHAT_MODEL = "models/gemini-2.5-flash-lite";
const TOP_K = 4;
const MAX_HISTORY = 6; // max previous messages to keep for context

const SYSTEM_PROMPT = `You are a helpful research assistant on Muhammad Ibrahim Khan's personal website. Your role is to answer questions about Ibrahim's research, publications, experience, skills, and background.

Rules:
- Answer based ONLY on the provided context chunks. If the context does not contain the answer, say so honestly.
- Be concise and direct. Use a professional but approachable tone.
- When referencing papers, include the title and year.
- Do not make up information that is not in the context.
- If asked about topics unrelated to Ibrahim or his research, politely redirect.
- Keep responses under 150 words unless the question requires more detail.`;

export default {
  async fetch(request, env) {
    // CORS
    const origin = request.headers.get("Origin") || "";
    const allowedOrigin = env.ALLOWED_ORIGIN || "https://ibrahimkhan4real.github.io";
    const corsHeaders = {
      "Access-Control-Allow-Origin": origin === "http://localhost:4000" ? origin : allowedOrigin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    try {
      const body = await request.json();
      const query = (body.query || "").trim();
      const history = Array.isArray(body.history) ? body.history.slice(-MAX_HISTORY) : [];

      if (!query) {
        return jsonResponse({ error: "Empty query" }, 400, corsHeaders);
      }

      if (!env.GEMINI_API_KEY) {
        return jsonResponse({ error: "API key not configured" }, 500, corsHeaders);
      }

      // Step 1: Embed the query
      const queryEmbedding = await embedText(query, env.GEMINI_API_KEY);
      if (!queryEmbedding) {
        return jsonResponse({ error: "Embedding failed" }, 500, corsHeaders);
      }

      // Step 2: Find top-k similar chunks
      const scored = RAG_INDEX.chunks.map((chunk) => ({
        ...chunk,
        score: cosineSimilarity(queryEmbedding, chunk.embedding),
      }));
      scored.sort((a, b) => b.score - a.score);
      const topChunks = scored.slice(0, TOP_K);

      // Step 3: Build context and call Gemini
      const context = topChunks
        .map((c) => `[${c.title}]\n${c.text}`)
        .join("\n\n---\n\n");

      const answer = await askGemini(query, context, history, env.GEMINI_API_KEY);

      return jsonResponse({
        answer: answer,
        sources: topChunks.map((c) => ({ title: c.title, source: c.source, score: c.score.toFixed(3) })),
      }, 200, corsHeaders);
    } catch (err) {
      console.error("Worker error:", err);
      return jsonResponse({ error: "Internal error" }, 500, corsHeaders);
    }
  },
};

// --- Helpers ---

function jsonResponse(data, status, corsHeaders) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function cosineSimilarity(a, b) {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

async function embedText(text, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/${GEMINI_EMBED_MODEL}:embedContent?key=${apiKey}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: GEMINI_EMBED_MODEL,
      content: { parts: [{ text }] },
    }),
  });

  if (!resp.ok) {
    console.error("Embed error:", resp.status, await resp.text());
    return null;
  }

  const data = await resp.json();
  return data.embedding?.values || null;
}

async function askGemini(query, context, history, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/${GEMINI_CHAT_MODEL}:generateContent?key=${apiKey}`;

  // Build conversation contents
  const contents = [];

  // Add history
  for (const msg of history) {
    contents.push({
      role: msg.role === "user" ? "user" : "model",
      parts: [{ text: msg.text }],
    });
  }

  // Add current query with context
  contents.push({
    role: "user",
    parts: [{
      text: `Context from Ibrahim's website:\n\n${context}\n\n---\n\nUser question: ${query}`,
    }],
  });

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents,
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 400,
      },
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    console.error("Gemini error:", resp.status, errText);
    return "Sorry, I'm having trouble connecting right now. Please try again later.";
  }

  const data = await resp.json();
  const candidate = data.candidates?.[0];
  return candidate?.content?.parts?.[0]?.text || "I couldn't generate a response. Please try again.";
}
