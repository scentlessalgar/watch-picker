// ============================================================
// CONFIG
// ============================================================
const TMDB_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI2MmE2NDQ4NGZkZTVjZTE2YjU3MDFhNmUyNzA5ZmEwNyIsIm5iZiI6MTc4OTMxNDU0Ni44OCwic3ViIjoiNmFhNmM1ZjJhNWUyMjBhOTM5YTk4MWM3Iiwic2NvcGVzIjpbImFwaV9yZWFkIl0sInZlcnNpb24iOjF9._8bREwsUIY-yzu8RYJ7WEK6FJFqIImvpc7yhB0OUIWw";
const API_BASE = "https://api.themoviedb.org/3";
const IMG_BASE = "https://image.tmdb.org/t/p/w342"; // posters
const LOGO_BASE = "https://image.tmdb.org/t/p/w92"; // service logos — smaller, no need for poster-size
const REGION = "GB";

// Streaming services offered as checkboxes. Each maps to one or more TMDB
// provider IDs, because TMDB treats every pricing tier of a service (e.g.
// "with ads") as a separate provider — ticking one checkbox here covers
// every paid tier of that service, so nothing is missed. IDs confirmed
// against TMDB's actual UK provider list (checked 2026-09-14).
const PROVIDERS = [
  { name: "Netflix", ids: [8, 1796] }, // standard, standard-with-ads
  { name: "Prime Video", ids: [9, 2100] }, // included-with-Prime, with-ads
  { name: "Disney+", ids: [337] },
  { name: "Apple TV+", ids: [350] },
  { name: "Paramount+", ids: [531, 2303, 2304] }, // plus, premium, basic-with-ads
  { name: "BBC iPlayer", ids: [38] },
  { name: "Crunchyroll", ids: [283] },
  { name: "NOW TV", ids: [39] },
  { name: "HBO Max", ids: [1899] },
];

// Given a TMDB provider ID (possibly a specific tier), find which of our
// checkbox services it belongs to, so results can be labelled by the
// service name the person recognises rather than TMDB's tier name.
function friendlyNameForProviderId(id) {
  const match = PROVIDERS.find(p => p.ids.includes(id));
  return match ? match.name : null;
}

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

// Builds the toggle buttons. logoById is optional — if we don't have
// logos yet (or the lookup fails), the buttons still work, just as
// text-only pills. All start "on", matching the old checked-by-default checkboxes.
function buildServiceButtons(logoById = {}) {
  serviceList.innerHTML = "";
  PROVIDERS.forEach(service => {
    const logoPath = logoById[service.ids[0]];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "service-btn active";
    btn.dataset.name = service.name;
    btn.innerHTML = logoPath
      ? `<img src="${LOGO_BASE}${logoPath}" alt="">${service.name}`
      : service.name;
    btn.addEventListener("click", () => btn.classList.toggle("active"));
    serviceList.appendChild(btn);
  });
}
buildServiceButtons(); // show text-only buttons immediately, no waiting on a network call

// Once we know each service's logo (from TMDB's own provider list — the
// same source the poster images come from), rebuild the buttons with them.
async function loadServiceLogos() {
  try {
    const data = await tmdb("/watch/providers/movie", { watch_region: REGION });
    const logoById = {};
    data.results.forEach(p => { logoById[p.provider_id] = p.logo_path; });
    buildServiceButtons(logoById);
  } catch {
    // Logos are a nice-to-have — if this fails, the text-only buttons already work fine.
  }
}

// Flattens the toggled-on services into every underlying TMDB provider ID
// (including all their tiers) for use in the actual API query.
function getCheckedProviderIds() {
  const activeNames = [...serviceList.querySelectorAll(".service-btn.active")].map(b => b.dataset.name);
  return PROVIDERS.filter(p => activeNames.includes(p.name)).flatMap(p => p.ids);
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
    matchedNames = [...new Set(
      flatrate
        .filter(p => providerIds.includes(p.provider_id))
        .map(p => friendlyNameForProviderId(p.provider_id))
        .filter(Boolean)
    )];
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

// Load the genre list and service logos as soon as the page opens.
loadGenres().catch(err => {
  emptyMessage.textContent = `Couldn't load genres from TMDB (${err.message}).`;
  emptyMessage.classList.remove("hidden");
});
loadServiceLogos();
