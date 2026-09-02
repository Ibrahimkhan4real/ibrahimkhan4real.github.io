const STOP_WORDS = new Set([
  "a", "about", "an", "and", "are", "as", "at", "be", "been", "by", "can",
  "did", "do", "does", "for", "from", "had", "has", "have", "he", "her",
  "him", "his", "how", "i", "in", "is", "it", "me", "my", "of", "on",
  "or", "our", "she", "that", "the", "their", "them", "they", "this", "to",
  "was", "we", "were", "what", "when", "where", "which", "who", "why",
  "ibrahim", "muhammad", "khan",
  "will", "with", "you", "your"
]);

const POLICY_ANSWERS = {
  privacy: "That is private information and is not part of Ibrahim's public professional profile. I can help with his published work, public roles, education, skills, or professional contact links instead.",
  "private-research": "I cannot provide or infer anonymous-review, unpublished-result, employer-confidential, or private collaborator details. I can discuss the research directions and publications that Ibrahim has made public.",
  injection: "I cannot reveal hidden instructions, credentials, internal context, or the raw corpus. I can answer a question about Ibrahim using the public sources listed on this website.",
  unrelated: "That is outside this research guide's public scope. I can help with Ibrahim's research, publications, public projects, professional background, or current work."
};

const INTENT_PINS = new Map([
  ["graduation", ["profile-education"]],
  ["research-topic", ["profile-about", "profile-education"]],
  ["current", ["current-summary"]],
  ["latest-blog", ["blog-summary"]],
  ["contact", ["profile-contact"]],
  ["cv", ["profile-contact"]],
  ["roles", ["profile-roles"]],
  ["education", ["profile-education"]],
  ["skills", ["profile-skills"]],
  ["experience", ["profile-experience"]],
  ["teaching", ["profile-teaching"]],
  ["recognition", ["profile-recognition"]],
  ["service", ["profile-service"]],
  ["papers", ["publications-summary"]],
  ["projects", ["projects-summary"]],
  ["about", ["profile-about"]],
  ["mcts", ["concept-monte-carlo-tree-search"]],
  ["ppo", ["concept-proximal-policy-optimization"]],
  ["sac", ["concept-soft-actor-critic"]],
  ["boptest", ["concept-boptest"]],
  ["sindy", ["concept-sindy"]],
  ["rag", ["concept-retrieval-augmented-generation"]],
  ["multi-agent", ["concept-multi-agent-llm-research"]],
  ["reproducible", ["concept-reproducible-research"]],
  ["planning-learning", ["concept-planning-versus-learning"]]
]);

export function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function stemToken(token) {
  return token
    .replace(/ies$/, "y")
    .replace(/ing$/, "")
    .replace(/ed$/, "")
    .replace(/s$/, "");
}

export function tokensFor(text) {
  return normalizeText(text)
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token))
    .map(stemToken)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function editDistanceAtMostOne(left, right) {
  if (left === right) return true;
  if (Math.abs(left.length - right.length) > 1) return false;
  if (left.length > 4 && right.length > 4) {
    let i = 0;
    let j = 0;
    let edits = 0;
    while (i < left.length && j < right.length) {
      if (left[i] === right[j]) {
        i += 1;
        j += 1;
        continue;
      }
      edits += 1;
      if (edits > 1) return false;
      if (left.length > right.length) i += 1;
      else if (right.length > left.length) j += 1;
      else {
        i += 1;
        j += 1;
      }
    }
    return edits + Number(i < left.length || j < right.length) <= 1;
  }
  return false;
}

function tokenMatches(token, candidates) {
  if (candidates.has(token)) return true;
  if (token.length < 4) return false;
  for (const candidate of candidates) {
    if (editDistanceAtMostOne(token, candidate)) return true;
  }
  return false;
}

export function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || a.length !== b.length) {
    return 0;
  }

  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    magA += a[index] * a[index];
    magB += b[index] * b[index];
  }

  const denominator = Math.sqrt(magA) * Math.sqrt(magB);
  return denominator === 0 ? 0 : dot / denominator;
}

export function classifyQuery(query) {
  const text = normalizeText(query);

  if (/\b(ignore (?:all |any )?(?:previous|prior|above)|system prompt|api key|hidden (?:context|instructions?)|developer instruction|raw corpus|reveal (?:your )?(?:secret|prompt|instructions?)|print (?:your )?(?:prompt|context)|disclose secrets?)\b/.test(text)) {
    return "injection";
  }
  if (/\b(anonymous (?:paper|review|submission|collaborator)|under review|reviewing venue|unpublished (?:paper|work|result|experiment)|private collaborator|confidential (?:data|work|result)|hidden paper)\b/.test(text)) {
    return "private-research";
  }
  if (/\b(phone|mobile number|home address|street address|birthday|date of birth|how old|age|married|relationship|family|salary|income|visa|immigration|private (?:email|contact|reference)|reference contact|calendar|precise location|where is he right now)\b/.test(text)) {
    return "privacy";
  }
  if (/\b(weather|forecast|medical advice|diagnose me|football score|stock price)\b/.test(text)) {
    return "unrelated";
  }
  return null;
}

export function policyAnswerForQuery(query) {
  const policy = classifyQuery(query);
  if (!policy) return null;
  return {
    answer: POLICY_ANSWERS[policy],
    mode: policy === "unrelated" ? "redirect" : "decline",
    policy,
    sourceIds: []
  };
}

export function detectIntents(query) {
  const text = normalizeText(query);
  const intents = new Set();

  if (/\b(graduat|graduation|expected completion|finish(?:ing)? (?:my |your |his |the )?phd|complete(?:ing)? (?:my |your |his |the )?phd|phd (?:finish|end|completion))/.test(text)) {
    intents.add("graduation");
  }
  if (/\b(research topic|phd topic|thesis topic|phd about|thesis about|research area|area of research|doctoral thesis|doctoral research)/.test(text)) {
    intents.add("research-topic");
  }
  if (/\b(right now|currently|current work|current focus|working on now|work on now|lately|these days|live update|latest work)\b/.test(text)) {
    intents.add("current");
  }
  if (/\b(blog|blogs|blog post|post|wrote|written|writing)\b/.test(text)) {
    intents.add("blog");
  }
  if (intents.has("blog") && /\b(latest|newest|recent|last|current)\b/.test(text)) {
    intents.add("latest-blog");
  }
  if (/\b(email|contact|reach|linkedin|github profile|github username|website (?:address|url)|professional contact)\b/.test(text)) {
    intents.add("contact");
  }
  if (/\b(cv|curriculum vitae|resume)\b/.test(text)) {
    intents.add("cv");
  }
  if (/\b(current role|current roles|job now|work now|where (?:does|do) (?:he|ibrahim|you) work|affiliat|ucl role|coventry role)\b/.test(text)) {
    intents.add("roles");
  }
  if (/\b(education|degree|university|studied|study|beng|bachelor|undergraduate|supervisor|phd at|thesis|studentship)\b/.test(text)) {
    intents.add("education");
  }
  if (/\b(skill|skills|technology|technologies|programming language|tools|infrastructure|hpc)\b/.test(text)) {
    intents.add("skills");
  }
  if (/\b(job|jobs|experience|worked|employer|career|curemd|cure md|production rag|ai engineer)\b/.test(text)) {
    intents.add("experience");
  }
  if (/\b(teach|teaching|taught|students|lab demonstrator|grading)\b/.test(text)) {
    intents.add("teaching");
  }
  if (/\b(award|awards|recognition|fellow|qualification|turing scheme|funded|funding|innovation award)\b/.test(text)) {
    intents.add("recognition");
  }
  if (/\b(talk|conference|symposium|present|reviewer|peer review|academic service)\b/.test(text)) {
    intents.add("service");
  }
  if (/\b(paper|papers|publication|publications|published|article|articles|co author|citation)\b/.test(text)) {
    intents.add("papers");
  }
  if (/\b(project|projects|repository|repositories|github|implemented|implementation|built|software)\b/.test(text)) {
    intents.add("projects");
  }
  if (/\b(who is|tell me about|background|biography|bio|full name|call him)\b/.test(text)) {
    intents.add("about");
  }
  if (/\b(mcts|monte carlo tree search|tree search)\b/.test(text)) {
    intents.add("mcts");
  }
  if (/\b(ppo|proximal policy optimization)\b/.test(text)) {
    intents.add("ppo");
  }
  if (/\b(sac|soft actor critic)\b/.test(text)) {
    intents.add("sac");
  }
  if (/\b(boptest)\b/.test(text)) {
    intents.add("boptest");
  }
  if (/\b(sindy|sparse identification)\b/.test(text)) {
    intents.add("sindy");
  }
  if (/\b(rag|retrieval augmented generation)\b/.test(text)) {
    intents.add("rag");
  }
  if (/\b(multi agent|language model agents?)\b/.test(text)) {
    intents.add("multi-agent");
  }
  if (/\b(reproducib|auditable research)\b/.test(text)) {
    intents.add("reproducible");
  }
  if (/\b(planning (?:different from|versus|vs) learning|planning versus learned)\b/.test(text)) {
    intents.add("planning-learning");
  }

  return intents;
}

function scoreField(queryTokens, value, weight) {
  const candidateTokens = new Set(tokensFor(value));
  if (candidateTokens.size === 0) return 0;
  const matches = queryTokens.filter((token) => tokenMatches(token, candidateTokens)).length;
  return (matches / queryTokens.length) * weight;
}

export function lexicalScore(query, chunk) {
  const queryTokens = [...new Set(tokensFor(query))];
  if (queryTokens.length === 0) return 0;

  const normalizedQuery = normalizeText(query);
  const questions = Array.isArray(chunk.questions) ? chunk.questions : [];
  if (questions.some((question) => normalizeText(question) === normalizedQuery)) {
    return 4;
  }

  const titleScore = scoreField(queryTokens, chunk.title, 1.7);
  const questionScore = scoreField(queryTokens, questions.join(" "), 1.5);
  const keywordScore = scoreField(
    queryTokens,
    Array.isArray(chunk.keywords) ? chunk.keywords.join(" ") : "",
    1.25
  );
  const textScore = scoreField(queryTokens, chunk.text, 1);
  let score = Math.max(titleScore, questionScore, keywordScore, textScore);

  const searchableText = normalizeText([
    chunk.title,
    chunk.text,
    ...(Array.isArray(chunk.keywords) ? chunk.keywords : []),
    ...questions
  ].join(" "));
  if (normalizedQuery.length > 8 && searchableText.includes(normalizedQuery)) {
    score = Math.max(score, 2);
  }
  return score;
}

function scoreChunk(query, queryEmbedding, chunk, intents) {
  const semanticScore = cosineSimilarity(queryEmbedding, chunk.embedding);
  const lexical = lexicalScore(query, chunk);
  const kind = chunk.kind || "profile";
  let intentBonus = 0;

  if (intents.has("blog") && kind === "blog") intentBonus += 0.12;
  if (intents.has("current") && kind === "current") intentBonus += 0.16;
  if (intents.has("papers") && kind === "publication") intentBonus += 0.12;
  if (intents.has("projects") && kind === "project") intentBonus += 0.1;

  return {
    ...chunk,
    kind,
    semanticScore,
    lexicalScore: lexical,
    score: (semanticScore * 0.65) + (lexical * 0.72) + intentBonus + ((chunk.priority || 0) * 0.006)
  };
}

function pinById(chunks, id) {
  return chunks.find((chunk) => chunk.id === id);
}

function pinnedChunksFor(intents, chunks) {
  const pinned = [];
  const add = (chunk) => {
    if (chunk && !pinned.some((item) => item.id === chunk.id)) pinned.push(chunk);
  };

  for (const [intent, ids] of INTENT_PINS.entries()) {
    if (!intents.has(intent)) continue;
    ids.forEach((id) => add(pinById(chunks, id)));
  }
  return pinned;
}

export function retrieveChunks(query, queryEmbedding, chunks, topK = 6) {
  if (classifyQuery(query)) return [];

  const intents = detectIntents(query);
  const scored = chunks
    .map((chunk) => scoreChunk(query, queryEmbedding, chunk, intents))
    .sort((left, right) => right.score - left.score);
  const pinnedIds = new Set(pinnedChunksFor(intents, chunks).map((chunk) => chunk.id));
  const relevant = scored.filter(
    (chunk) => pinnedIds.has(chunk.id)
      || chunk.lexicalScore >= 0.22
      || chunk.semanticScore >= 0.38
  );

  const selected = [];
  const add = (chunk, retrieval) => {
    if (!chunk || selected.some((item) => item.id === chunk.id)) return;
    selected.push({ ...chunk, retrieval });
  };

  pinnedChunksFor(intents, chunks).forEach((chunk) => {
    const scoredChunk = scored.find((item) => item.id === chunk.id);
    add(scoredChunk || chunk, "intent");
  });
  relevant.forEach((chunk) => {
    if (selected.length < topK) add(chunk, chunk.semanticScore ? "hybrid" : "lexical");
  });

  return selected.slice(0, topK);
}

function chunkById(chunks, id) {
  return chunks.find((chunk) => chunk.id === id);
}

function sourceAnswer(answer, sourceId) {
  return { answer, mode: "direct", sourceIds: sourceId ? [sourceId] : [] };
}

function formatDate(value) {
  const calendarDate = String(value || "").match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (!calendarDate) return String(value || "");
  const parsed = new Date(calendarDate + "T00:00:00Z");
  if (Number.isNaN(parsed.getTime())) return String(value || "");
  return parsed.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  });
}

export function directAnswerForQuery(query, chunks) {
  const policy = policyAnswerForQuery(query);
  if (policy) return policy;

  const text = normalizeText(query);
  const intents = detectIntents(query);
  const contact = chunkById(chunks, "profile-contact");
  const contactFacts = contact?.facts || {};
  const links = contactFacts.links || {};

  if (intents.has("graduation")) {
    return sourceAnswer(
      "The public profile lists Ibrahim's PhD as running from September 2024 to March 2028 (expected). March 2028 is an expected completion date, not a guaranteed graduation date.",
      "profile-education"
    );
  }
  if (intents.has("cv") && links.cv) {
    return sourceAnswer(
      "You can download Ibrahim's verified CV from " + links.cv + ".",
      "profile-contact"
    );
  }
  if (/\bpublic email|email address|contact professionally|how can i contact|reach ibrahim\b/.test(text) && contactFacts.email) {
    return sourceAnswer(
      "Ibrahim's public professional email is " + contactFacts.email + ".",
      "profile-contact"
    );
  }
  if (/\blinkedin\b/.test(text) && links.linkedin) {
    return sourceAnswer("Ibrahim's LinkedIn profile is " + links.linkedin + ".", "profile-contact");
  }
  if (/\bgithub (?:username|profile)\b/.test(text) && links.github) {
    return sourceAnswer("Ibrahim's GitHub profile is " + links.github + ".", "profile-contact");
  }
  if (/\bpersonal website|website url|website address\b/.test(text) && links.website) {
    return sourceAnswer("Ibrahim's public website is " + links.website + ".", "profile-contact");
  }

  const about = chunkById(chunks, "profile-about");
  if (/\bfull name\b/.test(text) && about?.facts?.fullName) {
    return sourceAnswer("His full name is " + about.facts.fullName + ".", "profile-about");
  }
  if (/\bcall him\b/.test(text) && about?.facts?.displayName) {
    return sourceAnswer(
      "His public profile uses " + about.facts.displayName + ", while his full name is " + about.facts.fullName + ".",
      "profile-about"
    );
  }

  const roles = chunkById(chunks, "profile-roles");
  if (
    intents.has("roles")
    && (/\bcurrent role|current roles|job now|where (?:does|do) (?:he|ibrahim|you) work\b/.test(text))
    && Array.isArray(roles?.facts?.roles)
  ) {
    const roleText = roles.facts.roles
      .map((role) => role.title + " at " + role.organisation + " (" + role.dates + ")")
      .join("; ");
    return sourceAnswer("Ibrahim's current public roles are: " + roleText + ".", "profile-roles");
  }

  const blog = chunkById(chunks, "blog-summary");
  if (intents.has("latest-blog") && blog?.facts?.latest) {
    const latest = blog.facts.latest;
    return sourceAnswer(
      "Ibrahim's latest Blog post is \"" + latest.title + "\", published on "
        + formatDate(latest.date) + ". You can read it at " + latest.url + ".",
      "blog-summary"
    );
  }

  const publications = chunkById(chunks, "publications-summary");
  if (/\bhow many (?:publications|papers)|publication count\b/.test(text) && publications?.facts?.count !== undefined) {
    return sourceAnswer(
      "The site lists " + publications.facts.count + " publications in the Google Scholar snapshot dated "
        + formatDate(publications.facts.snapshotDate) + ".",
      "publications-summary"
    );
  }
  if (/\b(latest|newest) (?:listed )?(?:publication|paper)\b/.test(text) && publications?.facts?.latestTitle) {
    return sourceAnswer(
      "The newest listed publication is \"" + publications.facts.latestTitle
        + "\". The publication list comes from the Google Scholar snapshot dated "
        + formatDate(publications.facts.snapshotDate) + ".",
      "publications-summary"
    );
  }
  return null;
}

function cleanValue(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function freshChunk(id, kind, title, text, source, updatedAt, priority, facts = {}) {
  return {
    id,
    kind,
    title: cleanValue(title),
    text: cleanValue(text).slice(0, 7000),
    source,
    updatedAt: String(updatedAt || ""),
    priority,
    keywords: [],
    questions: [],
    audience: [],
    facts
  };
}

function slugify(value) {
  return normalizeText(value).replace(/\s+/g, "-");
}

function joinItems(items, formatter) {
  return Array.isArray(items) ? items.map(formatter).join(" ") : "";
}

export function freshContentToChunks(feed) {
  if (!feed || feed.schema_version !== 2) return [];
  const chunks = [];
  const profile = feed.profile || {};
  const profileUpdated = feed.source_freshness?.profile || profile.last_verified || "";
  const identity = profile.identity || {};
  const bio = profile.bio || {};

  if (identity.full_name && bio.short) {
    chunks.push(freshChunk(
      "profile-about",
      "profile",
      "About Muhammad Ibrahim Khan",
      identity.full_name + " publishes as " + (identity.display_name || identity.full_name)
        + ". " + (profile.headline || "") + ". " + (bio.short || "") + " " + (bio.long || ""),
      "/index.html#about",
      profileUpdated,
      10,
      {
        fullName: identity.full_name,
        displayName: identity.display_name,
        aliases: identity.aliases || [],
        headline: profile.headline
      }
    ));
  }

  if (Array.isArray(profile.current_roles)) {
    const roleText = joinItems(
      profile.current_roles,
      (role) => role.title + " at " + role.organisation + ", " + role.unit + ", "
        + role.dates + ". " + role.summary
    );
    chunks.push(freshChunk(
      "profile-roles",
      "profile",
      "Current roles and affiliations",
      roleText,
      "/work.html#roles",
      profileUpdated,
      10,
      { roles: profile.current_roles, affiliations: profile.affiliations || [] }
    ));
  }

  if (Array.isArray(profile.education)) {
    chunks.push(freshChunk(
      "profile-education",
      "profile",
      "Education",
      joinItems(
        profile.education,
        (item) => item.award + " in " + item.field + " at " + item.institution + ", "
          + item.dates + ". " + (item.thesis ? "Thesis: " + item.thesis + ". " : "")
          + (item.supervisor ? "Publicly listed supervisor: " + item.supervisor + ". " : "")
          + (item.project ? "Project: " + item.project + "." : "")
      ),
      "/index.html#about",
      profileUpdated,
      10,
      { education: profile.education }
    ));
  }

  (profile.research_themes || []).forEach((theme) => {
    chunks.push(freshChunk(
      "research-theme-" + slugify(theme.title),
      "research-theme",
      theme.title,
      theme.summary + " Methods and topics: " + theme.methods + ".",
      "/index.html#research",
      profileUpdated,
      9
    ));
  });

  const profileCollections = [
    ["profile-experience", "Professional experience", profile.experience, "/work.html#industry", "experience"],
    ["profile-teaching", "Teaching", profile.teaching, "/work.html#teaching", "teaching"],
    ["profile-recognition", "Professional recognition and awards", profile.professional_recognition, "/index.html#recognition", "recognition"]
  ];
  profileCollections.forEach(([id, title, items, source, factKey]) => {
    if (!Array.isArray(items)) return;
    chunks.push(freshChunk(
      id,
      "profile",
      title,
      JSON.stringify(items),
      source,
      profileUpdated,
      8,
      { [factKey]: items }
    ));
  });

  if (Array.isArray(profile.talks_and_service)) {
    chunks.push(freshChunk(
      "profile-service",
      "profile",
      "Talks and professional service",
      profile.talks_and_service.join(" "),
      "/work.html#teaching",
      profileUpdated,
      7,
      { service: profile.talks_and_service }
    ));
  }
  if (profile.skills) {
    chunks.push(freshChunk(
      "profile-skills",
      "profile",
      "Technical skills",
      JSON.stringify(profile.skills),
      "/index.html#skills",
      profileUpdated,
      8,
      { skills: profile.skills }
    ));
  }
  if (profile.contact?.email && profile.links) {
    chunks.push(freshChunk(
      "profile-contact",
      "profile",
      "Public contact and profile links",
      "Public email: " + profile.contact.email + ". CV: " + profile.links.cv
        + ". Google Scholar: " + profile.links.scholar + ". GitHub: "
        + profile.links.github + ". LinkedIn: " + profile.links.linkedin + ".",
      "/index.html#contact",
      profileUpdated,
      10,
      { email: profile.contact.email, links: profile.links }
    ));
  }

  const current = feed.current || {};
  const currentUpdated = feed.source_freshness?.current || current.updated || "";
  if (current.summary) {
    chunks.push(freshChunk(
      "current-summary",
      "current",
      current.update_title || "Current work",
      current.summary,
      "/live.html",
      currentUpdated,
      10,
      { updated: currentUpdated, streamIds: (current.streams || []).map((stream) => stream.id) }
    ));
  }
  (current.streams || []).forEach((stream) => {
    chunks.push(freshChunk(
      "current-" + stream.id,
      "current",
      stream.title,
      "Status: " + stream.status + ". Research question: " + stream.question
        + " Current focus: " + stream.current_focus + " Why it matters: "
        + stream.why_it_matters + " " + (stream.public_note || ""),
      "/live.html#" + stream.id,
      currentUpdated,
      10,
      { status: stream.status, links: stream.links || [] }
    ));
  });

  const projects = feed.projects || {};
  const projectItems = Array.isArray(projects.items) ? projects.items : [];
  if (projectItems.length) {
    chunks.push(freshChunk(
      "projects-summary",
      "project",
      "Selected public software projects",
      joinItems(projectItems, (item) => item.title + ": " + item.summary),
      "/work.html#public-projects",
      feed.source_freshness?.projects || projects.last_verified || "",
      9,
      { count: projectItems.length, githubProfile: projects.github_profile }
    ));
    projectItems.forEach((item) => {
      chunks.push(freshChunk(
        "project-" + item.id,
        "project",
        item.title,
        item.summary + " " + item.detail + " Methods: " + (item.methods || []).join(", ") + ".",
        item.repository,
        projects.last_verified || "",
        9,
        { repository: item.repository, language: item.language, methods: item.methods || [] }
      ));
    });
  }

  const publications = feed.publications || {};
  const publicationItems = Array.isArray(publications.publications)
    ? publications.publications
    : [];
  if (publicationItems.length) {
    chunks.push(freshChunk(
      "publications-summary",
      "publication",
      "Publication overview",
      "The verified Google Scholar snapshot contains " + publications.count + " publications. "
        + joinItems(publicationItems, (item) => item.title + " (" + item.year + ")."),
      "/papers.html",
      publications.generated_at || "",
      10,
      {
        count: publications.count,
        snapshotDate: publications.generated_at,
        latestTitle: publicationItems[0]?.title
      }
    ));
    publicationItems.forEach((item) => {
      chunks.push(freshChunk(
        "paper-" + slugify(item.title),
        "publication",
        item.title,
        "Authors: " + item.authors + ". Venue: " + item.venue + ". Year: " + item.year
          + ". Citation count in this snapshot: " + (item.citations ?? "not listed") + ".",
        item.link,
        publications.generated_at || "",
        9,
        { ...item, snapshotDate: publications.generated_at }
      ));
    });
  }

  (feed.reference?.explainers || []).forEach((item) => {
    chunks.push(freshChunk(
      "concept-" + item.id,
      "concept",
      item.title,
      item.plain_definition + " Why it is relevant here: " + item.relevance,
      item.source_url,
      feed.source_freshness?.rag || "",
      8
    ));
  });
  (feed.reference?.resources || []).forEach((item) => {
    chunks.push(freshChunk(
      item.id,
      "resource",
      item.title,
      item.text,
      item.source_url,
      feed.source_freshness?.rag || "",
      7
    ));
  });

  const posts = Array.isArray(feed.posts) ? feed.posts.slice(0, 20) : [];
  if (posts.length) {
    const latest = posts[0];
    chunks.push(freshChunk(
      "blog-summary",
      "blog",
      "Research Blog",
      "There are " + posts.length + " public Blog posts. The latest is "
        + latest.title + ", published " + latest.date + ". "
        + joinItems(posts, (post) => post.title + " (" + post.date + ")."),
      "/blog.html",
      latest.date,
      9,
      { count: posts.length, latest: { title: latest.title, date: latest.date, url: latest.url } }
    ));
  }
  posts.forEach((post) => {
    chunks.push(freshChunk(
      post.id || "blog-" + post.date + "-" + slugify(post.title),
      "blog",
      post.title || "Blog post",
      (post.description || "") + " " + (post.content || post.excerpt || ""),
      post.url,
      post.date || "",
      8,
      { date: post.date || "" }
    ));
  });

  return chunks;
}

export function mergeChunks(baseChunks, freshChunks) {
  const merged = new Map();
  (baseChunks || []).forEach((chunk) => merged.set(chunk.id, { ...chunk }));
  (freshChunks || []).forEach((fresh) => {
    const existing = merged.get(fresh.id) || {};
    merged.set(fresh.id, {
      ...existing,
      ...fresh,
      keywords: [...new Set([...(existing.keywords || []), ...(fresh.keywords || [])])],
      questions: [...new Set([...(existing.questions || []), ...(fresh.questions || [])])],
      audience: [...new Set([...(existing.audience || []), ...(fresh.audience || [])])],
      facts: { ...(existing.facts || {}), ...(fresh.facts || {}) },
      embedding: existing.embedding
    });
  });
  return [...merged.values()];
}

export function extractiveAnswer(chunks) {
  if (!Array.isArray(chunks) || chunks.length === 0) {
    return "I could not find that in Ibrahim's public website sources. Try asking about his research, publications, public projects, roles, education, skills, or current work.";
  }
  const primary = cleanValue(chunks[0].text);
  const sentences = primary.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [primary];
  let answer = sentences.slice(0, 4).join(" ").trim();
  if (answer.length > 650) answer = answer.slice(0, 647).trimEnd() + "...";
  return answer;
}
