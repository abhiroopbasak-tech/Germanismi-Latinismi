let originalData = [];
let headers = ["Anno", "Vol.", "Carta", "Nome", "Categoria", "Titolo categoria", "Sottocategoria"];

// Helper: fill dropdown with unique sorted options from a field
function fillDropdown(id, field) {
  const select = document.getElementById(id);
  const uniqueValues = [...new Set(originalData.map(row => row[field]).filter(Boolean))].sort();
  uniqueValues.forEach(val => {
    const option = document.createElement("option");
    option.value = val;
    option.textContent = val;
    select.appendChild(option);
  });
}

async function loadTSV() {
  const response = await fetch("data/dataset.tsv");
  const text = await response.text();

  const rows = text.split(/\r?\n/).filter(line => line.trim());
  const rawHeaders = rows[0].split("\t");
  const dataRows = rows.slice(1).map(row => row.split("\t"));

  const idx = (name) => rawHeaders.indexOf(name);

  originalData = dataRows.map(row => {
    return {
      "Anno": (row[idx("Anno")] || "").toLowerCase(),
      "Vol.": (row[idx("Vol")] || row[idx("Vol.")] || "").toLowerCase(),
      "Carta": [row[idx("Carta-nr")], row[idx("Carta-lett")]].filter(Boolean).join("").toLowerCase(),
      "Nome": (row[idx("Nome")] || "").toLowerCase(),
      "Categoria": (row[idx("Categoria")] || "").toLowerCase(),
      "Titolo categoria": (row[idx("Titolo categoria")] || "").toLowerCase(),
      "Sottocategoria": [row[idx("Sottocategoria")], row[idx("Titolo sottocategoria")]].filter(Boolean).join(" - ").toLowerCase()
    };
  });

  fillDropdown("filterVol", "Vol.");
  fillDropdown("filterCarta", "Carta");
  fillDropdown("filterCategoria", "Categoria");

  renderTable(originalData);
}

function renderTable(data) {
  const tableHeader = document.getElementById("tableHeader");
  const tableBody = document.getElementById("tableBody");
  tableHeader.innerHTML = "";
  tableBody.innerHTML = "";

  // Add Link column at the start
  const headerRow = document.createElement("tr");
  const thLink = document.createElement("th");
  thLink.textContent = "Link";
  headerRow.appendChild(thLink);
  headers.forEach(h => {
    const th = document.createElement("th");
    th.textContent = h;
    headerRow.appendChild(th);
  });
  tableHeader.appendChild(headerRow);

  const romanToArabic = {
    i: 1, ii: 2, iii: 3, iv: 4, v: 5,
    vi: 6, vii: 7, viii: 8, ix: 9, x: 10
  };

  data.forEach(row => {
    const tr = document.createElement("tr");

    const volRoman = row["Vol."];
    const cartaRaw = row["Carta"];

    const volume = romanToArabic[volRoman] || 1;

    // Extract number part of Carta (e.g., "2a" → 2)
    const tdLink = document.createElement("td");

const cartaMatch = cartaRaw.match(/^(\d{1,2})[a-z]?$/i);
if (cartaMatch) {
  const cartaNum = cartaMatch[1].padStart(2, "0");
  const link = `https://stampa.lei-digitale.it/aleic/?volume=${volume}&page=Intro${cartaNum}_01`;
  tdLink.innerHTML = `<a href="${link}" target="_blank" title="Open page">🔗</a>`;
}

tr.appendChild(tdLink);

    headers.forEach(h => {
      const td = document.createElement("td");
      td.textContent = row[h] || "";
      tr.appendChild(td);
    });

    tableBody.appendChild(tr);
  });
}



function parseFullTextQuery(input) {
  const matches = [];
  const phraseRegex = /"([^"]+)"/g;
  let match;

  // Extract quoted phrases
  while ((match = phraseRegex.exec(input)) !== null) {
    matches.push({
      type: "phrase",
      regex: new RegExp(match[1].replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'), "i")
    });
  }

  // Remove quoted phrases from input
  const remaining = input.replace(phraseRegex, "").trim();

  // Add unquoted words as wildcard search terms
  if (remaining) {
    const words = remaining.split(/\s+/);
    words.forEach(word => {
      const escaped = word.replace(/[-/\\^$+?.()|[\]{}]/g, '\\$&')
                          .replace(/\*/g, ".*").replace(/\?/g, ".?");
      matches.push({ type: "word", regex: new RegExp(escaped, "i") });
    });
  }

  return matches;
}

document.getElementById("multiSearchForm").addEventListener("submit", function (e) {
  e.preventDefault();
  const formData = new FormData(e.target);
  const filters = {};

  for (let [key, value] of formData.entries()) {
    if (value.trim()) filters[key] = value.trim().toLowerCase();
  }

  const fullTextInput = document.getElementById("fullTextSearch").value.trim().toLowerCase();
  const fullTextQueries = parseFullTextQuery(fullTextInput);

  const dropdownExactMatchFields = ["Vol.", "Carta", "Categoria"];

  const filtered = originalData
    .map(row => {
      let matchCount = 0;

      const matchesFields = Object.entries(filters).every(([field, val]) => {
        const cell = (row[field] || "");
        if (dropdownExactMatchFields.includes(field)) {
          if (cell === val) {
            matchCount++;
            return true;
          }
          return false;
        } else {
          const escaped = val.replace(/[-/\\^$+?.()|[\]{}]/g, '\\$&')
                             .replace(/\*/g, ".*").replace(/\?/g, ".?");
          const regex = new RegExp(escaped, "i");
          if (regex.test(cell)) {
            matchCount++;
            return true;
          }
          return false;
        }
      });

      const matchesText =
        fullTextQueries.length === 0 ||
        fullTextQueries.some(({ regex }) =>
          Object.values(row).some(v => {
            const result = regex.test(v || "");
            if (result) matchCount++;
            return result;
        })
      );

      if (matchesFields && matchesText) {
        return { row, matchCount };
      }
      return null;
    })
    .filter(Boolean)
    .sort((a, b) => b.matchCount - a.matchCount)
    .map(r => r.row);

  renderTable(filtered);

  console.log("Filters:", filters);
console.log("Full text queries:", fullTextQueries);
console.log("Results:", filtered.length);
});

document.getElementById("resetBtn").addEventListener("click", () => {
  document.getElementById("multiSearchForm").reset();
  document.getElementById("fullTextSearch").value = "";
  renderTable(originalData);
});

window.addEventListener("DOMContentLoaded", loadTSV);
