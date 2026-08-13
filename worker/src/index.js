/**
 * Cloudflare Worker — RAG chatbot for Ibrahim's research site.
 *
 * Retrieval combines:
 *   - semantic search over the pre-built Gemini embedding index
 *   - lexical matching for names, titles and exact phrases
 *   - intent-aware facts for common profile questions
 *   - a small public feed that keeps Blog and Live content fresh
 */

import RAG_INDEX from "./rag_index.json";
import { freshContentToChunks, retrieveChunks } from "./retrieval.js";

const GEMINI_EMBED_MODEL = "models/gemini-embedding-001";
const GEMINI_CHAT_MODEL = "models/gemini-2.5-flash-lite";
const DEFAULT_RAG_FEED_URL = "https://ibrahimkhan4real.github.io/rag-feed.json";
const TOP_K = 6;
const MAX_HISTORY = 6;
const MAX_QUERY_LENGTH = 1000;

const SYSTEM_PROMPT = `You are the friendly research guide on Muhammad Ibrahim Khan's personal website. Answer questions about Ibrahim's research, publications, experience, skills, background, blog posts and current work.

Rules:
- Answer only from the provided website context. If it does not contain the answer, say so clearly.
- On this personal website, first-person questions such as "When will I graduate?" or "What is my research topic?" refer to Ibrahim.
- Give the direct answer first, then a short explanation if useful.
- Treat an expected PhD completion date as an expectation, not a guaranteed graduation date.
- Prefer a newer Live or Blog chunk when it is present.
- Keep the language simple, light and easy to understand.
- Preserve research anonymity: do not guess private paper titles, venues, collaborators or unpublished details.
- When referencing a paper or blog post, include its title when available.
- If asked about something unrelated to Ibrahim or his work, politely redirect.
- Keep responses under 150 words unless the question genuinely needs more detail.`;

export default {
  async fetch(request, env) {
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
      return jsonResponse({ error: "Method not allowed" }, 405, corsHeaders);
    }

    try {
      const body = await request.json();
      const query = String(body.query || "").trim().slice(0, MAX_QUERY_LENGTH);
      const history = cleanHistory(body.history, query);

      if (!query) {
        return jsonResponse({ error: "Empty query" }, 400, corsHeaders);
      }

      if (!env.GEMINI_API_KEY) {
        return jsonResponse({ error: "API key not configured" }, 500, corsHeaders);
      }

      const [queryEmbedding, freshChunks] = await Promise.all([
        embedText(query, env.GEMINI_API_KEY),
        loadFreshChunks(env),
      ]);

      const allChunks = [...RAG_INDEX.chunks, ...freshChunks];
      const topChunks = retrieveChunks(query, queryEmbedding || [], allChunks, TOP_K);
      const context = topChunks
        .map((chunk) => `[${chunk.title}]\n${chunk.text}`)
        .join("\n\n---\n\n");

      const answer = await askGemini(query, context, history, env.GEMINI_API_KEY);

      return jsonResponse({
        answer,
        sources: topChunks.map((chunk) => ({
          title: chunk.title,
          source: chunk.source,
          score: Number(chunk.score || 0).toFixed(3),
        })),
      }, 200, corsHeaders);
    } catch (error) {
      console.error("Worker error:", error);
      return jsonResponse({ error: "Internal error" }, 500, corsHeaders);
    }
  },
};

function jsonResponse(data, status, corsHeaders) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function cleanHistory(rawHistory, query) {
  if (!Array.isArray(rawHistory)) return [];

  const history = rawHistory
    .slice(-MAX_HISTORY)
    .filter((message) => message && typeof message.text === "string")
    .map((message) => ({
      role: message.role === "user" ? "user" : "assistant",
      text: message.text.slice(0, MAX_QUERY_LENGTH),
    }));

  const last = history[history.length - 1];
  if (last?.role === "user" && last.text.trim() === query) {
    history.pop();
  }

  return history;
}

async function loadFreshChunks(env) {
  const feedUrl = env.RAG_FEED_URL || DEFAULT_RAG_FEED_URL;
  try {
    const response = await fetch(feedUrl, {
      headers: { "Accept": "application/json" },
      cf: { cacheEverything: true, cacheTtl: 300 },
    });

    if (!response.ok) {
      console.warn("Fresh RAG feed unavailable:", response.status);
      return [];
    }

    return freshContentToChunks(await response.json());
  } catch (error) {
    console.warn("Could not load fresh RAG content:", error);
    return [];
  }
}

async function embedText(text, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/${GEMINI_EMBED_MODEL}:embedContent?key=${apiKey}`;
  const payload = {
    model: GEMINI_EMBED_MODEL,
    content: { parts: [{ text }] },
  };

  // Older indexes were embedded without a task type. Keep those spaces
  // compatible, and automatically use retrieval-query mode after a rebuild.
  if (RAG_INDEX.taskType === "RETRIEVAL_DOCUMENT") {
    payload.embedContentConfig = { taskType: "RETRIEVAL_QUERY" };
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    console.error("Embed error:", response.status, await response.text());
    return null;
  }

  const data = await response.json();
  return data.embedding?.values || null;
}

async function askGemini(query, context, history, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/${GEMINI_CHAT_MODEL}:generateContent?key=${apiKey}`;
  const contents = history.map((message) => ({
    role: message.role === "user" ? "user" : "model",
    parts: [{ text: message.text }],
  }));

  contents.push({
    role: "user",
    parts: [{
      text: `Context from Ibrahim's public website:\n\n${context}\n\n---\n\nUser question: ${query}`,
    }],
  });

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents,
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 400,
      },
    }),
  });

  if (!response.ok) {
    console.error("Gemini error:", response.status, await response.text());
    return "Sorry, I am having trouble connecting right now. Please try again later.";
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text
    || "I could not generate a response. Please try again.";
}
