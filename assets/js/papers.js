const PAPERS_PATH = '/assets/data/papers.json';
const papersListNode = document.getElementById('papers-list');
const metaNode = document.getElementById('papers-meta');
const errorNode = document.getElementById('papers-error');

const renderPaper = (paper) => {
  const article = document.createElement('article');
  article.className = 'status-card paper-card';

  const title = document.createElement('h3');
  const link = document.createElement('a');
  link.href = paper.link;
  link.textContent = paper.title;
  link.target = '_blank';
  link.rel = 'noopener';
  title.appendChild(link);
  article.appendChild(title);

  if (paper.authors) {
    const authors = document.createElement('p');
    authors.className = 'paper-authors';
    authors.textContent = paper.authors;
    article.appendChild(authors);
  }

  const meta = document.createElement('p');
  meta.className = 'paper-meta';
  const venue = paper.venue ? `${paper.venue}` : 'Unpublished';
  const year = paper.year ? ` · ${paper.year}` : '';
  const citations = typeof paper.cited_by === 'number' ? ` · cited ${paper.cited_by}` : '';
  meta.textContent = `${venue}${year}${citations}`;
  article.appendChild(meta);

  return article;
};

const sortPapers = (papers = []) => {
  return [...papers].sort((a, b) => (b.year || 0) - (a.year || 0));
};

const renderPapers = (payload) => {
  if (!payload || !Array.isArray(payload.papers)) {
    throw new Error('Invalid payload');
  }

  const papers = sortPapers(payload.papers);
  const fragment = document.createDocumentFragment();
  papers.forEach((paper) => {
    fragment.appendChild(renderPaper(paper));
  });

  papersListNode.innerHTML = '';
  papersListNode.appendChild(fragment);

  if (payload.last_updated) {
    const updated = new Date(payload.last_updated);
    if (!Number.isNaN(updated.getTime())) {
      const formatted = updated.toLocaleString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      metaNode.textContent = `Last synced ${formatted}`;
    }
  }
};

const showError = (message) => {
  if (!errorNode) return;
  errorNode.hidden = false;
  errorNode.textContent = message;
};

fetch(PAPERS_PATH)
  .then((response) => {
    if (!response.ok) {
      throw new Error(`Failed to load papers (${response.status})`);
    }
    return response.json();
  })
  .then((payload) => {
    renderPapers(payload);
  })
  .catch((error) => {
    console.error(error);
    showError('Papers will appear here once Google Scholar sync completes.');
  });
