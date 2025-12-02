let data = [];
let headers = [];
let filteredData = [];

// dynamic header names (filled after load)
let TITLE_SHORT_FIELD = 'Titolo articolo';
let TITLE_FULL_FIELD  = 'titolo art. integrale';

// Load TSV
async function loadData() {
  const response = await fetch('combined.tsv');
  const text = await response.text();

  const lines = text.trim().split(/\r?\n/).filter(line => line.trim() !== '');
  // normalize headers: trim once and keep normalized everywhere
  headers = lines[0].split('\t').map(h => h.trim());

  // detect the actual title fields by case-insensitive match
  TITLE_SHORT_FIELD =
    headers.find(h => h.toLowerCase() === 'titolo articolo') || 'Titolo articolo';
  TITLE_FULL_FIELD =
    headers.find(h => h.toLowerCase() === 'titolo art. integrale') || 'titolo art. integrale';

  data = lines.slice(1).map(line => {
    const values = line.split('\t');
    const row = {};
    headers.forEach((h, i) => {
      row[h] = values[i] ? values[i].trim() : '';
    });
    return row;
  });

  filteredData = data; // show all by default
  populateDropdowns();
  renderTable(filteredData, headers);
}

/* ---------- Helpers for ranges ---------- */

function expandNumericRange(value) {
  if (!value) return [];
  const parts = value.split(/[-–]/).map(p => p.trim());
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    const start = parseInt(parts[0], 10);
    const end = parseInt(parts[1], 10);
    return Array.from({ length: end - start + 1 }, (_, i) => (start + i).toString());
  }
  return [value];
}

// Expand single range field
function expandFieldValue(fieldValue) {
  if (!fieldValue) return [];
  const parts = fieldValue.split(/[-–]/).map(p => p.trim());
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    const start = parseInt(parts[0], 10);
    const end = parseInt(parts[1], 10);
    return Array.from({ length: end - start + 1 }, (_, i) => (start + i).toString());
  }
  return [fieldValue];
}

function matchesDropdownField(rowValue, query) {
  return expandFieldValue(rowValue).includes(query);
}

/* ---------- Dropdown population ---------- */

function fillDropdown(id, rawValues, useNumericSort = false) {
  const expandedValues = rawValues.flatMap(v => expandNumericRange(v));
  const uniqueValues = Array.from(
    new Set(
      expandedValues
        .map(v => v.trim())
        .filter(v => v && v !== '?')
    )
  ).sort((a, b) => {
    if (useNumericSort) {
      const numA = parseFloat(a), numB = parseFloat(b);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
    }
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  });

  const dropdown = document.getElementById(id);
  if (dropdown) {
    dropdown.innerHTML =
      '<option value="">-- Any --</option>' +
      uniqueValues.map(v => `<option value="${v}">${v}</option>`).join('');
  }
}

// Populate all dropdowns
function populateDropdowns() {
  // Simple column-based dropdowns
  const dropdownMap = {
    'volumeSearch': 'Volume',
    'fascicoloSearch': 'Fascicolo',
    'dataSearch': 'Data pubbl.',
    'colStartSearch': 'Nr. col. inizio',
    'colEndSearch': 'Nr. col. fine'
  };

  for (const [id, field] of Object.entries(dropdownMap)) {
    const rawValues = data
      .map(row => row[field])
      .filter(v => v && v !== '?');
    // For numeric-looking fields, numeric sort is nicer
    const useNumericSort = ['Volume', 'Fascicolo', 'Nr. col. inizio', 'Nr. col. fine'].includes(field);
    fillDropdown(id, rawValues, useNumericSort);
  }

  // Settore dropdown
  const settoreValues = data
    .map(row => row['Settore'])
    .filter(v => v && v !== '?');
  fillDropdown('settoreSearch', settoreValues, false);

  // Single authors dropdown (all authors merged)
  const allAuthors = [];
  ['Autore1', 'Autore2', 'Autore3', 'Autore4'].forEach(col => {
    data.forEach(row => {
      const v = row[col];
      if (v && v !== '?') allAuthors.push(v);
    });
  });
  fillDropdown('autoreSearch', allAuthors, false);
}

/* ---------- Text search helper (for title etc.) ---------- */

function matchesTextField(value, query) {
  const val = String(value || '');
  if (!query) return true;

  // Phrase search: "exact phrase"
  const phraseMatchPattern = /\"(.*?)\"/g;
  const phrases = [...query.matchAll(phraseMatchPattern)].map(m => m[1]);
  const remainingQuery = query.replace(phraseMatchPattern, '').trim();
  const words = remainingQuery.split(/\s+/).filter(Boolean);

  let matchScore = 0;

  // wildcard * support on words
  for (const word of words) {
    const regex = new RegExp(word.replace(/\*/g, '.*'), 'i');
    if (regex.test(val)) matchScore += 1;
  }
  for (const phrase of phrases) {
    if (val.toLowerCase().includes(phrase.toLowerCase())) matchScore += 5;
  }

  return matchScore > 0;
}

/* ---------- Search logic ---------- */

function searchDatabase(queries) {
  const allBlank = Object.values(queries).every(v => !v);
  if (allBlank) return filteredData;

  return filteredData.filter(row => {
    // Title search (phrase + word + *), across BOTH title fields
    const titleQuery = queries['Titolo articolo'];
    if (titleQuery) {
      const t1 = row[TITLE_SHORT_FIELD] || '';
      const t2 = row[TITLE_FULL_FIELD]  || '';
      const matches =
        matchesTextField(t1, titleQuery) ||
        matchesTextField(t2, titleQuery);

      if (!matches) return false;
    }

    // Volume / Fascicolo / Data pubbl. / columns range, using dropdown-style matching
    const rangeFields = ['Volume', 'Fascicolo', 'Data pubbl.', 'Nr. col. inizio', 'Nr. col. fine'];
    for (const field of rangeFields) {
      const q = queries[field];
      if (!q) continue;
      const value = String(row[field] || '');
      if (!matchesDropdownField(value, q)) return false;
    }

    // Settore dropdown
    const settoreQuery = queries['Settore'];
    if (settoreQuery) {
      const settoreValue = (row['Settore'] || '').trim();
      if (settoreValue !== settoreQuery) return false;
    }

    // Single author dropdown (matches any of Autore1–4)
    const authorQuery = queries['Autore'];
    if (authorQuery) {
      const authorCols = ['Autore1', 'Autore2', 'Autore3', 'Autore4'];
      const hasAuthor = authorCols.some(col => {
        const v = (row[col] || '').trim();
        return v === authorQuery;
      });
      if (!hasAuthor) return false;
    }

    return true;
  });
}

/* ---------- Links ---------- */

function getLink(row) {
  const settore = row['Settore']?.toLowerCase();
  let volume = (row['Volume'] || '1').match(/^(\d+)/)?.[1] || '1';
  let page = (row['Nr. col. inizio'] || '1').match(/^(\d+)/)?.[1] || '1';

  if (settore && settore.includes('latin')) {
    return `https://stampa.lei-digitale.it/volumes/?sector=latinismi&volume=${volume}&page=${page}`;
  }
  if (settore && settore.includes('german')) {
    return `https://stampa.lei-digitale.it/volumes/?sector=germanismi&volume=${volume}&page=${page}`;
  }
  return '#';
}

/* ---------- Table rendering (with empty-column removal) ---------- */

function renderTable(rows, headers) {
  const container = document.getElementById('results');
  if (!rows.length) {
    container.innerHTML = '<p>No results found.</p>';
    return;
  }

  // We never show Autore1–4 directly; we show merged "Autori" column instead
  const baseDisplayHeaders = headers.filter(
    h => !['Autore1', 'Autore2', 'Autore3', 'Autore4'].includes(h)
  );
  baseDisplayHeaders.push('Autori');

  // Determine which columns actually have data (for current result set)
  const displayHeaders = baseDisplayHeaders.filter(h => {
    if (h === 'Autori') {
      return rows.some(row =>
        ['Autore1', 'Autore2', 'Autore3', 'Autore4'].some(col => {
          const v = row[col];
          return v && v !== '?';
        })
      );
    }
    return rows.some(row => {
      const v = row[h];
      return v && v !== '?';
    });
  });

  const thead = `<thead><tr><th>🔗</th>${displayHeaders.map(h => `<th>${h}</th>`).join('')}</tr></thead>`;

  const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor"
        class="bi bi-box-arrow-up-right" viewBox="0 0 16 16">
        <path fill-rule="evenodd" d="M8.636 3.5a.5.5 0 0 0-.5-.5H1.5A1.5 1.5 0 0 0 0 4.5v10A1.5 1.5 0 0 0 1.5 16h10a.5.5 0 0 0 
               1.5-1.5V7.864a.5.5 0 0 0-1 0V14.5a.5.5 0 0 1-.5.5h-10a.5.5 0 0 1 
               .5-.5v-10a.5.5 0 0 1-.5-.5h6.636a.5.5 0 0 0 .5-.5"/>
        <path fill-rule="evenodd" d="M16 .5a.5.5 0 0 0-.5-.5h-5a.5.5 0 0 0 0 1h3.793L6.146 
               9.146a.5.5 0 1 0 .708.708L15 
               1.707V5.5a.5.5 0 0 0 1 0z"/>
      </svg>`;

  const maxLength = 100;

  const tbody = rows.map(row => {
    const authors = [row['Autore1'], row['Autore2'], row['Autore3'], row['Autore4']]
      .filter(v => v && v !== '?')
      .join(', ');

    const cells = displayHeaders.map(h => {
      let val;
      if (h === 'Autori') {
        val = authors;
      } else {
        val = row[h] || '';
      }

      if (val.length > maxLength) {
        return `<td><details><summary>${val.slice(0, maxLength)}...</summary>${val}</details></td>`;
      }
      return `<td>${val}</td>`;
    }).join('');

    return `<tr><td><a href="${getLink(row)}" target="_blank">${svgIcon}</a></td>${cells}</tr>`;
  }).join('');

  container.innerHTML = `<table class="styled-table">${thead}<tbody>${tbody}</tbody></table>`;
}

/* ---------- Run search ---------- */

function runSearch() {
  const queries = {
    'Titolo articolo': document.getElementById('titleSearch').value.trim(),
    'Volume': document.getElementById('volumeSearch').value,
    'Fascicolo': document.getElementById('fascicoloSearch').value,
    'Data pubbl.': document.getElementById('dataSearch').value,
    'Nr. col. inizio': document.getElementById('colStartSearch').value,
    'Nr. col. fine': document.getElementById('colEndSearch').value,
    'Settore': document.getElementById('settoreSearch').value,
    'Autore': document.getElementById('autoreSearch').value
  };

  const results = searchDatabase(queries);
  renderTable(results, headers);
}

/* ---------- DOM events ---------- */

document.addEventListener('DOMContentLoaded', () => {
  loadData();
  document.getElementById('searchBtn').addEventListener('click', runSearch);
  document.getElementById('homeBtn').addEventListener('click', () => {
    window.location.href = 'index.html';
  });
});
