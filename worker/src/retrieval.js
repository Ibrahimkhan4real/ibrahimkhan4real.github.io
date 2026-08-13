const STOP_WORDS = new Set([
  "a", "about", "an", "and", "are", "as", "at", "be", "been", "by", "can",
  "did", "do", "does", "for", "from", "had", "has", "have", "he", "her",
  "him", "his", "how", "i", "in", "is", "it", "me", "my", "of", "on",
  "or", "our", "she", "that", "the", "their", "them", "they", "this", "to",
  "was", "we", "were", "what", "when", "where", "which", "who", "why",
  "will", "with", "you", "your"
]);

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokensFor(text) {
  return normalizeText(text)
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

export function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
    return 0;
  }

  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  const denominator = Math.sqrt(magA) * Math.sqrt(magB);
  return denominator === 0 ? 0 : dot / denominator;
}

export function detectIntents(query) {
  const text = normalizeText(query);
  const intents = new Set();

  if (/\b(graduat|graduation|expected completion|finish(?:ing)? (?:my |your |his |the )?phd|complete(?:ing)? (?:my |your |his |the )?phd|phd (?:finish|end|completion))/.test(text)) {
    intents.add("graduation");
  }
  if (/\b(research topic|phd topic|thesis topic|phd about|thesis about|research area|area of research)/.test(text)) {
    intents.add("research-topic");
  }
  if (/\b(right now|currently|current work|current focus|working on now|work on now|lately|these days|live update|latest work)/.test(text)) {
    intents.add("current");
  }
  if (/\b(blog|blogs|blog post|post|wrote|written|writing)\b/.test(text)) {
    intents.add("blog");
  }
  if (intents.has("blog") && /\b(latest|newest|recent|last|current)\b/.test(text)) {
    intents.add("latest-blog");
  }
  if (/\b(email|contact|reach|linkedin|github profile|website address)\b/.test(text)) {
    intents.add("contact");
  }
  if (/\b(education|degree|university|studied|study|beng|bachelor)\b/.test(text)) {
    intents.add("education");
  }
  if (/\b(skill|skills|technology|technologies|programming language|tools)\b/.test(text)) {
    intents.add("skills");
  }
  if (/\b(job|jobs|experience|worked|employer|career|curemd|teaching assistant)\b/.test(text)) {
    intents.add("experience");
  }
  if (/\b(paper|papers|publication|publications|published|article|articles)\b/.test(text)) {
    intents.add("papers");
  }
  if (/\b(who is|tell me about|background|biography|bio)\b/.test(text)) {
    intents.add("about");
  }

  return intents;
}

function lexicalScore(query, chunk) {
  const queryTokens = [...new Set(tokensFor(query))];
  if (queryTokens.length === 0) return 0;

  const searchable = [
    chunk.title,
    chunk.text,
    ...(Array.isArray(chunk.keywords) ? chunk.keywords : []),
    ...(Array.isArray(chunk.questions) ? chunk.questions : []),
  ].join(" ");
  const searchableText = normalizeText(searchable);
  const searchableTokens = new Set(tokensFor(searchable));
  const matches = queryTokens.filter((token) => searchableTokens.has(token)).length;
  let score = matches / queryTokens.length;

  const normalizedQuery = normalizeText(query);
  if (normalizedQuery.length > 8 && searchableText.includes(normalizedQuery)) {
    score = Math.max(score, 1);
  }

  return score;
}

function inferKind(chunk) {
  if (chunk.kind) return chunk.kind;
  const source = String(chunk.source || "");
  if (source.includes("_posts/") || source.includes("blog/posts/")) return "blog";
  if (source.includes("_data/now.yml") || chunk.id === "current-status") return "live";
  if (source.includes("papers.json")) return "paper";
  return "profile";
}

function scoreChunk(query, queryEmbedding, chunk, intents) {
  const semantic = cosineSimilarity(queryEmbedding, chunk.embedding);
  const lexical = lexicalScore(query, chunk);
  const kind = inferKind(chunk);
  let intentBonus = 0;

  if (intents.has("blog") && kind === "blog") intentBonus += 0.14;
  if (intents.has("current") && kind === "live") intentBonus += 0.18;
  if (intents.has("papers") && kind === "paper") intentBonus += 0.12;

  return {
    ...chunk,
    kind,
    semanticScore: semantic,
    lexicalScore: lexical,
    score: (semantic * 0.72) + (lexical * 0.34) + intentBonus + ((chunk.priority || 0) * 0.01),
  };
}

function newestBlogChunk(chunks) {
  const dateKey = (chunk) => {
    if (chunk.date) return String(chunk.date);
    return String(chunk.source || "").match(/\d{4}-\d{2}-\d{2}/)?.[0] || "";
  };

  return chunks
    .filter((chunk) => inferKind(chunk) === "blog")
    .sort((a, b) => dateKey(b).localeCompare(dateKey(a)))[0];
}

function preferredCurrentChunk(chunks) {
  return chunks.find((chunk) => chunk.id === "fresh-current-status")
    || chunks.find((chunk) => chunk.id === "current-status");
}

function pinById(chunks, id) {
  return chunks.find((chunk) => chunk.id === id);
}

function pinnedChunksFor(intents, chunks) {
  const pinned = [];
  const add = (chunk) => {
    if (chunk && !pinned.some((item) => item.id === chunk.id)) pinned.push(chunk);
  };

  if (intents.has("graduation")) add(pinById(chunks, "profile-education"));
  if (intents.has("research-topic")) {
    add(pinById(chunks, "profile-about"));
    add(pinById(chunks, "profile-education"));
  }
  if (intents.has("current")) add(preferredCurrentChunk(chunks));
  if (intents.has("latest-blog")) add(newestBlogChunk(chunks));
  if (intents.has("contact")) add(pinById(chunks, "profile-contact"));
  if (intents.has("education")) add(pinById(chunks, "profile-education"));
  if (intents.has("skills")) add(pinById(chunks, "profile-skills"));
  if (intents.has("experience")) add(pinById(chunks, "profile-experience"));
  if (intents.has("about")) add(pinById(chunks, "profile-about"));

  return pinned;
}

export function retrieveChunks(query, queryEmbedding, chunks, topK = 6) {
  const intents = detectIntents(query);
  const scored = chunks
    .map((chunk) => scoreChunk(query, queryEmbedding, chunk, intents))
    .sort((a, b) => b.score - a.score);

  const selected = [];
  const add = (chunk, pinned = false) => {
    if (!chunk || selected.some((item) => item.id === chunk.id)) return;
    const scoredChunk = scored.find((item) => item.id === chunk.id) || chunk;
    selected.push({
      ...scoredChunk,
      score: pinned ? Math.max(scoredChunk.score || 0, 1.05) : scoredChunk.score,
      retrieval: pinned ? "intent" : "hybrid",
    });
  };

  pinnedChunksFor(intents, chunks).forEach((chunk) => add(chunk, true));
  scored.forEach((chunk) => {
    // A "latest blog" question has one factual answer. Older blog chunks can
    // distract the language model even when the newest post is ranked first.
    if (intents.has("latest-blog") && chunk.kind === "blog") return;
    if (selected.length < topK) add(chunk);
  });

  return selected.slice(0, topK);
}

export function freshContentToChunks(feed) {
  const chunks = [];
  if (feed?.live?.content) {
    const projectText = Array.isArray(feed.live.projects)
      ? feed.live.projects
          .map((project) => `${project.name || ""}: ${project.description || ""}`)
          .join(" ")
      : "";

    chunks.push({
      id: "fresh-current-status",
      title: `Current work — ${feed.live.updated || "latest update"}`,
      source: "live.html",
      kind: "live",
      priority: 10,
      text: `Last updated: ${feed.live.updated || "recently"}. ${feed.live.content} ${projectText}`.trim(),
    });
  }

  const posts = Array.isArray(feed?.posts) ? feed.posts.slice(0, 20) : [];
  posts.forEach((post, index) => {
    const source = post.url || `blog-post-${index}`;
    chunks.push({
      id: `fresh-blog-${index}-${normalizeText(post.title).replace(/\s+/g, "-")}`,
      title: post.title || "Blog post",
      source,
      kind: "blog",
      date: post.date || "",
      priority: index === 0 ? 5 : 0,
      text: String(post.content || post.excerpt || "").replace(/\s+/g, " ").trim().slice(0, 5000),
    });
  });

  return chunks;
}
