const API_BASE = "https://pokeapi.co/api/v2";
const PAGE_SIZE = 20;
const MAX_TEAM_SIZE = 6;
const FAVORITES_KEY = "retro-dex-favorites";
const TEAM_KEY = "retro-dex-team";

const state = {
    page: 1,
    total: 0,
    currentPokemon: null,
    currentList: [],
    currentType: "",
    favorites: readStorage(FAVORITES_KEY),
    team: readStorage(TEAM_KEY),
    compare: { a: null, b: null },
    pokemonCache: new Map(),
};

const elements = {};

function readStorage(key) {
    try {
        return JSON.parse(localStorage.getItem(key)) || [];
    } catch (error) {
        return [];
    }
}

function writeStorage(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
}

function normalizeName(value) {
    return String(value).toLowerCase().trim().replace(/\s+/g, "-");
}

function formatName(value) {
    return String(value)
        .replace(/-/g, " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function debounce(callback, wait = 350) {
    let timeoutId;
    return (...args) => {
        window.clearTimeout(timeoutId);
        timeoutId = window.setTimeout(() => callback(...args), wait);
    };
}

function setStatus(message) {
    elements.help.textContent = message;
}

function setLoading(isLoading) {
    document.body.classList.toggle("is-loading", isLoading);
}

async function fetchJson(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
    }
    return response.json();
}

async function getPokemon(nameOrId) {
    const key = normalizeName(nameOrId);
    if (state.pokemonCache.has(key)) {
        return state.pokemonCache.get(key);
    }

    const pokemon = await fetchJson(`${API_BASE}/pokemon/${key}`);
    state.pokemonCache.set(key, pokemon);
    state.pokemonCache.set(String(pokemon.id), pokemon);
    state.pokemonCache.set(pokemon.name, pokemon);
    return pokemon;
}

async function loadPokemon(nameOrId) {
    try {
        setLoading(true);
        setStatus("Scanning target...");
        const pokemon = await getPokemon(nameOrId);
        state.currentPokemon = pokemon;
        renderPokemon(pokemon);
        renderPokemonList();
        setStatus("Target locked");
    } catch (error) {
        console.error(error);
        setStatus("Target not found");
    } finally {
        setLoading(false);
    }
}

async function loadPage(page) {
    try {
        setLoading(true);
        state.currentType = "";
        elements.typeFilter.value = "";
        state.page = Math.max(1, page);
        const offset = (state.page - 1) * PAGE_SIZE;
        const data = await fetchJson(`${API_BASE}/pokemon?offset=${offset}&limit=${PAGE_SIZE}`);
        state.total = data.count;
        state.currentList = data.results.map((pokemon) => ({
            name: pokemon.name,
            id: getIdFromPokemonUrl(pokemon.url),
        }));
        renderPokemonList();
        renderPageControls();
        renderTotal();
    } catch (error) {
        console.error(error);
        elements.index.innerHTML = '<p class="terminal-note">Index connection failed.</p>';
    } finally {
        setLoading(false);
    }
}

async function loadType(type) {
    if (!type) {
        loadPage(1);
        return;
    }

    try {
        setLoading(true);
        state.currentType = type;
        const data = await fetchJson(`${API_BASE}/type/${type}`);
        state.currentList = data.pokemon
            .map(({ pokemon }) => ({
                name: pokemon.name,
                id: getIdFromPokemonUrl(pokemon.url),
            }))
            .filter((pokemon) => pokemon.id && pokemon.id <= 1025)
            .sort((a, b) => a.id - b.id);
        renderPokemonList();
        renderPageControls();
        renderTotal();
    } catch (error) {
        console.error(error);
        elements.index.innerHTML = '<p class="terminal-note">Type filter unavailable.</p>';
    } finally {
        setLoading(false);
    }
}

async function loadTypes() {
    const data = await fetchJson(`${API_BASE}/type`);
    data.results
        .filter((type) => !["unknown", "shadow"].includes(type.name))
        .forEach((type) => {
            const option = document.createElement("option");
            option.value = type.name;
            option.textContent = formatName(type.name);
            elements.typeFilter.appendChild(option);
        });
}

function getIdFromPokemonUrl(url) {
    const match = /\/pokemon\/(\d+)\//.exec(url);
    return match ? Number(match[1]) : null;
}

function getArtwork(pokemon) {
    return pokemon.sprites.other["official-artwork"].front_default
        || pokemon.sprites.other.dream_world.front_default
        || pokemon.sprites.front_default;
}

function renderTotal() {
    if (state.currentType) {
        elements.total.textContent = `${state.currentList.length} ${state.currentType.toUpperCase()} TARGETS`;
    } else {
        elements.total.textContent = `${state.total || "----"} POKEAPI TARGETS`;
    }
}

function renderPageControls() {
    const totalPages = Math.ceil(state.total / PAGE_SIZE);
    elements.pageLabel.textContent = state.currentType ? "TYPE" : String(state.page).padStart(2, "0");
    elements.prevPage.disabled = state.currentType || state.page <= 1;
    elements.nextPage.disabled = state.currentType || state.page >= totalPages;
}

function renderPokemonList() {
    elements.index.innerHTML = "";

    if (!state.currentList.length) {
        elements.index.innerHTML = '<p class="terminal-note">No targets in this channel.</p>';
        return;
    }

    state.currentList.forEach((pokemon) => {
        const button = document.createElement("button");
        const isActive = state.currentPokemon?.name === pokemon.name;
        const isFavorite = state.favorites.includes(pokemon.name);
        button.className = `pokemon-row${isActive ? " is-active" : ""}`;
        button.type = "button";
        button.innerHTML = `
            <span>#${String(pokemon.id || "???").padStart(3, "0")}</span>
            <strong>${formatName(pokemon.name)}</strong>
            <em>${isFavorite ? "★" : " "}</em>
        `;
        button.addEventListener("click", () => loadPokemon(pokemon.name));
        elements.index.appendChild(button);
    });
}

function renderPokemon(pokemon) {
    elements.image.src = getArtwork(pokemon);
    elements.image.alt = `${formatName(pokemon.name)} artwork`;
    elements.name.textContent = formatName(pokemon.name);
    elements.id.textContent = `#${String(pokemon.id).padStart(3, "0")}`;
    elements.selectedCode.textContent = `PKMN-${String(pokemon.id).padStart(4, "0")}`;
    document.documentElement.style.setProperty("--type-accent", getTypeColor(pokemon.types[0].type.name));

    renderChips(elements.types, pokemon.types.map(({ type }) => type.name), "type-chip");
    renderChips(elements.abilities, pokemon.abilities.map(({ ability }) => ability.name), "ability-chip");
    renderStats(pokemon.stats);
    renderMoves(pokemon.moves);
    renderFavoriteButton();
}

function renderChips(container, items, className) {
    container.innerHTML = "";
    items.forEach((item) => {
        const chip = document.createElement("span");
        chip.className = `${className} ${item}`;
        chip.textContent = formatName(item);
        container.appendChild(chip);
    });
}

function renderStats(stats) {
    elements.stats.innerHTML = "";
    stats.forEach((stat) => {
        const value = stat.base_stat;
        const row = document.createElement("div");
        row.className = "stat-row";
        row.innerHTML = `
            <span>${stat.stat.name.replace("special-", "sp. ").toUpperCase()}</span>
            <div class="stat-track"><i style="width: ${Math.min(value, 160) / 160 * 100}%"></i></div>
            <strong>${value}</strong>
        `;
        elements.stats.appendChild(row);
    });
}

function renderMoves(moves) {
    const visibleMoves = moves.slice(0, 28);
    elements.movesCount.textContent = `${moves.length} MOVES`;
    elements.moves.innerHTML = "";

    visibleMoves.forEach((move) => {
        const item = document.createElement("div");
        item.className = "move-row";
        item.innerHTML = `
            <strong>${formatName(move.move.name)}</strong>
            <span>${move.version_group_details.length} versions</span>
        `;
        elements.moves.appendChild(item);
    });
}

function renderFavoriteButton() {
    if (!state.currentPokemon) return;
    const isFavorite = state.favorites.includes(state.currentPokemon.name);
    elements.favoriteToggle.textContent = isFavorite ? "★" : "☆";
    elements.favoriteToggle.classList.toggle("is-active", isFavorite);
}

function renderTeam() {
    elements.teamTray.innerHTML = "";
    elements.teamCount.textContent = `${state.team.length}/${MAX_TEAM_SIZE}`;

    Array.from({ length: MAX_TEAM_SIZE }).forEach((_, index) => {
        const pokemon = state.team[index];
        const slot = document.createElement("button");
        slot.className = `team-slot${pokemon ? " is-filled" : ""}`;
        slot.type = "button";
        slot.textContent = pokemon ? formatName(pokemon.name) : "EMPTY";
        slot.title = pokemon ? "Remove from team" : "Empty team slot";
        slot.addEventListener("click", () => {
            if (!pokemon) return;
            state.team = state.team.filter((item) => item.name !== pokemon.name);
            writeStorage(TEAM_KEY, state.team);
            renderTeam();
        });
        elements.teamTray.appendChild(slot);
    });
}

function renderCompare() {
    const { a, b } = state.compare;
    if (!a && !b) {
        elements.comparePanel.innerHTML = '<p class="terminal-note">Set two targets to compare base stats.</p>';
        return;
    }

    const totalA = a ? getStatTotal(a) : 0;
    const totalB = b ? getStatTotal(b) : 0;
    elements.comparePanel.innerHTML = `
        <div class="compare-row">
            <span>A</span>
            <strong>${a ? formatName(a.name) : "EMPTY"}</strong>
            <em>${a ? totalA : "--"}</em>
        </div>
        <div class="compare-row">
            <span>B</span>
            <strong>${b ? formatName(b.name) : "EMPTY"}</strong>
            <em>${b ? totalB : "--"}</em>
        </div>
        <p class="compare-result">${getCompareResult(a, b, totalA, totalB)}</p>
    `;
}

function getStatTotal(pokemon) {
    return pokemon.stats.reduce((total, stat) => total + stat.base_stat, 0);
}

function getCompareResult(a, b, totalA, totalB) {
    if (!a || !b) return "Awaiting second target.";
    if (totalA === totalB) return "Equal base total.";
    return totalA > totalB ? "Slot A has higher base total." : "Slot B has higher base total.";
}

function toggleFavorite() {
    if (!state.currentPokemon) return;

    const name = state.currentPokemon.name;
    if (state.favorites.includes(name)) {
        state.favorites = state.favorites.filter((favorite) => favorite !== name);
    } else {
        state.favorites.push(name);
    }

    writeStorage(FAVORITES_KEY, state.favorites);
    renderFavoriteButton();
    renderPokemonList();
}

function addSelectedToTeam() {
    if (!state.currentPokemon) return;

    const pokemon = {
        id: state.currentPokemon.id,
        name: state.currentPokemon.name,
    };

    const alreadyInTeam = state.team.some((item) => item.name === pokemon.name);
    if (alreadyInTeam) {
        setStatus("Target already in team");
        return;
    }

    if (state.team.length >= MAX_TEAM_SIZE) {
        setStatus("Team tray is full");
        return;
    }

    state.team.push(pokemon);
    writeStorage(TEAM_KEY, state.team);
    renderTeam();
    setStatus("Target added to team");
}

function setCompareSlot(slot) {
    if (!state.currentPokemon) return;
    state.compare[slot] = state.currentPokemon;
    renderCompare();
}

function getTypeColor(type) {
    const colors = {
        normal: "#a8a77a",
        fire: "#ee8130",
        water: "#6390f0",
        electric: "#f7d02c",
        grass: "#7ac74c",
        ice: "#96d9d6",
        fighting: "#c22e28",
        poison: "#a33ea1",
        ground: "#e2bf65",
        flying: "#a98ff3",
        psychic: "#f95587",
        bug: "#a6b91a",
        rock: "#b6a136",
        ghost: "#735797",
        dragon: "#6f35fc",
        dark: "#705746",
        steel: "#b7b7ce",
        fairy: "#d685ad",
    };
    return colors[type] || "#8be870";
}

function bindEvents() {
    elements.prevPage.addEventListener("click", () => loadPage(state.page - 1));
    elements.nextPage.addEventListener("click", () => loadPage(state.page + 1));
    elements.typeFilter.addEventListener("change", (event) => loadType(event.target.value));
    elements.favoriteToggle.addEventListener("click", toggleFavorite);
    elements.addTeam.addEventListener("click", addSelectedToTeam);
    elements.compareA.addEventListener("click", () => setCompareSlot("a"));
    elements.compareB.addEventListener("click", () => setCompareSlot("b"));
    elements.searchInput.addEventListener("input", debounce((event) => {
        const value = normalizeName(event.target.value);
        if (!value) {
            setStatus("Target locked");
            return;
        }
        loadPokemon(value);
    }));
}

function cacheElements() {
    elements.total = document.querySelector("#total-pokemones");
    elements.pageLabel = document.querySelector("#page-label");
    elements.searchInput = document.querySelector("#search-input");
    elements.typeFilter = document.querySelector("#type-filter");
    elements.prevPage = document.querySelector("#prev-page");
    elements.nextPage = document.querySelector("#next-page");
    elements.index = document.querySelector("#indice");
    elements.help = document.querySelector("#ayuda");
    elements.favoriteToggle = document.querySelector("#favorite-toggle");
    elements.image = document.querySelector("#pokemon-imagen");
    elements.id = document.querySelector("#pokemon-id");
    elements.name = document.querySelector("#pokemon-nombre");
    elements.types = document.querySelector("#tipos");
    elements.abilities = document.querySelector("#habilidades");
    elements.stats = document.querySelector("#stats");
    elements.selectedCode = document.querySelector("#selected-code");
    elements.teamCount = document.querySelector("#team-count");
    elements.teamTray = document.querySelector("#team-tray");
    elements.addTeam = document.querySelector("#add-team");
    elements.compareA = document.querySelector("#compare-a");
    elements.compareB = document.querySelector("#compare-b");
    elements.comparePanel = document.querySelector("#compare-panel");
    elements.moves = document.querySelector("#movimientos");
    elements.movesCount = document.querySelector("#moves-count");
}

document.addEventListener("DOMContentLoaded", async () => {
    cacheElements();
    bindEvents();
    renderTeam();
    renderCompare();

    try {
        await Promise.all([loadTypes(), loadPage(1), loadPokemon("bulbasaur")]);
    } catch (error) {
        console.error(error);
        setStatus("Terminal boot failed");
    }
});
