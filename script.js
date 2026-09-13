// ============================================================
// SAMPLE DATA
// This is a small hand-written list standing in for a real
// database. Once we have a TMDB API key, this whole block gets
// replaced by a live lookup — nothing else in the file changes.
// ============================================================
const SHOWS = [
  { title: "The Grand Budapest Hotel", type: "movie", genre: "Comedy", runtime: 100, rating: 8, services: ["Disney+", "Prime Video"] },
  { title: "Stranger Things", type: "tv", genre: "Sci-Fi", runtime: 50, rating: 8, services: ["Netflix"] },
  { title: "Knives Out", type: "movie", genre: "Mystery", runtime: 130, rating: 8, services: ["Netflix", "Prime Video"] },
  { title: "Ted Lasso", type: "tv", genre: "Comedy", runtime: 30, rating: 8, services: ["Apple TV+"] },
  { title: "Dune", type: "movie", genre: "Sci-Fi", runtime: 155, rating: 8, services: ["Prime Video"] },
  { title: "The Bear", type: "tv", genre: "Drama", runtime: 30, rating: 8, services: ["Disney+"] },
  { title: "Paddington 2", type: "movie", genre: "Comedy", runtime: 103, rating: 8, services: ["Netflix", "Prime Video"] },
  { title: "Slow Horses", type: "tv", genre: "Drama", runtime: 50, rating: 8, services: ["Apple TV+"] },
  { title: "Everything Everywhere All at Once", type: "movie", genre: "Sci-Fi", runtime: 140, rating: 8, services: ["Prime Video"] },
  { title: "Fleabag", type: "tv", genre: "Comedy", runtime: 25, rating: 8, services: ["Prime Video"] },
  { title: "The Queen's Gambit", type: "tv", genre: "Drama", runtime: 55, rating: 8, services: ["Netflix"] },
  { title: "Mad Max: Fury Road", type: "movie", genre: "Action", runtime: 120, rating: 8, services: ["Netflix"] },
  { title: "Only Murders in the Building", type: "tv", genre: "Mystery", runtime: 35, rating: 7, services: ["Disney+"] },
  { title: "The Menu", type: "movie", genre: "Horror", runtime: 107, rating: 7, services: ["Disney+"] },
  { title: "Severance", type: "tv", genre: "Sci-Fi", runtime: 50, rating: 8, services: ["Apple TV+"] },
];

const ALL_SERVICES = ["Netflix", "Prime Video", "Disney+", "Apple TV+"];

// ============================================================
// BUILD THE FILTER CONTROLS
// ============================================================

// Genre dropdown: build it from whatever genres appear in the data,
// so it stays correct even as the list grows.
const genreSelect = document.getElementById("genre");
const genres = [...new Set(SHOWS.map(s => s.genre))].sort();
genres.forEach(g => {
  const opt = document.createElement("option");
  opt.value = g;
  opt.textContent = g;
  genreSelect.appendChild(opt);
});

// Streaming service checkboxes
const serviceList = document.getElementById("serviceList");
ALL_SERVICES.forEach(service => {
  const label = document.createElement("label");
  label.innerHTML = `<input type="checkbox" value="${service}" checked> ${service}`;
  serviceList.appendChild(label);
});

// Runtime slider label (e.g. "1h 40m")
const maxRuntimeInput = document.getElementById("maxRuntime");
const maxRuntimeValue = document.getElementById("maxRuntimeValue");
function formatRuntime(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
function updateRuntimeLabel() {
  maxRuntimeValue.textContent = formatRuntime(Number(maxRuntimeInput.value));
}
maxRuntimeInput.addEventListener("input", updateRuntimeLabel);
updateRuntimeLabel();

// Rating slider label
const minRatingInput = document.getElementById("minRating");
const minRatingValue = document.getElementById("minRatingValue");
function updateRatingLabel() {
  const v = Number(minRatingInput.value);
  minRatingValue.textContent = v === 0 ? "Any" : `${v}+`;
}
minRatingInput.addEventListener("input", updateRatingLabel);
updateRatingLabel();

// ============================================================
// THE PICK LOGIC
// ============================================================
const resultBox = document.getElementById("result");
const emptyMessage = document.getElementById("emptyMessage");

function getCheckedServices() {
  return [...serviceList.querySelectorAll("input:checked")].map(i => i.value);
}

function pickSomething() {
  const type = document.getElementById("type").value;
  const genre = genreSelect.value;
  const maxRuntime = Number(maxRuntimeInput.value);
  const minRating = Number(minRatingInput.value);
  const myServices = getCheckedServices();

  const matches = SHOWS.filter(show => {
    if (type !== "any" && show.type !== type) return false;
    if (genre !== "any" && show.genre !== genre) return false;
    if (show.runtime > maxRuntime) return false;
    if (show.rating < minRating) return false;
    // Keep it only if it's on at least one service the person has ticked.
    if (!show.services.some(s => myServices.includes(s))) return false;
    return true;
  });

  if (matches.length === 0) {
    resultBox.classList.add("hidden");
    emptyMessage.classList.remove("hidden");
    return;
  }

  const pick = matches[Math.floor(Math.random() * matches.length)];
  emptyMessage.classList.add("hidden");
  resultBox.classList.remove("hidden");
  resultBox.innerHTML = `
    <h2>${pick.title}</h2>
    <p class="meta">${pick.type === "movie" ? "Movie" : "TV show"} · ${formatRuntime(pick.runtime)} · ${pick.rating}/10</p>
    <div class="badges">
      ${pick.services.map(s => `<span class="badge">${s}</span>`).join("")}
    </div>
  `;
}

document.getElementById("pickBtn").addEventListener("click", pickSomething);
