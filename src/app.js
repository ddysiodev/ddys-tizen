(function (global) {
  'use strict';

  var DEFAULT_SETTINGS = {
    apiBase: 'https://ddys.io/api/v1',
    apiKey: '',
    apiKeyMode: 'query',
    apiKeyQuery: 'api_key',
    pageSize: 24,
    cacheTtlSeconds: 600,
    directOnly: false,
    includeExternal: true
  };

  var KEY_CODES = {
    enter: 13,
    left: 37,
    up: 38,
    right: 39,
    down: 40,
    back: 10009,
    escape: 27,
    play: 415,
    pause: 19,
    stop: 413,
    rewind: 412,
    forward: 417,
    playPause: 10252,
    red: 403,
    green: 404,
    yellow: 405,
    blue: 406
  };

  var store = global.DDYSStore.create('ddys-tizen');
  var settings = global.DDYSClient.normalizeSettings(merge(DEFAULT_SETTINGS, safeArrayOrObject(store.read('settings', DEFAULT_SETTINGS), DEFAULT_SETTINGS)));
  var favorites = safeArrayOrObject(store.read('favorites', []), []);
  var history = safeArrayOrObject(store.read('history', []), []);
  var screen = null;
  var statusLine = null;
  var toast = null;
  var focus = null;
  var player = null;
  var client = null;
  var activeView = 'home';
  var lastList = [];
  var lastBackAt = 0;

  document.addEventListener('DOMContentLoaded', boot);

  function boot() {
    screen = document.getElementById('screen');
    statusLine = document.getElementById('statusLine');
    toast = document.getElementById('toast');
    focus = global.DDYSFocus.create({ selector: '[data-focusable]' });
    player = global.DDYSPlayer.create({ onStop: recordPlayback });
    client = global.DDYSClient.create(settings);
    registerRemoteKeys();
    bindEvents();
    setStatus('Tizen TV app is ready');
    renderHome();
  }

  function registerRemoteKeys() {
    global.DDYSFocus.registerTvKeys([
      'Return',
      'Exit',
      'MediaPlayPause',
      'MediaPlay',
      'MediaPause',
      'MediaStop',
      'MediaFastForward',
      'MediaRewind',
      'ColorF0Red',
      'ColorF1Green',
      'ColorF2Yellow',
      'ColorF3Blue',
      'Info'
    ]);
  }

  function bindEvents() {
    document.getElementById('mainNav').addEventListener('click', function (event) {
      var button = closest(event.target, '[data-view]');
      if (!button) return;
      openView(button.getAttribute('data-view'));
    });
    document.addEventListener('keydown', handleKey);
    document.addEventListener('click', handleAction);
  }

  function handleKey(event) {
    var code = event.keyCode || event.which;
    if (player && player.isActive()) {
      if (code === KEY_CODES.back || code === KEY_CODES.escape || code === KEY_CODES.stop) {
        event.preventDefault();
        player.stop();
        focus.refresh();
        return;
      }
      if (code === KEY_CODES.left || code === KEY_CODES.rewind) {
        event.preventDefault();
        player.seek(-15);
        return;
      }
      if (code === KEY_CODES.right || code === KEY_CODES.forward) {
        event.preventDefault();
        player.seek(30);
        return;
      }
      if (code === KEY_CODES.enter || code === KEY_CODES.playPause || code === KEY_CODES.play || code === KEY_CODES.pause) {
        event.preventDefault();
        player.toggle();
        return;
      }
    }

    if (code === KEY_CODES.left) { event.preventDefault(); focus.move('left'); return; }
    if (code === KEY_CODES.right) { event.preventDefault(); focus.move('right'); return; }
    if (code === KEY_CODES.up) { event.preventDefault(); focus.move('up'); return; }
    if (code === KEY_CODES.down) { event.preventDefault(); focus.move('down'); return; }
    if (code === KEY_CODES.enter) { event.preventDefault(); focus.click(); return; }
    if (code === KEY_CODES.back || code === KEY_CODES.escape) {
      event.preventDefault();
      handleBack();
      return;
    }
    if (code === KEY_CODES.red) openView('search');
    if (code === KEY_CODES.green) openView('favorites');
    if (code === KEY_CODES.yellow) openView('history');
    if (code === KEY_CODES.blue) openView('settings');
  }

  function handleBack() {
    var now = Date.now();
    if (activeView !== 'home') {
      openView('home');
      return;
    }
    if (now - lastBackAt < 2000) {
      try {
        if (global.tizen && global.tizen.application) global.tizen.application.getCurrentApplication().exit();
      } catch (error) {}
      return;
    }
    lastBackAt = now;
    toastText('Press Back again to exit');
  }

  function handleAction(event) {
    var action = closest(event.target, '[data-action]');
    var playerAction = closest(event.target, '[data-player-action]');
    if (playerAction) {
      runPlayerAction(playerAction.getAttribute('data-player-action'));
      return;
    }
    if (!action) return;
    runAction(action.getAttribute('data-action'), action);
  }

  function runPlayerAction(action) {
    if (action === 'toggle') player.toggle();
    if (action === 'seek-back') player.seek(-15);
    if (action === 'seek-forward') player.seek(30);
    if (action === 'stop') {
      player.stop();
      focus.refresh();
    }
  }

  function runAction(action, node) {
    var slug = node.getAttribute('data-slug');
    var value = node.getAttribute('data-value');
    if (action === 'category') renderCategory(value);
    if (action === 'detail') renderDetail(slug);
    if (action === 'play') playResource(Number(value));
    if (action === 'favorite') toggleFavorite(slug);
    if (action === 'save-settings') saveSettings();
    if (action === 'clear-cache') clearCache();
    if (action === 'clear-history') clearHistory();
    if (action === 'run-search') runSearch();
    if (action === 'run-check') renderCheck();
    if (action === 'settings') openView('settings');
  }

  function openView(view) {
    activeView = view;
    updateNav(view);
    if (view === 'home') renderHome();
    if (view === 'search') renderSearch();
    if (view === 'favorites') renderFavorites();
    if (view === 'history') renderHistory();
    if (view === 'settings') renderSettings();
    if (view === 'check') renderCheck();
  }

  function renderHome() {
    activeView = 'home';
    updateNav('home');
    setLoading('Loading home');
    Promise.all([client.latest(settings.pageSize), client.hot(settings.pageSize)]).then(function (results) {
      lastList = results[0].concat(results[1]);
      screen.innerHTML = [
        heroHtml(),
        categoryHtml(client.categories()),
        rowHtml('Latest', results[0]),
        rowHtml('Hot', results[1])
      ].join('');
      focus.refresh();
      setStatus('Home updated');
    }).catch(showError);
  }

  function renderCategory(type) {
    var category = findCategory(type);
    var promise;
    setLoading('Loading ' + (category.title || type));
    promise = type === 'latest' ? client.latest(settings.pageSize) :
      type === 'hot' ? client.hot(settings.pageSize) :
      client.movies(type, 1, settings.pageSize);
    promise.then(function (items) {
      lastList = items;
      screen.innerHTML = '<section class="view-head"><h2>' + escapeHtml(category.title || type) + '</h2><p>Use the remote arrows to choose a title, then press Enter for details.</p></section>' + gridHtml(items);
      focus.refresh();
      setStatus((category.title || type) + ' updated');
    }).catch(showError);
  }

  function renderSearch() {
    activeView = 'search';
    updateNav('search');
    screen.innerHTML = [
      '<section class="view-head"><h2>Search</h2><p>Use the TV input method to enter a title or keyword.</p></section>',
      '<section class="search-bar">',
      '<input data-focusable id="searchInput" type="search" value="" placeholder="Title or keyword">',
      '<button data-focusable data-action="run-search">Search</button>',
      '</section>',
      '<section id="searchResult" class="movie-grid"></section>'
    ].join('');
    focus.refresh(document.getElementById('searchInput'));
  }

  function runSearch() {
    var input = document.getElementById('searchInput');
    var result = document.getElementById('searchResult');
    var query = input ? input.value.replace(/^\s+|\s+$/g, '') : '';
    if (!query) {
      toastText('Enter a search keyword');
      return;
    }
    result.innerHTML = '<div class="empty">Searching...</div>';
    client.search(query, 1, settings.pageSize).then(function (items) {
      lastList = items;
      result.outerHTML = gridHtml(items);
      focus.refresh();
      setStatus('Search complete: ' + query);
    }).catch(showError);
  }

  function renderDetail(slug) {
    if (!slug) return;
    setLoading('Loading details');
    client.movieWithResources(slug).then(function (data) {
      var movie = data.movie;
      var resources = data.resources;
      var fav = isFavorite(movie.slug || movie.id);
      lastList = [movie];
      global.__ddysCurrentDetail = { movie: movie, resources: resources };
      screen.innerHTML = [
        '<section class="detail">',
        '<div class="detail-poster">' + posterHtml(movie) + '</div>',
        '<div class="detail-main">',
        '<p class="eyebrow">' + escapeHtml([movie.year, movie.type, movie.region, movie.rating].filter(Boolean).join(' / ')) + '</p>',
        '<h2>' + escapeHtml(movie.title || slug) + '</h2>',
        '<p class="summary">' + escapeHtml(movie.summary || movie.subtitle || 'No description available.') + '</p>',
        '<div class="detail-actions">',
        '<button data-focusable data-action="favorite" data-slug="' + escapeAttr(movie.slug || movie.id) + '">' + (fav ? 'Remove Favorite' : 'Add Favorite') + '</button>',
        '</div>',
        '<h3>Playback Resources</h3>',
        resourceListHtml(resources),
        '</div>',
        '</section>'
      ].join('');
      focus.refresh();
      setStatus('Details opened');
    }).catch(showError);
  }

  function playResource(index) {
    var detail = global.__ddysCurrentDetail;
    var resource;
    if (!detail || !detail.resources) return;
    resource = detail.resources[index];
    if (!resource) return;
    if (!resource.playable) {
      toastText('This resource is not directly playable on TV.');
      return;
    }
    player.open(resource, detail.movie);
  }

  function renderFavorites() {
    activeView = 'favorites';
    updateNav('favorites');
    screen.innerHTML = '<section class="view-head"><h2>Favorites</h2><p>Favorites are stored locally on this TV.</p></section>' + gridHtml(favorites);
    focus.refresh();
  }

  function renderHistory() {
    activeView = 'history';
    updateNav('history');
    screen.innerHTML = [
      '<section class="view-head"><h2>Watch History</h2><p>Recently played movies and resources.</p><button data-focusable data-action="clear-history">Clear History</button></section>',
      historyHtml()
    ].join('');
    focus.refresh();
  }

  function renderSettings() {
    activeView = 'settings';
    updateNav('settings');
    screen.innerHTML = [
      '<section class="settings">',
      '<div class="view-head"><h2>Settings</h2><p>Configure DDYS API access and resource display behavior.</p></div>',
      formRow('API Base', 'apiBase', settings.apiBase, 'text'),
      formRow('API Key', 'apiKey', settings.apiKey, 'password'),
      selectRow('API Key Mode', 'apiKeyMode', settings.apiKeyMode, [['query', 'Query'], ['bearer', 'Bearer'], ['header', 'Header']]),
      formRow('API Key Query', 'apiKeyQuery', settings.apiKeyQuery, 'text'),
      formRow('Page Size', 'pageSize', settings.pageSize, 'number'),
      formRow('Cache Seconds', 'cacheTtlSeconds', settings.cacheTtlSeconds, 'number'),
      toggleRow('Direct playable resources only', 'directOnly', settings.directOnly),
      toggleRow('Show external resources', 'includeExternal', settings.includeExternal),
      '<div class="form-actions"><button data-focusable data-action="save-settings">Save Settings</button><button data-focusable data-action="clear-cache">Clear Cache</button></div>',
      '</section>'
    ].join('');
    focus.refresh();
  }

  function renderCheck() {
    var checks;
    activeView = 'check';
    updateNav('check');
    checks = [
      ['Tizen API', !!global.tizen],
      ['Remote key API', !!(global.tizen && global.tizen.tvinputdevice)],
      ['Samsung AVPlay', global.DDYSPlayer.hasAvplay()],
      ['Browser video fallback', player.selfCheck().fallbackVideo],
      ['Local storage', !!store.write('__check', { ok: true })],
      ['API Base', settings.apiBase]
    ];
    screen.innerHTML = [
      '<section class="view-head"><h2>Self Check</h2><p>Check the TV runtime, player, storage, and API settings.</p><button data-focusable data-action="run-check">Run Again</button></section>',
      '<section class="check-list">',
      checks.map(function (item) {
        return '<div class="check-item"><span>' + escapeHtml(item[0]) + '</span><strong class="' + (item[1] ? 'ok' : 'warn') + '">' + escapeHtml(item[1] === true ? 'OK' : item[1] || 'Unavailable') + '</strong></div>';
      }).join(''),
      '</section>'
    ].join('');
    focus.refresh();
    pingApi();
  }

  function pingApi() {
    client.latest(1).then(function () {
      setStatus('API connection OK');
    }).catch(function (error) {
      setStatus('API connection failed: ' + (error && error.message ? error.message : error));
    });
  }

  function saveSettings() {
    settings = {
      apiBase: valueOf('apiBase') || DEFAULT_SETTINGS.apiBase,
      apiKey: valueOf('apiKey'),
      apiKeyMode: valueOf('apiKeyMode') || 'query',
      apiKeyQuery: valueOf('apiKeyQuery') || 'api_key',
      pageSize: readNumber(valueOf('pageSize'), 24),
      cacheTtlSeconds: readNumber(valueOf('cacheTtlSeconds'), 600),
      directOnly: checkedOf('directOnly'),
      includeExternal: checkedOf('includeExternal')
    };
    settings = global.DDYSClient.normalizeSettings(settings);
    store.write('settings', settings);
    client = global.DDYSClient.create(settings);
    toastText('Settings saved');
    renderHome();
  }

  function clearCache() {
    client.clearCache();
    toastText('Cache cleared');
  }

  function clearHistory() {
    history = [];
    store.write('history', history);
    renderHistory();
  }

  function toggleFavorite(slug) {
    var detail = global.__ddysCurrentDetail;
    var movie = detail && detail.movie;
    if (!movie) return;
    if (isFavorite(slug)) favorites = favorites.filter(function (item) { return (item.slug || item.id) !== slug; });
    else favorites.unshift(movie);
    favorites = uniqueMovies(favorites).slice(0, 200);
    store.write('favorites', favorites);
    renderDetail(slug);
  }

  function recordPlayback(current) {
    var movie = current.movie || {};
    var resource = current.resource || {};
    if (!movie.slug && !movie.id) return;
    history.unshift({
      id: movie.id,
      slug: movie.slug || movie.id,
      title: movie.title,
      poster: movie.poster,
      year: movie.year,
      type: movie.type,
      resourceTitle: resource.title,
      resourceUrl: resource.url,
      playedAt: new Date().toISOString()
    });
    history = uniqueMovies(history).slice(0, 100);
    store.write('history', history);
  }

  function heroHtml() {
    return '<section class="hero"><div><p class="eyebrow">Samsung Tizen TV</p><h2>Browse DDYS on your TV</h2><p>Use arrow keys to move, Enter to open, Back to return home, and color keys for Search / Favorites / History / Settings.</p></div></section>';
  }

  function categoryHtml(categories) {
    return '<section class="category-strip">' + categories.map(function (category) {
      return '<button data-focusable data-action="category" data-value="' + escapeAttr(category.type || category.id) + '">' + escapeHtml(category.title) + '</button>';
    }).join('') + '</section>';
  }

  function rowHtml(title, items) {
    return '<section class="movie-row"><h3>' + escapeHtml(title) + '</h3><div class="poster-row">' + items.map(movieCardHtml).join('') + '</div></section>';
  }

  function gridHtml(items) {
    if (!items || !items.length) return '<section class="empty">No content.</section>';
    return '<section class="movie-grid">' + items.map(movieCardHtml).join('') + '</section>';
  }

  function movieCardHtml(movie) {
    return '<button data-focusable class="movie-card" data-action="detail" data-slug="' + escapeAttr(movie.slug || movie.id) + '">' +
      posterHtml(movie) +
      '<span class="movie-title">' + escapeHtml(movie.title || movie.slug || 'Untitled') + '</span>' +
      '<small>' + escapeHtml([movie.year, movie.type, movie.rating].filter(Boolean).join(' / ')) + '</small>' +
      '</button>';
  }

  function posterHtml(movie) {
    if (movie && movie.poster) return '<img src="' + escapeAttr(movie.poster) + '" alt="">';
    return '<span class="poster-fallback">DDYS</span>';
  }

  function resourceListHtml(resources) {
    if (!resources || !resources.length) return '<div class="empty">No resources to display.</div>';
    return '<div class="resource-list">' + resources.map(function (resource, index) {
      return '<button data-focusable class="resource-item" data-action="play" data-value="' + index + '">' +
        '<span><strong>' + escapeHtml(resource.title || 'Resource') + '</strong><small>' + escapeHtml(resource.group || '') + '</small></span>' +
        '<em class="' + (resource.playable ? 'ok' : 'warn') + '">' + escapeHtml(resource.kind || 'unknown') + '</em>' +
        '</button>';
    }).join('') + '</div>';
  }

  function historyHtml() {
    if (!history.length) return '<section class="empty">No watch history yet.</section>';
    return '<section class="history-list">' + history.map(function (item) {
      return '<button data-focusable class="history-item" data-action="detail" data-slug="' + escapeAttr(item.slug) + '">' +
        '<strong>' + escapeHtml(item.title || item.slug) + '</strong>' +
        '<small>' + escapeHtml([item.resourceTitle, formatTime(item.playedAt)].filter(Boolean).join(' / ')) + '</small>' +
        '</button>';
    }).join('') + '</section>';
  }

  function formRow(label, name, value, type) {
    return '<label class="form-row"><span>' + escapeHtml(label) + '</span><input data-focusable id="' + escapeAttr(name) + '" type="' + type + '" value="' + escapeAttr(value) + '"></label>';
  }

  function selectRow(label, name, value, options) {
    return '<label class="form-row"><span>' + escapeHtml(label) + '</span><select data-focusable id="' + escapeAttr(name) + '">' + options.map(function (item) {
      return '<option value="' + escapeAttr(item[0]) + '"' + (item[0] === value ? ' selected' : '') + '>' + escapeHtml(item[1]) + '</option>';
    }).join('') + '</select></label>';
  }

  function toggleRow(label, name, value) {
    return '<label class="form-row switch"><span>' + escapeHtml(label) + '</span><input data-focusable id="' + escapeAttr(name) + '" type="checkbox"' + (value ? ' checked' : '') + '></label>';
  }

  function updateNav(view) {
    Array.prototype.slice.call(document.querySelectorAll('[data-view]')).forEach(function (button) {
      button.classList.toggle('is-active', button.getAttribute('data-view') === view);
    });
  }

  function setLoading(text) {
    setStatus(text);
    screen.innerHTML = '<section class="empty">' + escapeHtml(text) + '...</section>';
  }

  function showError(error) {
    var message = error && error.message ? error.message : String(error);
    screen.innerHTML = '<section class="error"><h2>Load failed</h2><p>' + escapeHtml(message) + '</p><button data-focusable data-action="settings">Check Settings</button></section>';
    setStatus('Load failed: ' + message);
    focus.refresh();
  }

  function setStatus(text) {
    if (statusLine) statusLine.textContent = text;
  }

  function toastText(text) {
    toast.textContent = text;
    toast.hidden = false;
    clearTimeout(toast.__timer);
    toast.__timer = setTimeout(function () { toast.hidden = true; }, 2200);
  }

  function findCategory(type) {
    var categories = client.categories();
    var i;
    for (i = 0; i < categories.length; i += 1) {
      if (categories[i].id === type || categories[i].type === type) return categories[i];
    }
    return { title: type };
  }

  function isFavorite(slug) {
    return favorites.some(function (item) { return (item.slug || item.id) === slug; });
  }

  function uniqueMovies(items) {
    var seen = {};
    return items.filter(function (item) {
      var key = item.slug || item.id || item.title;
      if (!key || seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  function valueOf(id) {
    var node = document.getElementById(id);
    return node ? node.value : '';
  }

  function checkedOf(id) {
    var node = document.getElementById(id);
    return !!(node && node.checked);
  }

  function formatTime(value) {
    if (!value) return '';
    try {
      return new Date(value).toLocaleString();
    } catch (error) {
      return value;
    }
  }

  function readNumber(value, fallback) {
    var number = Number(value);
    return isFinite(number) ? number : fallback;
  }

  function merge(base, extra) {
    var out = {};
    Object.keys(base || {}).forEach(function (key) { out[key] = base[key]; });
    Object.keys(extra || {}).forEach(function (key) { out[key] = extra[key]; });
    return out;
  }

  function safeArrayOrObject(value, fallback) {
    if (Array.isArray(fallback)) return Array.isArray(value) ? value : fallback.slice();
    return value && typeof value === 'object' && !Array.isArray(value) ? value : merge(fallback, {});
  }

  function closest(node, selector) {
    while (node && node !== document) {
      if (node.matches && node.matches(selector)) return node;
      node = node.parentNode;
    }
    return null;
  }

  function escapeHtml(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  global.DDYSTizenApp = {
    boot: boot,
    openView: openView,
    getSettings: function () { return settings; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
