// Optional enhancements for the standalone report. Tables and archive navigation work without JavaScript.
for (const input of document.querySelectorAll('input[type=search]')) {
  const label = input.parentElement;
  const rows = label.nextElementSibling.querySelectorAll('tbody tr');
  label.hidden = false;
  input.addEventListener('input', () => {
    const query = input.value.toLowerCase().trim();
    for (const row of rows) row.hidden = !row.textContent.toLowerCase().includes(query);
  });
}

const download = document.querySelector('#download');
if (download) {
  download.hidden = false;
  download.addEventListener('click', () => {
    const data = document.querySelector('#report-data').textContent;
    const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'vextab-' + download.dataset.commit + '.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}
