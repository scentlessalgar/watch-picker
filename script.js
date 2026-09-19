// ============================================================
// FIREBASE SETUP
// ============================================================
// These values identify which Firebase project this app talks to — public
// by design (same idea as the TMDB token above), the actual security comes
// from the sign-in requirement and the database rules we set up later.
const firebaseConfig = {
  apiKey: "AIzaSyCziyI7v2VdwEnAglCqC3Ui6Z12YLIh9fE",
  authDomain: "what2watch-32da6.firebaseapp.com",
  projectId: "what2watch-32da6",
  storageBucket: "what2watch-32da6.firebasestorage.app",
  messagingSenderId: "857317886561",
  appId: "1:857317886561:web:deb8ecce131785a9f9f820",
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ============================================================
// SIGN-IN UI
// ============================================================
const authStatus = document.getElementById("authStatus");
const signInBtn = document.getElementById("signInBtn");
const signOutBtn = document.getElementById("signOutBtn");
const authDialog = document.getElementById("authDialog");
const authClose = document.getElementById("authClose");
const googleSignInBtn = document.getElementById("googleSignInBtn");
const authEmail = document.getElementById("authEmail");
const authPassword = document.getElementById("authPassword");
const authError = document.getElementById("authError");
const authSignInBtn = document.getElementById("authSignInBtn");
const authCreateBtn = document.getElementById("authCreateBtn");
const googleProvider = new firebase.auth.GoogleAuthProvider();

function showAuthError(message) {
  authError.textContent = message;
  authError.classList.remove("hidden");
}

signInBtn.addEventListener("click", () => {
  authError.classList.add("hidden");
  authEmail.value = "";
  authPassword.value = "";
  authDialog.showModal();
});
authClose.addEventListener("click", () => authDialog.close());
authDialog.addEventListener("click", e => {
  if (e.target === authDialog) authDialog.close(); // backdrop click
});

googleSignInBtn.addEventListener("click", () => {
  auth.signInWithPopup(googleProvider)
    .then(() => authDialog.close())
    .catch(err => showAuthError(err.message));
});

authSignInBtn.addEventListener("click", () => {
  auth.signInWithEmailAndPassword(authEmail.value, authPassword.value)
    .then(() => authDialog.close())
    .catch(err => showAuthError(err.message));
});

// Deliberately simple: "Create account" just calls Firebase's sign-up
// function directly from the same form, rather than a separate page.
authCreateBtn.addEventListener("click", () => {
  auth.createUserWithEmailAndPassword(authEmail.value, authPassword.value)
    .then(() => authDialog.close())
    .catch(err => showAuthError(err.message));
});

signOutBtn.addEventListener("click", () => auth.signOut());

// The single source of truth for what the header shows — fires immediately
// on page load (telling us if someone's already signed in) and again
// every time sign-in/out happens.
auth.onAuthStateChanged(user => {
  if (user) {
    authStatus.textContent = `Signed in as ${user.email || user.displayName}`;
    signInBtn.classList.add("hidden");
    signOutBtn.classList.remove("hidden");

    // Load this account's saved streaming services, if they've saved any before.
    db.collection("users").doc(user.uid).get().then(docSnap => {
      const services = docSnap.exists ? docSnap.data().services : null;
      if (Array.isArray(services)) {
        savedServiceNames = new Set(services);
        applySavedServicesToButtons();
      }
    }).catch(err => console.error("Couldn't load saved services:", err));
  } else {
    authStatus.textContent = "Not signed in";
    signInBtn.classList.remove("hidden");
    signOutBtn.classList.add("hidden");
    savedServiceNames = null; // don't carry a signed-out user's preferences forward
  }
});

// ============================================================
// CONFIG
// ============================================================
const TMDB_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI2MmE2NDQ4NGZkZTVjZTE2YjU3MDFhNmUyNzA5ZmEwNyIsIm5iZiI6MTc4OTMxNDU0Ni44OCwic3ViIjoiNmFhNmM1ZjJhNWUyMjBhOTM5YTk4MWM3Iiwic2NvcGVzIjpbImFwaV9yZWFkIl0sInZlcnNpb24iOjF9._8bREwsUIY-yzu8RYJ7WEK6FJFqIImvpc7yhB0OUIWw";
const API_BASE = "https://api.themoviedb.org/3";
const IMG_BASE = "https://image.tmdb.org/t/p/w342"; // posters
const LOGO_BASE = "https://image.tmdb.org/t/p/w92"; // service logos — smaller, no need for poster-size
const REGION = "GB";
const OPTIONS_COUNT = 4; // how many suggestions to show per click

// UK age ratings, in increasing order of restrictiveness. Picking one in the
// filter allows it and everything below it (e.g. "12" allows U, PG and 12).
// TMDB records a slightly different certification string for a movie's
// cinema release ("12A") than for a TV show ("12") — same tier, different label.
const RATINGS = [
  { code: "U", movieCert: "U", tvCert: "U" },
  { code: "PG", movieCert: "PG", tvCert: "PG" },
  { code: "12", movieCert: "12A", tvCert: "12" },
  { code: "15", movieCert: "15", tvCert: "15" },
  { code: "18", movieCert: "18", tvCert: "18" },
];
function ratingOrder(code) {
  return RATINGS.findIndex(r => r.code === code);
}

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

// A small emoji per genre, purely decorative. TMDB's movie and TV genre
// lists don't quite match (e.g. "Science Fiction" vs "Sci-Fi & Fantasy"),
// so this covers both wordings. Anything not listed here just gets a
// generic clapperboard rather than breaking.
const GENRE_ICONS = {
  "Action": "💥",
  "Action & Adventure": "💥",
  "Adventure": "🧭",
  "Animation": "🎨",
  "Comedy": "😂",
  "Crime": "🕵️",
  "Documentary": "🎥",
  "Drama": "🎭",
  "Family": "👨‍👩‍👧‍👦",
  "Fantasy": "🧙",
  "History": "🏛️",
  "Horror": "😱",
  "Kids": "🧸",
  "Music": "🎵",
  "Mystery": "🔍",
  "News": "📰",
  "Reality": "📺",
  "Romance": "💕",
  "Sci-Fi & Fantasy": "🚀",
  "Science Fiction": "🚀",
  "Soap": "🧼",
  "Talk": "🎙️",
  "Thriller": "🔪",
  "TV Movie": "📺",
  "War": "🪖",
  "War & Politics": "🪖",
  "Western": "🤠",
};
function genreIcon(name) {
  return GENRE_ICONS[name] || "🎬";
}

// Genre picker: a button that opens a popup grid of pills, rather than a
// long dropdown. Multi-select — selectedGenres is a set of genre names,
// and an EMPTY set means "Any" (no restriction, i.e. every genre).
const genreBtn = document.getElementById("genreBtn");
const genreDialog = document.getElementById("genreDialog");
const genreGrid = document.getElementById("genreGrid");
const genreClose = document.getElementById("genreClose");
const genreOk = document.getElementById("genreOk");
const genreCancel = document.getElementById("genreCancel");
const selectedGenres = new Set();
let genreSnapshot = new Set(); // what selectedGenres looked like before this open, for Cancel to restore

genreBtn.addEventListener("click", () => {
  genreSnapshot = new Set(selectedGenres);
  genreDialog.showModal();
});

// Any way of leaving the dialog other than clicking OK discards changes:
// the X, Cancel, clicking the dimmed backdrop, or pressing Escape.
genreOk.addEventListener("click", () => genreDialog.close("ok"));
genreCancel.addEventListener("click", () => genreDialog.close("cancel"));
genreClose.addEventListener("click", () => genreDialog.close("cancel"));
genreDialog.addEventListener("click", e => {
  if (e.target === genreDialog) genreDialog.close("cancel"); // click on the backdrop itself
});
genreDialog.addEventListener("close", () => {
  if (genreDialog.returnValue !== "ok") {
    selectedGenres.clear();
    genreSnapshot.forEach(name => selectedGenres.add(name));
    refreshChipStates();
    updateGenreButtonLabel();
  }
  genreDialog.returnValue = "";
});

function updateGenreButtonLabel() {
  if (selectedGenres.size === 0) {
    genreBtn.textContent = "Any";
    return;
  }
  const names = [...selectedGenres];
  const first = `${genreIcon(names[0])} ${names[0]}`;
  genreBtn.textContent = names.length === 1 ? first : `${first} +${names.length - 1} more`;
}

function refreshChipStates() {
  genreGrid.querySelectorAll(".chip").forEach(chip => {
    const isAnyChip = chip.dataset.genre === "any";
    const isActive = isAnyChip ? selectedGenres.size === 0 : selectedGenres.has(chip.dataset.genre);
    chip.classList.toggle("active", isActive);
  });
}

// Picking "Any" clears everything (equivalent to selecting every genre).
// Picking a specific genre toggles it on/off; the dialog stays open so
// several can be picked in one go.
function toggleGenre(name) {
  if (name === "any") {
    selectedGenres.clear();
  } else if (selectedGenres.has(name)) {
    selectedGenres.delete(name);
  } else {
    selectedGenres.add(name);
  }
  refreshChipStates();
  updateGenreButtonLabel();
}

async function loadGenres() {
  const [movies, shows] = await Promise.all([
    tmdb("/genre/movie/list", { language: "en-GB" }),
    tmdb("/genre/tv/list", { language: "en-GB" }),
  ]);
  movies.genres.forEach(g => (movieGenres[g.name] = g.id));
  shows.genres.forEach(g => (tvGenres[g.name] = g.id));

  const allNames = [...new Set([...Object.keys(movieGenres), ...Object.keys(tvGenres)])].sort();

  genreGrid.innerHTML = "";
  const anyChip = document.createElement("button");
  anyChip.type = "button";
  anyChip.className = "chip active";
  anyChip.dataset.genre = "any";
  anyChip.textContent = "Any";
  anyChip.addEventListener("click", () => toggleGenre("any"));
  genreGrid.appendChild(anyChip);

  allNames.forEach(name => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.dataset.genre = name;
    chip.textContent = `${genreIcon(name)} ${name}`;
    chip.addEventListener("click", () => toggleGenre(name));
    genreGrid.appendChild(chip);
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

// A signed-in user's saved selection, once loaded from Firestore — null
// means "not signed in, or nothing saved yet", i.e. leave the all-on default
// alone. Kept separate from the buttons themselves because the buttons get
// rebuilt (e.g. once logos arrive), and each rebuild needs to reapply this.
let savedServiceNames = null;
function applySavedServicesToButtons() {
  if (!savedServiceNames) return;
  serviceList.querySelectorAll(".service-btn").forEach(btn => {
    btn.classList.toggle("active", savedServiceNames.has(btn.dataset.name));
  });
}

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
    btn.addEventListener("click", () => {
      btn.classList.toggle("active");
      saveServicesIfSignedIn();
    });
    serviceList.appendChild(btn);
  });
  applySavedServicesToButtons(); // reapply whatever we already know, if anything
}
buildServiceButtons(); // show text-only buttons immediately, no waiting on a network call

// While signed in, every tap of a service button saves the full current
// selection straight to that user's Firestore document.
function saveServicesIfSignedIn() {
  const user = auth.currentUser;
  if (!user) return;
  const activeNames = [...serviceList.querySelectorAll(".service-btn.active")].map(b => b.dataset.name);
  db.collection("users").doc(user.uid).set({ services: activeNames }, { merge: true })
    .catch(err => console.error("Couldn't save streaming services:", err));
}

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

// Max age rating — a row of badges, left to right from least to most
// restrictive. Clicking one selects it and everything to its left; defaults
// to "18", i.e. everything included.
const ageRatingGroup = document.getElementById("ageRatingGroup");
let selectedAgeRating = "18";

function applyAgeRatingSelection(code) {
  selectedAgeRating = code;
  const maxOrder = ratingOrder(code);
  ageRatingGroup.querySelectorAll(".rating-btn").forEach(btn => {
    const included = ratingOrder(btn.dataset.value) <= maxOrder;
    btn.classList.toggle("active", included);
    btn.setAttribute("aria-pressed", included ? "true" : "false");
  });
}

ageRatingGroup.querySelectorAll(".rating-btn").forEach(btn => {
  btn.addEventListener("click", () => applyAgeRatingSelection(btn.dataset.value));
});

applyAgeRatingSelection(selectedAgeRating);

// ============================================================
// FETCHING CANDIDATES FROM TMDB
// ============================================================
async function fetchCandidates(mediaType, genreNames, maxRuntime, minRating, providerIds, maxAgeRating) {
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

  // TMDB can filter movies by UK certification directly. "18" means no
  // restriction (every rating is 18 or below), so skip the filter entirely
  // rather than ask TMDB to filter down to something that means "everything".
  if (mediaType === "movie" && maxAgeRating !== "18") {
    const tier = RATINGS.find(r => r.code === maxAgeRating);
    params.certification_country = "GB";
    params["certification.lte"] = tier.movieCert;
  }

  // Empty genreNames means "Any" — no genre filter at all. Otherwise match
  // ANY of the selected genres ("|" = OR), not all of them at once, since
  // requiring every genre simultaneously would be far too restrictive.
  if (genreNames.length > 0) {
    const ids = genreNames.map(n => genreMap[n]).filter(Boolean);
    if (ids.length === 0) return []; // none of the selected genres exist for this media type
    params.with_genres = ids.join("|");
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

  // TV shows have no equivalent server-side certification filter, so this
  // checks each candidate's actual UK content rating and drops anything
  // too old for the selected tier. Skipped entirely for "18" (no restriction).
  if (mediaType === "tv" && maxAgeRating !== "18") {
    results = await filterTvByAgeRating(results, maxAgeRating);
  }

  return results.map(r => ({ ...r, media_type: mediaType }));
}

async function filterTvByAgeRating(shows, maxAgeRating) {
  const maxOrder = ratingOrder(maxAgeRating);
  const checked = await Promise.all(shows.map(async show => {
    try {
      const data = await tmdb(`/tv/${show.id}/content_ratings`);
      const gb = (data.results || []).find(r => r.iso_3166_1 === "GB");
      // No UK rating on file for this show — we can't tell, so don't hide it.
      if (!gb || !gb.rating) return show;
      const order = RATINGS.findIndex(r => r.tvCert === gb.rating);
      return order === -1 || order <= maxOrder ? show : null;
    } catch {
      return show; // a failed lookup shouldn't hide an otherwise-good match
    }
  }));
  return checked.filter(Boolean);
}

// ============================================================
// RENDERING A PICK
// ============================================================
const resultBox = document.getElementById("result");
const emptyMessage = document.getElementById("emptyMessage");
const pickBtn = document.getElementById("pickBtn");

// After a pick (or an empty/error message) appears, bring it into view
// instead of leaving the person to scroll down and find it themselves.
function scrollResultIntoView() {
  const target = resultBox.classList.contains("hidden") ? emptyMessage : resultBox;
  if (target.classList.contains("hidden")) return;
  target.scrollIntoView({ behavior: "smooth", block: "start" });
}

// Builds the markup for one pick — used to render several at once.
async function buildPickCardHtml(pick, providerIds) {
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

  return `
    <div class="pick-card">
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
    </div>
  `;
}

// Renders several picks at once (each does its own provider lookup, in
// parallel) as a swipeable carousel — one card per view, arrows/dots to move.
async function renderPicks(picks, providerIds) {
  const cardsHtml = await Promise.all(picks.map(pick => buildPickCardHtml(pick, providerIds)));

  emptyMessage.classList.add("hidden");
  resultBox.classList.remove("hidden");
  resultBox.innerHTML = `
    <div class="carousel">
      <button type="button" class="carousel-nav prev" aria-label="Previous option">‹</button>
      <div class="carousel-track" id="resultTrack">${cardsHtml.join("")}</div>
      <button type="button" class="carousel-nav next" aria-label="Next option">›</button>
    </div>
    <div class="carousel-dots" id="resultDots">
      ${picks.map((_, i) => `<span class="dot${i === 0 ? " active" : ""}"></span>`).join("")}
    </div>
  `;
  setUpCarousel();
}

// Wires the arrows and dots up to the actual scrolling — the browser's
// native scroll-snap does the "settle on a card" part on its own, this
// just needs to keep the arrows/dots in sync and give the arrows something to do.
function setUpCarousel() {
  const track = document.getElementById("resultTrack");
  if (!track) return;
  const dots = [...document.querySelectorAll("#resultDots .dot")];
  const prevBtn = resultBox.querySelector(".carousel-nav.prev");
  const nextBtn = resultBox.querySelector(".carousel-nav.next");
  const TRACK_GAP = 14; // must match the CSS gap on .carousel-track

  function stepWidth() {
    const card = track.querySelector(".pick-card");
    return card ? card.getBoundingClientRect().width + TRACK_GAP : track.clientWidth;
  }

  function syncControls() {
    prevBtn.disabled = track.scrollLeft <= 4;
    nextBtn.disabled = track.scrollLeft >= track.scrollWidth - track.clientWidth - 4;
    const index = Math.round(track.scrollLeft / stepWidth());
    dots.forEach((dot, i) => dot.classList.toggle("active", i === index));
  }

  prevBtn.addEventListener("click", () => track.scrollBy({ left: -stepWidth(), behavior: "smooth" }));
  nextBtn.addEventListener("click", () => track.scrollBy({ left: stepWidth(), behavior: "smooth" }));
  track.addEventListener("scroll", () => requestAnimationFrame(syncControls));
  syncControls();
}

// ============================================================
// MAIN BUTTON HANDLER
// ============================================================
async function pickSomething() {
  const type = selectedType;
  const genreNames = [...selectedGenres]; // empty array = "Any"
  const maxRuntime = RUNTIME_STEPS[Number(maxRuntimeInput.value)].minutes; // null = no cap
  const minRating = Number(minRatingInput.value) / 10; // TMDB's vote_average is 0-10
  const maxAgeRating = selectedAgeRating; // "U" | "PG" | "12" | "15" | "18"
  const providerIds = getCheckedProviderIds();

  if (providerIds.length === 0) {
    resultBox.classList.add("hidden");
    emptyMessage.textContent = "Tick at least one streaming service.";
    emptyMessage.classList.remove("hidden");
    scrollResultIntoView();
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
        fetchCandidates("movie", genreNames, maxRuntime, minRating, providerIds, maxAgeRating),
        fetchCandidates("tv", genreNames, maxRuntime, minRating, providerIds, maxAgeRating),
      ]);
      candidates = [...movies, ...shows];
    } else {
      candidates = await fetchCandidates(type, genreNames, maxRuntime, minRating, providerIds, maxAgeRating);
    }

    if (candidates.length === 0) {
      emptyMessage.textContent = "Nothing matches those filters — try widening one of them.";
      emptyMessage.classList.remove("hidden");
      return;
    }

    // Show up to 4 different options, not just one, so there's a real choice.
    const shuffled = [...candidates].sort(() => Math.random() - 0.5);
    const picks = shuffled.slice(0, OPTIONS_COUNT);
    await renderPicks(picks, providerIds);
  } catch (err) {
    emptyMessage.textContent = `Something went wrong talking to TMDB (${err.message}).`;
    emptyMessage.classList.remove("hidden");
  } finally {
    pickBtn.disabled = false;
    pickBtn.textContent = "Show me What2Watch";
    scrollResultIntoView();
  }
}

pickBtn.addEventListener("click", pickSomething);

// Load the genre list and service logos as soon as the page opens.
loadGenres().catch(err => {
  emptyMessage.textContent = `Couldn't load genres from TMDB (${err.message}).`;
  emptyMessage.classList.remove("hidden");
});
loadServiceLogos();
