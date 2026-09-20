/* admission.js — 读取 ./admission.csv 并渲染录取名单 */
(() => {
  'use strict';
  var CSV_URL = './admission.csv';
  var grid = document.getElementById('admission-grid');
  var filterHost = document.getElementById('admission-filters');
  var searchInput = document.getElementById('admission-search');
  var statusText = document.getElementById('admission-status-text');
  var resetButton = document.getElementById('admission-reset');
  var emptyState = document.getElementById('admission-empty');
  var errorBox = document.getElementById('admission-error');
  var statCount = document.getElementById('stat-count');
  var statColleges = document.getElementById('stat-colleges');
  var students = [];
  var tagCounts = {};
  var activeTag = '';
  var keyword = '';
  var debounceTimer = null;
  /* ---------- 工具函数 ---------- */
  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }
  function pad(value, size) {
    var str = String(value);
    while (str.length < size)
      str = '0' + str;
    return str;
  }
  function slugifyTag(tag) {
    return String(tag)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
  /* ---------- CSV 解析 ---------- */
  function parseCSV(text) {
    var source = String(text).replace(/^\uFEFF/, '');
    var rows = [];
    var row = [];
    var field = '';
    var inQuotes = false;
    var ch;
    for (var i = 0; i < source.length; i += 1) {
      ch = source.charAt(i);
      if (inQuotes) {
        if (ch === '"') {
          if (source.charAt(i + 1) === '"') {
            field += '"';
            i += 1;
          } else {
            inQuotes = false;
          }
        } else {
          field += ch;
        }
        continue;
      }
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(field);
        field = '';
      } else if (ch === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else if (ch !== '\r') {
        field += ch;
      }
    }
    if (field !== '' || row.length) {
      row.push(field);
      rows.push(row);
    }
    return rows.filter((cells) => cells.some((cell) => String(cell).trim() !== ''));
  }
  function buildStudents(rows) {
    if (!rows.length)
      return [];
    var header = rows[0].map((cell) => String(cell).trim());
    function findColumn(names) {
      for (var i = 0; i < header.length; i += 1)
        if (names.indexOf(header[i]) !== -1)
          return i;
      return -1;
    }
    var idx = {
      name: findColumn(['姓名', 'name']),
      college: findColumn(['学院', 'college']),
      major: findColumn(['专业', 'major']),
      tags: findColumn(['能力标签', '标签', 'skills', 'tags'])
    };
    var hasHeader = idx.name !== -1;
    if (!hasHeader) {
      idx = { name: 0, college: 1, major: 2, tags: 3 };
    }
    var dataRows = hasHeader ? rows.slice(1) : rows;
    return dataRows.map((cells) => {
      var tags = String(cells[idx.tags] || '')
        .split('/')
        .map((tag) => tag.trim())
        .filter(Boolean);
      return {
        name: String(cells[idx.name] || '').trim(),
        college: String(cells[idx.college] || '').trim(),
        major: String(cells[idx.major] || '').trim(),
        tags: tags
      };
    }).filter((student) =>  student.name !== '');
  }
  /* ---------- 筛选逻辑 ---------- */
  function matches(student) {
    if (activeTag && student.tags.indexOf(activeTag) === -1)
      return false;
    if (!keyword)
      return true;
    var haystack = [student.name, student.college, student.major]
      .concat(student.tags)
      .join(' ')
      .toLowerCase();
    return haystack.indexOf(keyword) !== -1;
  }
  function applyFilters() {
    var result = students.filter(matches);
    renderCards(result);
    return result;
  }
  /* ---------- 渲染 ---------- */
  function renderStats() {
    var colleges = {};
    students.forEach((student) => {
      if (student.college)
        colleges[student.college] = true;
    });
    statCount.textContent = String(students.length);
    statColleges.textContent = String(Object.keys(colleges).length);
  }
  function renderFilters() {
    var tags = Object.keys(tagCounts).sort((a, b) => tagCounts[b] - tagCounts[a] || a.localeCompare(b, 'zh-Hans-CN'));
    var html = '<button class="admission-filter active" type="button" data-tag="">' + '全部 <b>' + students.length + '</b></button>';
    tags.forEach((tag) => {
      html += '<button class="admission-filter" type="button" data-tag="' +
        escapeHtml(tag) + '">' + escapeHtml(tag) +
        ' <b>' + tagCounts[tag] + '</b></button>';
    });
    filterHost.innerHTML = html;
  }
  function syncFilterButtons() {
    var buttons = filterHost.querySelectorAll('.admission-filter');
    Array.prototype.forEach.call(buttons, (button) => {
      var isActive = (button.getAttribute('data-tag') || '') === activeTag;
      button.classList.toggle('active', isActive);
    });
  }
  function buildCard(student) {
    var card = document.createElement('article');
    card.className = 'admission-card';
    var index = document.createElement('span');
    index.className = 'admission-card-index';
    index.textContent = 'NO. ' + pad(student.index, 3);
    card.appendChild(index);
    var name = document.createElement('h2');
    name.className = 'admission-card-name';
    name.textContent = student.name;
    card.appendChild(name);
    var major = document.createElement('p');
    major.className = 'admission-card-major';
    major.textContent = [student.college, student.major].filter(Boolean).join(' · ');
    card.appendChild(major);
    var tagRow = document.createElement('div');
    tagRow.className = 'admission-card-tags';
    student.tags.forEach((tag) => {
      var pill = document.createElement('span');
      pill.className = 'admission-pill';
      pill.setAttribute('data-tag', slugifyTag(tag));
      pill.textContent = tag;
      tagRow.appendChild(pill);
    });
    card.appendChild(tagRow);
    return card;
  }
  function renderCards(list) {
    grid.innerHTML = '';
    if (!list.length) {
      emptyState.hidden = false;
      updateStatus(0);
      return;
    }
    emptyState.hidden = true;
    var fragment = document.createDocumentFragment();
    list.forEach((student) =>  fragment.appendChild(buildCard(student)));
    grid.appendChild(fragment);
    updateStatus(list.length);
  }
  function updateStatus(count) {
    if (!students.length) {
      statusText.textContent = '名单暂时为空。';
      resetButton.hidden = true;
      return;
    }
    var filtered = Boolean(activeTag || keyword);
    statusText.textContent = filtered
      ? '筛选到 ' + count + ' / ' + students.length + ' 位参与者'
      : '共 ' + students.length + ' 位参与者';
    resetButton.hidden = !filtered;
  }
  function showError(error) {
    grid.innerHTML = '';
    emptyState.hidden = true;
    resetButton.hidden = true;
    statusText.textContent = '读取名单失败';
    errorBox.hidden = false;
    errorBox.innerHTML =
      '<strong>无法读取 ' + escapeHtml(CSV_URL) + '</strong>' +
      '请确认名单文件与页面位于同一目录。如果是直接双击打开的本地 HTML 文件，' +
      '浏览器会拦截本地文件读取，请在项目目录运行 ' +
      '<code>python3 -m http.server</code>，再访问 ' +
      '<code>http://localhost:8000/admission.html</code>。' +
      '<small>错误信息：' +
      escapeHtml(error && error.message ? error.message : String(error)) +
      '</small>';
  }
  /* ---------- 初始化 ---------- */
  function init(rows) {
    students = buildStudents(rows);
    if (!students.length) {
      statusText.textContent = '名单暂时为空。';
      resetButton.hidden = true;
      return;
    }
    students.forEach((student, i) => {
      student.index = i + 1;
      student.tags.forEach((tag) => tagCounts[tag] = (tagCounts[tag] || 0) + 1);
    });
    renderStats();
    renderFilters();
    applyFilters();
  }
  /* ---------- 事件绑定 ---------- */
  filterHost.addEventListener('click', (event) => {
    var button = event.target.closest('.admission-filter');
    if (!button)
      return;
    activeTag = button.getAttribute('data-tag') || '';
    syncFilterButtons();
    applyFilters();
  });
  searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      keyword = searchInput.value.trim().toLowerCase();
      applyFilters();
    }, 140);
  });
  searchInput.addEventListener('search', () => {
    if (searchInput.value === '') {
      clearTimeout(debounceTimer);
      keyword = '';
      applyFilters();
    }
  });
  resetButton.addEventListener('click', () => {
    activeTag = '';
    keyword = '';
    searchInput.value = '';
    syncFilterButtons();
    applyFilters();
  });
  /* ---------- 拉取数据 ---------- */
  fetch(CSV_URL, { cache: 'no-store' })
    .then((response) => {
      if (!response.ok)
        throw new Error('HTTP ' + response.status + ' ' + response.statusText);
      return response.text();
    })
    .then((text) => init(parseCSV(text)))
    .catch((error) => showError(error));
})();