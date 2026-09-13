// ============================================================
// CONFIG
// ============================================================
const TMDB_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI2MmE2NDQ4NGZkZTVjZTE2YjU3MDFhNmUyNzA5ZmEwNyIsIm5iZiI6MTc4OTMxNDU0Ni44OCwic3ViIjoiNmFhNmM1ZjJhNWUyMjBhOTM5YTk4MWM3Iiwic2NvcGVzIjpbImFwaV9yZWFkIl0sInZlcnNpb24iOjF9._8bREwsUIY-yzu8RYJ7WEK6FJFqIImvpc7yhB0OUIWw";
const API_BASE = "https://api.themoviedb.org/3";
const IMG_BASE = "https://image.tmdb.org/t/p/w342";
const REGION = "GB";

// Streaming services offered as checkboxes, with their TMDB provider IDs.
const PROVIDERS = [
  { name: "Netflix", id: 8 },
  { name: "Prime Video", id: 119 },
  { name: "Disney+", id: 337 },
  { name: "Apple TV+", id: 350 },
];

// A small helper so every call to TMDB looks the same: build the
// URL, attach the API key, and turn the response into plain data.
async function tmdb(path, params = {}) {
  const url = new URL(API_BASE + path);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${TMDB_TOKEN}`, accept: "application/json" },
  });
  if (!res.ok) throw new Error(`TMDB request failed (${res.status})`);
  return res.json();
}

// ============================================================
// GENRES — fetched live so the dropdown always matches TMDB's own list.
// Movies and TV shows use slightly different genre lists/IDs, so we
// keep two lookup tables (name -> id) and pick the right one later.
// ============================================================
const movieGenres = {};
const tvGenres = {};
const genreSelect = document.getElementById("genre");

async function loadGenres() {
  const [movies, shows] = await Promise.all([
    tmdb("/genre/movie/list", { language: "en-GB" }),
    tmdb("/genre/tv/list", { language: "en-GB" }),
  ]);
  movies.genres.forEach(g => (movieGenres[g.name] = g.id));
  shows.genres.forEach(g => (tvGenres[g.name] = g.id));

  const allNames = [...new Set([...Object.keys(movieGenres), ...Object.keys(tvGenres)])].sort();
  allNames.forEach(name => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    genreSelect.appendChild(opt);
  });
}

// ============================================================
// MOVIE / TV TOGGLE BUTTONS
// ============================================================
const typeToggle = document.getElementById("typeToggle");
let selectedType = "any"; // "any" | "movie" | "tv"
typeToggle.querySelectorAll(".toggle-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    typeToggle.querySelectorAll(".toggle-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    selectedType = btn.dataset.value;
  });
});

// ============================================================
// STREAMING SERVICE CHECKBOXES
// ============================================================
const serviceList = document.getElementById("serviceList");
PROVIDERS.forEach(service => {
  const label = document.createElement("label");
  label.innerHTML = `<input type="checkbox" value="${service.id}" checked> ${service.name}`;
  serviceList.appendChild(label);
});
function getCheckedProviderIds() {
  return [...serviceList.querySelectorAll("input:checked")].map(i => Number(i.value));
}

// ============================================================
// RUNTIME / RATING SLIDERS
// ============================================================

// Colours in the filled part of a slider's track, based on its current value.
function updateSliderFill(input) {
  const min = Number(input.min), max = Number(input.max), val = Number(input.value);
  const pct = ((val - min) / (max - min)) * 100;
  input.style.setProperty("--fill", pct + "%");
}

// Max length: a small set of preset stops rather than a free-moving slider.
// "Longer" (minutes: null) means no cap is applied at all.
const RUNTIME_STEPS = [
  { minutes: 20, label: "20 mins" },
  { minutes: 30, label: "30 mins" },
  { minutes: 45, label: "45 mins" },
  { minutes: 60, label: "1 hour" },
  { minutes: 120, label: "2 hours" },
  { minutes: 180, label: "3 hours" },
  { minutes: null, label: "Longer" },
];
const maxRuntimeInput = document.getElementById("maxRuntime");
const maxRuntimeValue = document.getElementById("maxRuntimeValue");
function updateRuntimeLabel() {
  maxRuntimeValue.textContent = RUNTIME_STEPS[Number(maxRuntimeInput.value)].label;
  updateSliderFill(maxRuntimeInput);
}
maxRuntimeInput.addEventListener("input", updateRuntimeLabel);
updateRuntimeLabel();

// Minimum rating, shown as TMDB's familiar percentage score (e.g. "70%+").
const minRatingInput = document.getElementById("minRating");
const minRatingValue = document.getElementById("minRatingValue");
function updateRatingLabel() {
  const v = Number(minRatingInput.value);
  minRatingValue.textContent = v === 0 ? "Any" : `${v}%+`;
  updateSliderFill(minRatingInput);
}
minRatingInput.addEventListener("input", updateRatingLabel);
updateRatingLabel();

// ============================================================
// FETCHING CANDIDATES FROM TMDB
// ============================================================
async function fetchCandidates(mediaType, genreName, maxRuntime, minRating, providerIds) {
  const genreMap = mediaType === "movie" ? movieGenres : tvGenres;

  const params = {
    language: "en-GB",
    sort_by: "popularity.desc",
    watch_region: REGION,
    with_watch_providers: providerIds.join("|"), // "|" = any of these services
    with_watch_monetization_types: "flatrate", // only things included in a subscription
    "vote_average.gte": minRating,
    "vote_count.gte": 50, // ignore obscure titles with barely any votes
    page: 1,
  };

  if (genreName !== "any") {
    if (!genreMap[genreName]) return []; // this genre doesn't exist for this media type
    params.with_genres = genreMap[genreName];
  }

  // TMDB only supports filtering movies by runtime, not TV shows
  // (a series doesn't have one single length). maxRuntime === null means
  // "Longer" was picked, i.e. no cap at all.
  if (mediaType === "movie" && maxRuntime !== null) {
    params["with_runtime.lte"] = maxRuntime;
  }

  const endpoint = mediaType === "movie" ? "/discover/movie" : "/discover/tv";
  const first = await tmdb(endpoint, params);
  let results = first.results || [];

  // Grab a random page (not just the most popular page every time)
  // so repeated clicks don't always surface the same handful of titles.
  const totalPages = Math.min(first.total_pages || 1, 10);
  if (totalPages > 1) {
    const randomPage = 1 + Math.floor(Math.random() * totalPages);
    if (randomPage !== 1) {
      const more = await tmdb(endpoint, { ...params, page: randomPage });
      results = more.results || [];
    }
  }

  return results.map(r => ({ ...r, media_type: mediaType }));
}

// ============================================================
// RENDERING A PICK
// ============================================================
const resultBox = document.getElementById("result");
const emptyMessage = document.getElementById("emptyMessage");
const pickBtn = document.getElementById("pickBtn");

async function renderPick(pick, providerIds) {
  const title = pick.title || pick.name;
  const dateStr = pick.release_date || pick.first_air_date;
  const year = dateStr ? dateStr.slice(0, 4) : "";
  const rating = pick.vote_average ? Math.round(pick.vote_average * 10) : "?";
  const poster = pick.poster_path ? `${IMG_BASE}${pick.poster_path}` : null;

  // Find out exactly which of the person's own services actually carry
  // this title (the search filter only guarantees it's on ONE of them).
  const provPath = pick.media_type === "movie"
    ? `/movie/${pick.id}/watch/providers`
    : `/tv/${pick.id}/watch/providers`;
  let matchedNames = [];
  try {
    const provData = await tmdb(provPath);
    const flatrate = (provData.results && provData.results.GB && provData.results.GB.flatrate) || [];
    matchedNames = flatrate
      .filter(p => providerIds.includes(p.provider_id))
      .map(p => p.provider_name);
  } catch {
    // If this side-lookup fails, we still show the pick — just without badges.
  }

  emptyMessage.classList.add("hidden");
  resultBox.classList.remove("hidden");
  resultBox.innerHTML = `
    <div class="result-inner">
      ${poster ? `<img class="poster" src="${poster}" alt="${title} poster">` : ""}
      <div class="result-text">
        <h2>${title}${year ? ` (${year})` : ""}</h2>
        <p class="meta">${pick.media_type === "movie" ? "Movie" : "TV show"} · ${rating}%</p>
        <p class="overview">${pick.overview || "No description available."}</p>
        <div class="badges">
          ${(matchedNames.length ? matchedNames : ["Check availability"]).map(n => `<span class="badge">${n}</span>`).join("")}
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// MAIN BUTTON HANDLER
// ============================================================
async function pickSomething() {
  const type = selectedType;
  const genre = genreSelect.value;
  const maxRuntime = RUNTIME_STEPS[Number(maxRuntimeInput.value)].minutes; // null = no cap
  const minRating = Number(minRatingInput.value) / 10; // TMDB's vote_average is 0-10
  const providerIds = getCheckedProviderIds();

  if (providerIds.length === 0) {
    resultBox.classList.add("hidden");
    emptyMessage.textContent = "Tick at least one streaming service.";
    emptyMessage.classList.remove("hidden");
    return;
  }

  pickBtn.disabled = true;
  pickBtn.textContent = "Thinking…";
  resultBox.classList.add("hidden");
  emptyMessage.classList.add("hidden");

  try {
    let candidates = [];
    if (type === "any") {
      const [movies, shows] = await Promise.all([
        fetchCandidates("movie", genre, maxRuntime, minRating, providerIds),
        fetchCandidates("tv", genre, maxRuntime, minRating, providerIds),
      ]);
      candidates = [...movies, ...shows];
    } else {
      candidates = await fetchCandidates(type, genre, maxRuntime, minRating, providerIds);
    }

    if (candidates.length === 0) {
      emptyMessage.textContent = "Nothing matches those filters — try widening one of them.";
      emptyMessage.classList.remove("hidden");
      return;
    }

    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    await renderPick(pick, providerIds);
  } catch (err) {
    emptyMessage.textContent = `Something went wrong talking to TMDB (${err.message}).`;
    emptyMessage.classList.remove("hidden");
  } finally {
    pickBtn.disabled = false;
    pickBtn.textContent = "Suggest some options 🎲";
  }
}

pickBtn.addEventListener("click", pickSomething);

// Load the genre list as soon as the page opens.
loadGenres().catch(err => {
  emptyMessage.textContent = `Couldn't load genres from TMDB (${err.message}).`;
  emptyMessage.classList.remove("hidden");
});
