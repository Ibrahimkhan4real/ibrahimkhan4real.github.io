const PAPERS_PATH = 'site_data/papers.json';
const papersListNode = document.getElementById('papers-list');
const metaNode = document.getElementById('papers-meta');
const errorNode = document.getElementById('papers-error');

if (!papersListNode) {
  throw new Error('Missing #papers-list container');
}

const formatYear = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

const normalizePapers = (payload) => {
  if (payload && Array.isArray(payload.publications)) {
    return payload.publications;
  }
  if (payload && Array.isArray(payload.papers)) {
    return payload.papers;
  }
  return [];
};

const citationText = (paper) => {
  if (typeof paper.cited_by === 'number') {
    return ` · cited ${paper.cited_by}`;
  }
  if (typeof paper.citations === 'string' && paper.citations.trim()) {
    return ` · cited ${paper.citations.trim()}`;
  }
  return '';
};

const renderPaper = (paper) => {
  const item = document.createElement('li');

  const title = document.createElement('h3');
  if (paper.link) {
    const link = document.createElement('a');
    link.href = paper.link;
    link.textContent = paper.title || 'Untitled';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    title.appendChild(link);
  } else {
    title.textContent = paper.title || 'Untitled';
  }
  item.appendChild(title);

  if (paper.authors) {
    const authors = document.createElement('p');
    authors.className = 'paper-authors';
    authors.textContent = paper.authors;
    item.appendChild(authors);
  }

  const meta = document.createElement('p');
  meta.className = 'paper-meta';
  const venue = paper.venue ? paper.venue : 'Unpublished';
  const year = formatYear(paper.year);
  meta.textContent = `${venue}${year ? ` · ${year}` : ''}${citationText(paper)}`;
  item.appendChild(meta);

  return item;
};

const sortPapers = (papers = []) => {
  return [...papers].sort((a, b) => (formatYear(b.year) || 0) - (formatYear(a.year) || 0));
};

const formatTimestamp = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const updateMeta = (payload) => {
  if (!metaNode) return;
  const formatted = formatTimestamp(payload.generated_at || payload.last_updated);
  const publicationsCount = Array.isArray(payload.publications)
    ? payload.publications.length
    : Array.isArray(payload.papers)
      ? payload.papers.length
      : 0;
  const count = typeof payload.count === 'number' ? payload.count : publicationsCount;
  if (formatted) {
    metaNode.textContent = `Last synced ${formatted} (${count} publications)`;
  } else {
    metaNode.textContent = 'Synced recently from Google Scholar.';
  }
};

const showError = (message) => {
  if (errorNode) {
    errorNode.hidden = false;
    errorNode.textContent = message;
  }
};

fetch(`${PAPERS_PATH}?cachebust=${Date.now()}`)
  .then((response) => {
    if (!response.ok) {
      throw new Error(`Failed to load papers (${response.status})`);
    }
    return response.json();
  })
  .then((payload) => {
    const papers = normalizePapers(payload);
    if (!papers.length) {
      throw new Error('No publications returned from data source');
    }
    const fragment = document.createDocumentFragment();
    sortPapers(papers).forEach((paper) => {
      fragment.appendChild(renderPaper(paper));
    });
    papersListNode.innerHTML = '';
    papersListNode.appendChild(fragment);
    updateMeta(payload);
  })
  .catch((error) => {
    console.error(error);
    showError('Papers will appear here once the Google Scholar sync completes.');
    if (metaNode) {
      metaNode.textContent = 'Sync pending…';
    }
  });
