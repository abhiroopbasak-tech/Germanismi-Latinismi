let data = [];
let headers = [];
let filteredData = [];

async function loadData() {
  const response = await fetch('combined.tsv');
  const text = await response.text();

  const lines = text.trim().split(/\r?\n/).filter(line => line.trim() !== '');
  headers = lines[0].split('\t');

  data = lines.slice(1).map(line => {
    const values = line.split('\t');
    const row = {};
    headers.forEach((h, i) => row[h.trim()] = values[i] ? values[i].trim() : '');
    return row;
  });

  filteredData = data; // show all by default
  populateDropdowns(filteredData);
  renderTable(filteredData, headers);
}


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

// Populate all dropdowns
function populateDropdowns() {
  const dropdownMap = {
    'volumeSearch': 'Volume',
    'fascicoloSearch': 'Fascicolo',
    'dataSearch': 'Data pubbl.',
    'colStartSearch': 'Nr. col. inizio',
    'colEndSearch': 'Nr. col. fine',
    'autore1Search': 'Autore1',
    'autore2Search': 'Autore2',
    'autore3Search': 'Autore3',
    'autore4Search': 'Autore4'
  };

  for (const [id, field] of Object.entries(dropdownMap)) {
    // Get all non-empty, non-"?" values
    const rawValues = data
      .map(row => row[field])
      .filter(v => v && v !== '?');

    // Expand numeric ranges
    const expandedValues = rawValues.flatMap(v => expandNumericRange(v));

    // Remove duplicates and sort naturally
    const uniqueValues = [...new Set(expandedValues)]
      .map(v => v.trim())
      .filter(v => v !== '')
      .sort((a, b) => {
        const numA = parseFloat(a), numB = parseFloat(b);
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
      });

    // Fill dropdown
    const dropdown = document.getElementById(id);
    if (dropdown) {
      dropdown.innerHTML =
        '<option value="">-- Any --</option>' +
        uniqueValues.map(v => `<option value="${v}">${v}</option>`).join('');
    }
  }
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

function searchDatabase(queries, fields) {
  const allBlank = Object.values(queries).every(v => !v);
  if (allBlank) return filteredData;

  return filteredData.filter(row => {
    return fields.every(field => {
      const query = queries[field];
      if (!query) return true;

      const value = String(row[field] || '');
      if (['Volume', 'Fascicolo', 'Data pubbl.', 'Nr. col. inizio', 'Nr. col. fine', 'Autore1', 'Autore2', 'Autore3', 'Autore4'].includes(field)) {
        return matchesDropdownField(value, query);
      }

      // Phrase + word search
      const phraseMatchPattern = /\"(.*?)\"/g;
      const phrases = [...query.matchAll(phraseMatchPattern)].map(m => m[1]);
      const remainingQuery = query.replace(phraseMatchPattern, '').trim();
      const words = remainingQuery.split(/\s+/).filter(Boolean);

      let matchScore = 0;
      for (const word of words) {
        const regex = new RegExp(word.replace(/\*/g, '.*'), 'i');
        if (regex.test(value)) matchScore += 1;
      }
      for (const phrase of phrases) {
        if (value.toLowerCase().includes(phrase.toLowerCase())) matchScore += 5;
      }

      return matchScore > 0;
    });
  });
}

function getLink(row) {
  const settore = row['Settore']?.toLowerCase();
  let volume = (row['Volume'] || '1').match(/^(\d+)/)?.[1] || '1';
  let page = (row['Nr. col. inizio'] || '1').match(/^(\d+)/)?.[1] || '1';
  if (settore.includes('latin')) return `https://stampa.lei-digitale.it/volumes/?sector=latinismi&volume=${volume}&page=${page}`;
  if (settore.includes('german')) return `https://stampa.lei-digitale.it/volumes/?sector=germanismi&volume=${volume}&page=${page}`;
  return '#';
}

function renderTable(rows, headers) {
  const container = document.getElementById('results');
  if (!rows.length) {
    container.innerHTML = '<p>No results found.</p>';
    return;
  }

  const displayHeaders = headers.filter(h => !['Autore1','Autore2','Autore3','Autore4'].includes(h));
  displayHeaders.push('Autori');

  const thead = `<thead><tr><th>🔗</th>${displayHeaders.map(h=>`<th>${h}</th>`).join('')}</tr></thead>`;

  const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor"
        class="bi bi-box-arrow-up-right" viewBox="0 0 16 16">
        <path fill-rule="evenodd" d="M8.636 3.5a.5.5 0 0 0-.5-.5H1.5A1.5 1.5 0 0 0 0 4.5v10A1.5 1.5 0 0 0 1.5 16h10a.5.5 0 0 0 
               1.5-1.5V7.864a.5.5 0 0 0-1 0V14.5a.5.5 0 0 1-.5.5h-10a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 
               .5-.5h6.636a.5.5 0 0 0 .5-.5"/>
        <path fill-rule="evenodd" d="M16 .5a.5.5 0 0 0-.5-.5h-5a.5.5 0 0 0 0 1h3.793L6.146 
               9.146a.5.5 0 1 0 .708.708L15 
               1.707V5.5a.5.5 0 0 0 1 0z"/>
      </svg>`;

  const maxLength = 100;
  const tbody = rows.map(row => {
    const authors = [row['Autore1'], row['Autore2'], row['Autore3'], row['Autore4']].filter(v => v && v!=='?').join(', ');
    const cells = displayHeaders.map(h=>{
      let val = h==='Autori'?authors:(row[h]||'');
      if(val.length>maxLength) return `<td><details><summary>${val.slice(0,maxLength)}...</summary>${val}</details></td>`;
      return `<td>${val}</td>`;
    }).join('');
    return `<tr><td><a href="${getLink(row)}" target="_blank">${svgIcon}</a></td>${cells}</tr>`;
  }).join('');

  container.innerHTML = `<table class="styled-table">${thead}<tbody>${tbody}</tbody></table>`;
}

// Run search
function runSearch() {
  const queries = {
    'Titolo articolo': document.getElementById('titleSearch').value,
    'Volume': document.getElementById('volumeSearch').value,
    'Fascicolo': document.getElementById('fascicoloSearch').value,
    'Data pubbl.': document.getElementById('dataSearch').value,
    'Nr. col. inizio': document.getElementById('colStartSearch').value,
    'Nr. col. fine': document.getElementById('colEndSearch').value,
    'Autori': [document.getElementById('autore1Search').value,
               document.getElementById('autore2Search').value,
               document.getElementById('autore3Search').value,
               document.getElementById('autore4Search').value
              ].filter(Boolean).join(',')
  };
  const results = searchDatabase(queries, Object.keys(queries));
  renderTable(results, headers);
}

// DOM events
document.addEventListener('DOMContentLoaded', ()=>{
  loadData();
  document.getElementById('searchBtn').addEventListener('click', runSearch);
  document.getElementById('homeBtn').addEventListener('click', ()=>{window.location.href='index.html';});
});
