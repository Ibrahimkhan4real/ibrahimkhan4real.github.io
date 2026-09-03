import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import {
  extname,
  join,
  relative,
  resolve,
  sep,
} from "node:path";

const siteDirectory = resolve(process.argv[2] || "_site");
const productionOrigin = "https://ibrahimkhan4real.github.io";
const checkExternalLinks = process.env.CHECK_EXTERNAL_LINKS === "1";
const restrictedStatuses = new Set([401, 403, 429, 999]);

if (!existsSync(siteDirectory)) {
  console.error("Built site not found at " + siteDirectory + ". Run the Jekyll build first.");
  process.exit(1);
}

function collectFiles(directory, extension) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectFiles(path, extension);
    return entry.isFile() && extname(entry.name) === extension ? [path] : [];
  });
}

function decodeHtmlAttribute(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function webPathForHtml(file) {
  const local = relative(siteDirectory, file).split(sep).join("/");
  if (local === "index.html") return "/";
  if (local.endsWith("/index.html")) return "/" + local.slice(0, -"index.html".length);
  return "/" + local;
}

function safeSitePath(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const withoutLeadingSlash = decoded.replace(/^\/+/, "");
  const candidate = resolve(siteDirectory, withoutLeadingSlash);
  if (candidate !== siteDirectory && !candidate.startsWith(siteDirectory + sep)) {
    return null;
  }

  const candidates = [];
  if (decoded.endsWith("/")) {
    candidates.push(resolve(candidate, "index.html"));
  } else {
    candidates.push(candidate);
    if (!extname(candidate)) {
      candidates.push(candidate + ".html");
      candidates.push(resolve(candidate, "index.html"));
    }
  }

  return candidates.find((path) => existsSync(path) && statSync(path).isFile()) || null;
}

const idCache = new Map();

function idsInHtml(path) {
  if (idCache.has(path)) return idCache.get(path);
  const html = readFileSync(path, "utf8");
  const ids = new Set();
  const pattern = /\b(?:id|name)\s*=\s*(["'])(.*?)\1/gi;
  for (const match of html.matchAll(pattern)) {
    ids.add(decodeHtmlAttribute(match[2]));
  }
  idCache.set(path, ids);
  return ids;
}

const htmlFiles = collectFiles(siteDirectory, ".html");
const failures = [];
const externalUrls = new Set();
let checkedReferences = 0;
let checkedAnchors = 0;

for (const file of htmlFiles) {
  const html = readFileSync(file, "utf8");
  const sourcePath = webPathForHtml(file);
  const sourceUrl = new URL(sourcePath, productionOrigin);
  const attributePattern = /\b(?:href|src)\s*=\s*(["'])(.*?)\1/gi;

  for (const match of html.matchAll(attributePattern)) {
    const raw = decodeHtmlAttribute(match[2].trim());
    if (!raw || raw.startsWith("data:")) continue;
    checkedReferences += 1;

    if (raw.startsWith("mailto:")) {
      const address = raw.slice("mailto:".length).split("?")[0];
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) {
        failures.push(sourcePath + " contains malformed email link: " + raw);
      }
      continue;
    }

    if (raw.startsWith("tel:")) {
      failures.push(sourcePath + " exposes a telephone link; use the public email instead");
      continue;
    }

    let target;
    try {
      target = new URL(raw, sourceUrl);
    } catch {
      failures.push(sourcePath + " contains malformed URL: " + raw);
      continue;
    }

    if (!["http:", "https:"].includes(target.protocol)) {
      failures.push(sourcePath + " contains unsupported URL scheme: " + raw);
      continue;
    }

    if (target.origin !== productionOrigin) {
      if (target.protocol !== "https:") {
        failures.push(sourcePath + " contains insecure external link: " + raw);
      } else {
        target.hash = "";
        externalUrls.add(target.href);
      }
      continue;
    }

    const targetFile = safeSitePath(target.pathname);
    if (!targetFile) {
      failures.push(sourcePath + " points to missing internal target: " + raw);
      continue;
    }

    if (target.hash && extname(targetFile) === ".html") {
      const fragment = decodeURIComponent(target.hash.slice(1));
      checkedAnchors += 1;
      if (fragment && !idsInHtml(targetFile).has(fragment)) {
        failures.push(sourcePath + " points to missing fragment " + target.hash + " in " + target.pathname);
      }
    }
  }
}

async function requestExternal(url, method) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    return await fetch(url, {
      method,
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "IbrahimKhan-site-link-check/1.0 (+https://ibrahimkhan4real.github.io)",
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function checkExternal(url) {
  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      let response = await requestExternal(url, "HEAD");
      if (response.status === 405) {
        response = await requestExternal(url, "GET");
      }
      if (response.ok || (response.status >= 300 && response.status < 400)) {
        return { status: "ok", code: response.status };
      }
      if (restrictedStatuses.has(response.status)) {
        return { status: "restricted", code: response.status };
      }
      lastError = new Error("HTTP " + response.status);
    } catch (error) {
      lastError = error;
    }
  }
  return {
    status: "failed",
    message: lastError instanceof Error ? lastError.message : String(lastError),
  };
}

if (checkExternalLinks) {
  const urls = [...externalUrls].sort();
  const concurrency = 4;
  let cursor = 0;
  const warnings = [];

  async function worker() {
    while (cursor < urls.length) {
      const index = cursor;
      cursor += 1;
      const url = urls[index];
      const result = await checkExternal(url);
      if (result.status === "failed") {
        failures.push("External link failed: " + url + " (" + result.message + ")");
      } else if (result.status === "restricted") {
        warnings.push("External link is reachable but access-restricted: " + url + " (HTTP " + result.code + ")");
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, worker));
  for (const warning of warnings) console.warn("WARNING: " + warning);
  console.log("Checked " + urls.length + " unique external HTTPS links.");
} else {
  console.log(
    "Validated " + externalUrls.size +
      " external URLs structurally. Set CHECK_EXTERNAL_LINKS=1 to request them."
  );
}

if (failures.length) {
  console.error("\nLink integrity failures:");
  for (const failure of failures) console.error("- " + failure);
  process.exit(1);
}

console.log(
  "Link integrity passed for " + htmlFiles.length + " HTML files, " +
    checkedReferences + " references, and " + checkedAnchors + " fragments."
);
