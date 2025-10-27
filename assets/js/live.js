const updateClocks = () => {
  const clockNodes = document.querySelectorAll('[data-timezone]');
  const now = new Date();

  clockNodes.forEach((node) => {
    const tz = node.getAttribute('data-timezone');
    try {
      const formatter = new Intl.DateTimeFormat('en-GB', {
        weekday: 'short',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: tz,
      });
      node.textContent = formatter.format(now);
    } catch (error) {
      node.textContent = 'timezone unavailable';
    }
  });
};

updateClocks();
setInterval(updateClocks, 60 * 1000);
