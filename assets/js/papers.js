(() => {
  const tools = document.querySelector('.publications-tools');
  const input = document.getElementById('publication-filter');
  const clearButton = document.getElementById('publication-filter-clear');
  const status = document.getElementById('publication-filter-status');
  const emptyState = document.getElementById('publication-empty');
  const publications = [...document.querySelectorAll('[data-publication]')];

  if (!tools || !input || !clearButton || !status || !emptyState || !publications.length) {
    return;
  }

  tools.hidden = false;

  const normalize = (value) => value.trim().toLocaleLowerCase('en-GB');

  const update = () => {
    const query = normalize(input.value);
    let visibleCount = 0;

    publications.forEach((publication) => {
      const searchable = publication.dataset.search || '';
      const matches = !query || searchable.includes(query);
      publication.hidden = !matches;
      if (matches) visibleCount += 1;
    });

    const noun = visibleCount === 1 ? 'publication' : 'publications';
    status.textContent = query
      ? `${visibleCount} ${noun} match “${input.value.trim()}”.`
      : `${visibleCount} ${noun} shown.`;
    emptyState.hidden = visibleCount !== 0;
    clearButton.disabled = !query;
  };

  input.addEventListener('input', update);
  clearButton.addEventListener('click', () => {
    input.value = '';
    update();
    input.focus();
  });

  update();
})();
