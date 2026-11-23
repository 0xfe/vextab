// Offline report navigation, list paging, search and full-size score comparisons.
(() => {
  const $ = (id) => document.getElementById(id);
  const data = JSON.parse($('report-data').textContent);
  const make = (tag, text) => {
    const e = document.createElement(tag);
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const link = (url, label) => {
    const e = make('a', label);
    e.href = url;
    return e;
  };
  const query = (v) => v.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const matches = (words, value) => words.every((w) => value.toLowerCase().includes(w));
  const figures = new Map(data.figures.map((f) => [f.id, f]));
  const dialog = $('lightbox');
  let invoking;
  function openFigure(id) {
    const figure = figures.get(id);
    if (!figure) return;
    if (!dialog.open) invoking = document.activeElement;
    $('figure-title').textContent = figure.name;
    $('figure-group').textContent = figure.module + ' · ' + figure.status;
    $('figure-desc').textContent = figure.description ?? figure.name;
    $('plates').replaceChildren();
    for (const [path, label] of [
      [figure.left, figure.leftLabel],
      [figure.right, figure.rightLabel],
    ]) {
      if (!path) continue;
      const frame = make('figure'),
        image = make('img'),
        full = link(path, '');
      image.src = path;
      image.alt = label + ' — ' + figure.name;
      full.target = '_blank';
      full.rel = 'noopener';
      full.append(image);
      frame.append(make('figcaption', label), full);
      $('plates').append(frame);
    }
    $('plate-source').replaceChildren(...(figure.source ? [link(figure.source, 'Evidence and source')] : []));
    if (!dialog.open) dialog.showModal();
  }
  function sync() {
    const hash = location.hash.slice(1);
    if (hash.startsWith('plate-') && figures.has(hash.slice(6))) openFigure(hash.slice(6));
    else if (dialog.open) dialog.close();
  }
  document.addEventListener('click', (event) => {
    const releaseLink = event.target.closest('[data-commits]');
    if (releaseLink) {
      $('commit-query').value = '';
      $('commit-release').value = releaseLink.dataset.commits;
      $('commit-release').dispatchEvent(new Event('change'));
    }
    // A release bookmark must still lead somewhere after a search has hidden its chapter.
    if (event.target.closest('a[href^="#release-"]') && $('search').value) {
      $('search').value = '';
      $('search').dispatchEvent(new Event('input'));
    }
    const a = event.target.closest('[data-plate]');
    if (!a) return;
    event.preventDefault();
    history.pushState({ plate: true }, '', a.hash);
    sync();
  });
  const close = () => {
    if (history.state?.plate) history.back();
    else {
      history.replaceState(null, '', '#visual-index');
      sync();
    }
  };
  $('close').onclick = close;
  dialog.oncancel = (e) => {
    e.preventDefault();
    close();
  };
  dialog.onclose = () => invoking?.focus();
  window.addEventListener('hashchange', sync);
  $('search').oninput = () => {
    const words = query($('search').value);
    let count = 0;
    for (const item of document.querySelectorAll('.change')) {
      item.hidden = !matches(words, item.dataset.search);
      if (!item.hidden) count++;
    }
    for (const el of document.querySelectorAll('.chapter,.category'))
      el.hidden = !el.querySelector('.change:not([hidden])');
    $('matches').textContent = words.length ? count + ' matching changes' : '';
  };
  function paged(items, input, list, more, render, search, extra = () => true, status) {
    let limit = 24;
    const refresh = () => {
      const words = query($(input).value),
        filtered = items.filter((x) => extra(x) && matches(words, search(x)));
      const visible = filtered.slice(0, limit);
      $(list).replaceChildren(...visible.map(render));
      if (!visible.length) $(list).append(make('p', 'No matches.'));
      $(more).hidden = limit >= filtered.length;
      if (status) $(status).textContent = visible.length + ' of ' + filtered.length + ' exhibits';
    };
    const reset = () => {
      limit = 24;
      refresh();
    };
    $(input).addEventListener('input', reset);
    $(more).onclick = () => {
      limit += 48;
      refresh();
    };
    refresh();
    return reset;
  }
  const resetFigures = paged(
    data.figures,
    'figure-query',
    'figures',
    'more',
    (f) => {
      const a = link('#plate-' + f.id, '');
      a.className = 'tile';
      a.dataset.plate = f.id;
      const img = make('img');
      img.src = f.right;
      img.alt = '';
      img.loading = 'lazy';
      const info = make('div');
      info.append(make('small', f.module + ' · ' + f.status), make('strong', f.name));
      a.append(img, info);
      return a;
    },
    (f) => [f.name, f.module, f.description, f.status].join(' '),
    (f) => $('figure-type').value === 'All exhibits' || f.status === $('figure-type').value,
    'figure-count'
  );
  $('figure-type').onchange = resetFigures;
  const detail = (name, meta) => {
    const row = make('details'),
      summary = make('summary');
    row.className = 'row';
    summary.append(make('strong', name), make('span', ' · ' + meta));
    row.append(summary);
    return row;
  };
  paged(
    data.api,
    'api-query',
    'api-list',
    'api-more',
    (item) => {
      const row = detail(item.name, item.change);
      for (const [label, value] of [
        ['4.0.0', item.before],
        ['Current', item.after],
      ])
        if (value) row.append(make('small', label), make('pre', value));
      return row;
    },
    (item) => [item.name, item.change, item.before, item.after].join(' ')
  );
  const resetCommits = paged(
    data.commits,
    'commit-query',
    'commit-list',
    'commit-more',
    (c) => {
      const row = detail(c.subject, c.release + ' · ' + c.date + ' · ' + c.hash.slice(0, 8));
      row.append(
        make('p', c.body || (c.merge ? 'This merge includes ' : 'This commit touches ') + c.paths.length + ' paths.')
      );
      row.append(link(data.repo + '/commit/' + c.hash, 'View commit and diff'));
      const paths = make('div');
      paths.className = 'paths';
      // Use the commit diff for deleted and renamed paths too.
      for (const path of c.paths) {
        paths.append(make('div', path));
      }
      row.append(paths);
      return row;
    },
    (c) => [c.hash, c.release, c.date, c.subject, c.body, ...c.paths].join(' '),
    (c) => !$('commit-release').value || c.release === $('commit-release').value
  );
  $('commit-release').onchange = resetCommits;
  const menu = $('menu');
  if (matchMedia('(max-width:800px)').matches) menu.open = false;
  const nav = [...menu.querySelectorAll('a')];
  const observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries)
        if (e.isIntersecting) for (const a of nav) a.classList.toggle('active', a.hash === '#' + e.target.id);
    },
    { rootMargin: '-10% 0px -68% 0px' }
  );
  for (const a of nav) {
    const el = $(a.hash.slice(1));
    if (el) observer.observe(el);
  }
  sync();
})();
