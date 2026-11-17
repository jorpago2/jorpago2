const apiKey = "AIzaSyBBV8ImZHdeWeAsn3uEvSWpAKWfl-GruAo";
const AI_MODELS = ["gemini-2.5-flash-preview-09-2025", "gemini-2.0-flash"];
const FILTERS_STORAGE_KEY = "umdo_publications_filters_v1";
const AI_REQUEST_TIMEOUT_MS = 18000;

let allPubs = [];
let filteredPubs = [];
let globalContext = "";
let publicationIndex = [];
const pubCache = new Map();
let allPublicationsCache = [];
let searchTimer = null;
let filterRunId = 0;
let allTeamMembers = [];
let filteredTeamMembers = [];
let teamSearchTimer = null;

const pubState = {
    year: "all",
    author: "all",
    journal: "all",
    doiOnly: false,
    query: "",
    sort: "year_desc",
    visibleCount: 20,
    pageSize: 20,
    totalBeforePagination: 0
};

const TEAM_GROUP_ORDER = [
    "Faculty",
    "Postdoctoral Researchers",
    "PhD Students",
    "Master Students",
    "Research Staff",
    "Technical and Administration",
    "Alumni",
    "Other Members"
];

const teamState = {
    query: "",
    role: "all",
    line: "all"
};

const DATA_SOURCES = {
    site: "data/site.json",
    research_lines: "data/research-lines.json",
    news: "data/news.json",
    facilities: "data/facilities.json",
    publications_index: "data/publications/index.json",
    projects: "data/projects.json",
    team: "data/team.json",
    conferences: "data/conferences.json"
};

function toggleTheme() {
    const body = document.body;
    const current = body.getAttribute("data-theme");
    const icon = document.getElementById("themeIcon");
    if (current === "light") {
        body.setAttribute("data-theme", "dark");
        icon.textContent = "\u2600";
        localStorage.setItem("theme", "dark");
    } else {
        body.setAttribute("data-theme", "light");
        icon.textContent = "\u263E";
        localStorage.setItem("theme", "light");
    }
}

(function initTheme() {
    const saved = localStorage.getItem("theme");
    if (saved === "light") {
        document.body.setAttribute("data-theme", "light");
        document.getElementById("themeIcon").textContent = "\u263E";
    } else {
        document.body.setAttribute("data-theme", "dark");
        document.getElementById("themeIcon").textContent = "\u2600";
    }
})();

function showPage(id) {
    document.querySelectorAll(".page-section").forEach(el => el.classList.remove("active"));
    document.getElementById(id).classList.add("active");
    window.scrollTo(0, 0);
    document.querySelectorAll(".nav-btn").forEach(btn => btn.classList.remove("active"));
    const activeBtn = Array.from(document.querySelectorAll(".nav-btn")).find(b => b.getAttribute("onclick").includes(id));
    if (activeBtn) activeBtn.classList.add("active");
    document.getElementById("navLinks").classList.remove("active");
}

function toggleMenu() {
    document.getElementById("navLinks").classList.toggle("active");
}

async function fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
    return res.json();
}

function extractYear(value) {
    const m = String(value || "").match(/\d{4}/);
    return m ? Number.parseInt(m[0], 10) : 0;
}

function getSortLabel() {
    const map = {
        year_desc: "Newest First",
        year_asc: "Oldest First",
        title_asc: "Title A-Z",
        journal_asc: "Journal A-Z"
    };
    return map[pubState.sort] || "Newest First";
}

function sortPublications(list) {
    return [...list].sort((a, b) => {
        const ya = extractYear(a.year);
        const yb = extractYear(b.year);

        switch (pubState.sort) {
            case "year_asc":
                if (ya !== yb) return ya - yb;
                return String(a.title || "").localeCompare(String(b.title || ""));
            case "title_asc":
                return String(a.title || "").localeCompare(String(b.title || ""));
            case "journal_asc":
                return String(a.journal || "").localeCompare(String(b.journal || ""));
            case "year_desc":
            default:
                if (ya !== yb) return yb - ya;
                return String(b.title || "").localeCompare(String(a.title || ""));
        }
    });
}

async function loadYearPublications(year) {
    const key = String(year);
    if (pubCache.has(key)) return pubCache.get(key);

    const item = publicationIndex.find(x => String(x.year) === key);
    if (!item || !item.file) {
        pubCache.set(key, []);
        return [];
    }

    const result = await fetchJson(item.file);
    const arr = Array.isArray(result) ? result : [];
    pubCache.set(key, arr);
    return arr;
}

async function ensureAllPublicationsLoaded() {
    if (allPublicationsCache.length > 0) return allPublicationsCache;
    const years = publicationIndex.map(item => String(item.year));
    const groups = await Promise.all(years.map(loadYearPublications));
    allPublicationsCache = groups.flat();
    return allPublicationsCache;
}

function showPublicationSkeletons(count = 4) {
    const container = document.getElementById("pubs-container");
    container.innerHTML = Array.from({ length: count }).map(() => '<div class="pub-skeleton"></div>').join("");
}

function saveFilterState() {
    const payload = {
        year: pubState.year,
        author: pubState.author,
        journal: pubState.journal,
        doiOnly: pubState.doiOnly,
        query: pubState.query,
        sort: pubState.sort
    };
    localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(payload));
}

function restoreFilterState() {
    try {
        const raw = localStorage.getItem(FILTERS_STORAGE_KEY);
        if (!raw) return;
        const saved = JSON.parse(raw);
        pubState.year = saved.year || pubState.year;
        pubState.author = saved.author || pubState.author;
        pubState.journal = saved.journal || pubState.journal;
        pubState.doiOnly = !!saved.doiOnly;
        pubState.query = saved.query || "";
        pubState.sort = saved.sort || pubState.sort;
    } catch (err) {
        console.warn("Could not restore publication filters:", err);
    }
}

function syncControlsWithState() {
    const year = document.getElementById("yearFilter");
    const author = document.getElementById("authorFilter");
    const journal = document.getElementById("journalFilter");
    const doiOnly = document.getElementById("doiOnlyFilter");
    const search = document.getElementById("pubSearch");
    const sort = document.getElementById("sortSelect");

    if (year) year.value = pubState.year;
    if (author) author.value = pubState.author;
    if (journal) journal.value = pubState.journal;
    if (doiOnly) doiOnly.checked = pubState.doiOnly;
    if (search) search.value = pubState.query;
    if (sort) sort.value = pubState.sort;
}

function getFirstAuthor(authors) {
    if (!authors) return "";
    return String(authors).split(",")[0].trim();
}

function buildSelectOptions(list, currentValue, allLabel, valueExtractor) {
    const values = list.map(valueExtractor).map(v => String(v || "").trim()).filter(Boolean);
    const counts = new Map();
    values.forEach(v => counts.set(v, (counts.get(v) || 0) + 1));

    const sorted = [...counts.entries()]
        .sort((a, b) => {
            if (b[1] !== a[1]) return b[1] - a[1];
            return a[0].localeCompare(b[0]);
        })
        .slice(0, 150)
        .map(x => x[0]);

    const options = ["<option value=\"all\">" + allLabel + "</option>"];
    sorted.forEach(v => options.push(`<option value="${v.replace(/"/g, "&quot;")}">${v}</option>`));

    return {
        html: options.join(""),
        isCurrentValid: currentValue === "all" || sorted.includes(currentValue)
    };
}

function updateFacetOptions(baseList) {
    const authorSelect = document.getElementById("authorFilter");
    const journalSelect = document.getElementById("journalFilter");

    const authorOptions = buildSelectOptions(baseList, pubState.author, "Any Author", item => getFirstAuthor(item.authors));
    const journalOptions = buildSelectOptions(baseList, pubState.journal, "Any Journal", item => item.journal);

    authorSelect.innerHTML = authorOptions.html;
    journalSelect.innerHTML = journalOptions.html;

    if (!authorOptions.isCurrentValid) pubState.author = "all";
    if (!journalOptions.isCurrentValid) pubState.journal = "all";

    authorSelect.value = pubState.author;
    journalSelect.value = pubState.journal;
}

function renderActiveFilters() {
    const chips = [];
    if (pubState.query) chips.push(`Query: ${pubState.query}`);
    if (pubState.year !== "all") chips.push(`Year: ${pubState.year}`);
    if (pubState.author !== "all") chips.push(`Author: ${pubState.author}`);
    if (pubState.journal !== "all") chips.push(`Journal: ${pubState.journal}`);
    if (pubState.doiOnly) chips.push("With DOI");
    chips.push(`Sort: ${getSortLabel()}`);

    const wrap = document.getElementById("pubActiveFilters");
    wrap.innerHTML = chips.map(c => `<span class="filter-chip">${escapeHtml(c)}</span>`).join("");
}

function renderPublicationSummary() {
    const summary = document.getElementById("pubSummary");
    const showing = Math.min(pubState.visibleCount, pubState.totalBeforePagination);
    summary.textContent = `Displaying ${showing} of ${pubState.totalBeforePagination} publication records`;
}

function renderFeaturedPubs(list) {
    const container = document.getElementById("featured-pubs");
    const featured = sortPublications(list).slice(0, 3);

    if (featured.length === 0) {
        container.innerHTML = '<div style="color:var(--text-muted);font-size:0.9rem;">No highlighted publications match the current filters.</div>';
        return;
    }

    container.innerHTML = `
        <div class="featured-grid">
            ${featured.map((item, idx) => {
                const title = escapeHtml(item.title || "Untitled");
                const meta = `${escapeHtml(item.journal || "Unknown journal")} · ${escapeHtml(item.year || "n/a")}`;
                const cls = idx === 0 ? "featured-item featured-main" : "featured-item";
                if (item.doi) {
                    return `<article class="${cls}"><a href="${item.doi}" target="_blank">${title}</a><small>${meta}</small></article>`;
                }
                return `<article class="${cls}"><span>${title}</span><small>${meta}</small></article>`;
            }).join("")}
        </div>`;
}

function applyPublicationFilters(list) {
    const q = pubState.query.toLowerCase().trim();
    let result = [...list];

    if (pubState.author !== "all") {
        result = result.filter(p => getFirstAuthor(p.authors) === pubState.author);
    }

    if (pubState.journal !== "all") {
        result = result.filter(p => String(p.journal || "") === pubState.journal);
    }

    if (pubState.doiOnly) {
        result = result.filter(p => !!String(p.doi || "").trim());
    }

    if (q) {
        result = result.filter(p => {
            const hay = `${p.title || ""} ${p.authors || ""} ${p.journal || ""}`.toLowerCase();
            return hay.includes(q);
        });
    }

    return sortPublications(result);
}

async function loadData() {
    try {
        restoreFilterState();

        const entries = Object.entries(DATA_SOURCES);
        const settled = await Promise.allSettled(entries.map(([_, url]) => fetchJson(url)));

        const data = {
            group_description: "",
            research_lines: [],
            news: [],
            facilities: {},
            publications_index: [],
            projects: [],
            team: [],
            conferences: []
        };

        const failed = [];
        settled.forEach((result, idx) => {
            const [key, url] = entries[idx];
            if (result.status === "fulfilled") {
                if (key === "site") data.group_description = result.value.group_description || "";
                else data[key] = result.value || [];
            } else {
                failed.push(url);
                console.warn("DATA PARTIAL ERROR:", result.reason);
            }
        });

        if (failed.length === entries.length) {
            throw new Error("No data files could be loaded from /data.");
        }

        publicationIndex = Array.isArray(data.publications_index) ? data.publications_index : [];
        render(data);
        initFilters();
        showPublicationSkeletons();
        await filterPubs({ resetVisible: false });

        globalContext = generateContext({ ...data, publications: allPubs });

        if (failed.length && document.getElementById("news-container")) {
            const warning = `<div style="grid-column:1/-1;text-align:center;color:var(--text-muted);font-size:0.9rem;">Some sections could not be loaded: ${failed.join(", ")}</div>`;
            document.getElementById("news-container").insertAdjacentHTML("beforeend", warning);
        }
    } catch (err) {
        console.error("DATA ERROR:", err);
        const errorHTML = `
            <div class="error-msg">
                <span class="error-title">Data loading error</span>
                ${err.message}<br><br>
                <small>Check that all JSON files exist in the <code>data/</code> folder.</small>
            </div>`;

        if (document.getElementById("news-container")) {
            document.getElementById("news-container").innerHTML = errorHTML;
        }

        const errorSimple = '<div style="text-align:center;color:var(--text-muted);">Unable to load records.</div>';
        document.getElementById("pubs-container").innerHTML = errorSimple;
        document.getElementById("projects-container").innerHTML = errorSimple;
        document.getElementById("team-container").innerHTML = errorSimple;

        const researchContainer = document.getElementById("research-container");
        if (researchContainer) researchContainer.innerHTML = errorSimple;

        globalContext = "Error: Data could not be loaded from server.";
    }
}

function generateContext(data) {
    const news = (data.news || []).map(n => n.title).join(", ");
    const projects = (data.projects || []).map(p => p.title).join(", ");
    const team = (data.team || []).map(t => `${t.name} (${t.role})`).join(", ");
    const pubs = (data.publications || []).slice(0, 5).map(p => p.title).join(", ");
    const research = (data.research_lines || []).map(r => r.title).join(", ");

    return `You are the AI Assistant for the UMDO+ Research Group (Optoelectronics).
Use only available website context and state uncertainty when information is missing.
Respond in concise, readable markdown with short paragraphs and bullets when useful.
Research Lines: ${research}.
News: ${news}.
Projects: ${projects}.
Team: ${team}.
Recent Papers: ${pubs}.`;
}

function render(data) {
    const newsContainer = document.getElementById("news-container");
    if (newsContainer && !newsContainer.innerHTML.includes("error-msg")) {
        newsContainer.innerHTML = (data.news || []).map(n => `
            <div class="card"><span class="card-tag">${n.tag}</span><div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:0.5rem;">${n.date}</div><h3>${n.title}</h3><p>${n.content}</p></div>`).join("");
    }

    document.getElementById("projects-container").innerHTML = (data.projects || []).map(p => `
        <div class="card"><h3>${p.title}</h3><div class="card-tag" style="border-color:var(--text-muted);color:var(--text-muted);">${p.ref}</div><p>${p.desc}</p></div>`).join("");

    renderFacilities(data.facilities || {});

    allTeamMembers = Array.isArray(data.team) ? data.team : [];
    initTeamControls();
    applyTeamFilters();

    const researchContainer = document.getElementById("research-container");
    if (researchContainer && data.research_lines) {
        researchContainer.innerHTML = data.research_lines.map(r => `
            <div class="card">
                <span class="card-tag">${r.tag}</span>
                <h3>${r.title} <span style="font-size:0.8em; color:var(--secondary); margin-left:5px;">(${r.acronym})</span></h3>
                <p>${r.content}</p>
            </div>
        `).join("");
    }
}

function renderFacilities(facilities) {
    const availableContainer = document.getElementById("facilities-available-container");
    if (!availableContainer) return;

    const available = (Array.isArray(facilities.available_labs) ? facilities.available_labs : [])
        .filter(item => String(item.line_group || "").toUpperCase().includes("UMDO+"));

    if (!available.length) {
        availableContainer.innerHTML = '<div style="color:var(--text-muted);">No current UMDO+ infrastructure records loaded.</div>';
    } else {
        availableContainer.innerHTML = available.map(item => {
            const tools = Array.isArray(item.equipment) ? item.equipment : [];
            return `
                <article class="card">
                    <div class="facility-line">${escapeHtml(item.line_group || "ICMUV")}</div>
                    <h3>${escapeHtml(item.laboratory || "Laboratory")}</h3>
                    <ul class="facility-list">
                        ${tools.slice(0, 6).map(t => `<li>${escapeHtml(t)}</li>`).join("")}
                    </ul>
                    ${tools.length > 6 ? `<div class="facility-meta">+${tools.length - 6} additional systems available.</div>` : ""}
                </article>`;
        }).join("");
    }
}

function slugify(text) {
    return String(text || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function getTeamGroup(member) {
    if (member.category) return String(member.category);

    const role = String(member.role || "").toLowerCase();
    if (/postdoc/.test(role)) return "Postdoctoral Researchers";
    if (/phd|doctoral|predoc/.test(role)) return "PhD Students";
    if (/master/.test(role)) return "Master Students";
    if (/professor|faculty|lecturer/.test(role)) return "Faculty";
    if (/research staff|researcher|scientist/.test(role)) return "Research Staff";
    if (/technician|engineer|administration|admin|manager/.test(role)) return "Technical and Administration";
    if (/alumni|former/.test(role)) return "Alumni";
    return "Other Members";
}

function getTeamLines(member) {
    return String(member.research_line || "")
        .split(/[;,/|]+/)
        .map(x => x.trim())
        .filter(Boolean);
}

function buildTeamSocialLinks(member) {
    let socialHTML = '<div class="social-links">';
    if (member.website) socialHTML += `<a href="${member.website}" target="_blank" class="social-btn" title="Web"><svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg></a>`;
    if (member.linkedin) socialHTML += `<a href="${member.linkedin}" target="_blank" class="social-btn" title="LinkedIn"><svg viewBox="0 0 24 24"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.239-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg></a>`;
    if (member.orcid) socialHTML += `<a href="${member.orcid}" target="_blank" class="social-btn orcid" title="ORCID"><svg viewBox="0 0 24 24"><path d="M12 0C5.372 0 0 5.372 0 12s5.372 12 12 12 12-5.372 12-12S18.628 0 12 0zM7.369 4.378c.525 0 .947.431.947.947s-.422.947-.947.947a.95.95 0 0 1-.947-.947c0-.525.422-.947.947-.947zm-.722 3.038h1.444v10.041H6.647V7.416zm3.562 0h3.9c3.712 0 5.344 2.653 5.344 5.025 0 2.578-2.016 5.025-5.325 5.025h-3.919V7.416zm1.444 1.306v7.444h2.297c3.325 0 4.088-2.4 4.088-3.713 0-1.844-1.059-3.731-4.063-3.731h-2.322z"/></svg></a>`;
    socialHTML += "</div>";
    return socialHTML;
}

function initTeamControls() {
    const roleSelect = document.getElementById("teamRoleFilter");
    const lineSelect = document.getElementById("teamLineFilter");
    const searchInput = document.getElementById("teamSearch");

    const roles = [...new Set(allTeamMembers.map(getTeamGroup))].sort((a, b) => {
        const ia = TEAM_GROUP_ORDER.indexOf(a);
        const ib = TEAM_GROUP_ORDER.indexOf(b);
        if (ia === -1 && ib === -1) return a.localeCompare(b);
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
    });

    const lines = [...new Set(allTeamMembers.flatMap(getTeamLines))].sort((a, b) => a.localeCompare(b));

    roleSelect.innerHTML = '<option value="all">All Categories</option>' +
        roles.map(r => `<option value="${String(r).replace(/"/g, "&quot;")}">${escapeHtml(r)}</option>`).join("");
    lineSelect.innerHTML = '<option value="all">All Research Lines</option>' +
        lines.map(l => `<option value="${String(l).replace(/"/g, "&quot;")}">${escapeHtml(l)}</option>`).join("");

    if (![...roleSelect.options].some(o => o.value === teamState.role)) teamState.role = "all";
    if (![...lineSelect.options].some(o => o.value === teamState.line)) teamState.line = "all";

    roleSelect.value = teamState.role;
    lineSelect.value = teamState.line;
    searchInput.value = teamState.query;
}

function handleTeamFilterInput() {
    const input = document.getElementById("teamSearch");
    teamState.query = input.value.trim();
    if (teamSearchTimer) clearTimeout(teamSearchTimer);
    teamSearchTimer = setTimeout(() => applyTeamFilters(), 220);
}

function renderTeamIndex(groups) {
    const teamIndex = document.getElementById("teamIndex");
    teamIndex.innerHTML = groups.map(([groupName]) => {
        const id = `team-group-${slugify(groupName)}`;
        return `<a href="#${id}">${escapeHtml(groupName)}</a>`;
    }).join("");
}

function renderTeamGroups(members) {
    const container = document.getElementById("team-container");
    const summary = document.getElementById("teamSummary");

    if (!members.length) {
        summary.textContent = "No personnel profiles found for the current filters.";
        container.innerHTML = '<div style="text-align:center;color:var(--text-muted);">No matching personnel profiles.</div>';
        document.getElementById("teamIndex").innerHTML = "";
        return;
    }

    summary.textContent = `Displaying ${members.length} personnel profiles`;

    const groupedMap = new Map();
    members.forEach(member => {
        const group = getTeamGroup(member);
        if (!groupedMap.has(group)) groupedMap.set(group, []);
        groupedMap.get(group).push(member);
    });

    const groups = [...groupedMap.entries()].sort((a, b) => {
        const ia = TEAM_GROUP_ORDER.indexOf(a[0]);
        const ib = TEAM_GROUP_ORDER.indexOf(b[0]);
        if (ia === -1 && ib === -1) return a[0].localeCompare(b[0]);
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
    });

    renderTeamIndex(groups);

    container.innerHTML = groups.map(([groupName, groupMembers]) => {
        const id = `team-group-${slugify(groupName)}`;
        const cards = groupMembers
            .slice()
            .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
            .map((member, idx) => {
                const extraId = `team-extra-${id}-${idx}`;
                const lines = getTeamLines(member);
                const lineText = lines.length ? lines.join(" / ") : "Not specified";
                return `
                    <div class="card team-card">
                        <img src="${member.avatar}" class="team-img" alt="${escapeHtml(member.name || "")}">
                        <h3>${escapeHtml(member.name || "")}</h3>
                        <div class="role">${escapeHtml(groupName)}</div>
                        <div class="team-role-meta">${escapeHtml(member.role || "")}</div>
                        <span class="research-badge">${escapeHtml(lineText)}</span>
                        <button class="team-toggle" data-target="${extraId}" onclick="toggleTeamExtra(this)">View profile details</button>
                        <div id="${extraId}" class="team-extra">
                            Research lines: ${escapeHtml(lineText)}
                        </div>
                        ${buildTeamSocialLinks(member)}
                    </div>`;
            }).join("");

        return `
            <section class="team-group" id="${id}">
                <div class="team-group-title">
                    <span>${escapeHtml(groupName)}</span>
                    <span class="team-count">${groupMembers.length}</span>
                </div>
                <div class="team-grid">${cards}</div>
            </section>`;
    }).join("");
}

function applyTeamFilters() {
    const role = document.getElementById("teamRoleFilter").value;
    const line = document.getElementById("teamLineFilter").value;
    const query = document.getElementById("teamSearch").value.trim().toLowerCase();

    teamState.role = role;
    teamState.line = line;
    teamState.query = document.getElementById("teamSearch").value.trim();

    filteredTeamMembers = allTeamMembers.filter(member => {
        if (role !== "all" && getTeamGroup(member) !== role) return false;
        if (line !== "all" && !getTeamLines(member).includes(line)) return false;

        if (query) {
            const hay = `${member.name || ""} ${member.role || ""} ${member.research_line || ""}`.toLowerCase();
            if (!hay.includes(query)) return false;
        }
        return true;
    });

    renderTeamGroups(filteredTeamMembers);
}

function toggleTeamExtra(btn) {
    const targetId = btn.getAttribute("data-target");
    const box = document.getElementById(targetId);
    if (!box) return;
    box.classList.toggle("open");
    btn.textContent = box.classList.contains("open") ? "Hide profile details" : "View profile details";
}

function initFilters() {
    const yearSelect = document.getElementById("yearFilter");
    const years = publicationIndex
        .map(x => String(x.year))
        .filter(y => y && y !== "unknown")
        .sort((a, b) => extractYear(b) - extractYear(a));

    yearSelect.innerHTML = '<option value="all">Any Year</option>';
    years.forEach(y => {
        const opt = document.createElement("option");
        opt.value = y;
        opt.textContent = y;
        yearSelect.appendChild(opt);
    });

    if (!years.includes(pubState.year)) {
        pubState.year = years[0] || "all";
    }

    syncControlsWithState();
}

function handleSearchInput() {
    const search = document.getElementById("pubSearch");
    pubState.query = search.value.trim();
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
        pubState.visibleCount = pubState.pageSize;
        filterPubs();
    }, 220);
}

function handleSortChange() {
    const sort = document.getElementById("sortSelect");
    pubState.sort = sort.value;
    pubState.visibleCount = pubState.pageSize;
    filterPubs();
}

function loadMorePubs() {
    pubState.visibleCount += pubState.pageSize;
    allPubs = filteredPubs.slice(0, pubState.visibleCount);
    renderPubs(allPubs);
    renderPublicationSummary();
    updateLoadMoreButton();
}

function updateLoadMoreButton() {
    const btn = document.getElementById("loadMoreBtn");
    const shouldShow = allPubs.length < pubState.totalBeforePagination;
    btn.style.display = shouldShow ? "inline-flex" : "none";
}

async function getBaseListForCurrentYear() {
    if (pubState.year === "all") {
        return ensureAllPublicationsLoaded();
    }
    return loadYearPublications(pubState.year);
}

async function filterPubs(options = {}) {
    const runId = ++filterRunId;
    const resetVisible = options.resetVisible !== false;

    const year = document.getElementById("yearFilter").value;
    const author = document.getElementById("authorFilter").value;
    const journal = document.getElementById("journalFilter").value;
    const doiOnly = document.getElementById("doiOnlyFilter").checked;
    const sort = document.getElementById("sortSelect").value;

    pubState.year = year;
    pubState.author = author;
    pubState.journal = journal;
    pubState.doiOnly = doiOnly;
    pubState.sort = sort;

    if (resetVisible) pubState.visibleCount = pubState.pageSize;

    saveFilterState();
    showPublicationSkeletons(3);

    try {
        const baseList = await getBaseListForCurrentYear();
        if (runId !== filterRunId) return;

        updateFacetOptions(baseList);
        syncControlsWithState();

        filteredPubs = applyPublicationFilters(baseList);
        pubState.totalBeforePagination = filteredPubs.length;
        allPubs = filteredPubs.slice(0, pubState.visibleCount);

        renderFeaturedPubs(filteredPubs);
        renderPubs(allPubs);
        renderActiveFilters();
        renderPublicationSummary();
        updateLoadMoreButton();
    } catch (err) {
        console.error("PUBLICATIONS ERROR:", err);
        document.getElementById("pubs-container").innerHTML = '<div style="text-align:center;color:var(--text-muted);">Unable to load publication records.</div>';
    }
}

function citationFromPaper(p) {
    const parts = [];
    if (p.authors) parts.push(String(p.authors));
    if (p.year) parts.push(`(${p.year})`);
    if (p.title) parts.push(`${p.title}.`);

    let journalPart = p.journal || "";
    if (p.volume) journalPart += ` ${p.volume}`;
    if (p.pages) journalPart += `, ${p.pages}`;
    if (journalPart) parts.push(`${journalPart}.`);
    if (p.doi) parts.push(p.doi);

    return parts.join(" ").replace(/\s+/g, " ").trim();
}

async function copyCitation(encodedPaper) {
    try {
        const p = JSON.parse(decodeURIComponent(encodedPaper));
        await copyTextToClipboard(citationFromPaper(p));
        showToast("Citation copied");
    } catch (err) {
        console.warn("Copy citation failed:", err);
        showToast("Could not copy citation", "error");
    }
}

async function sharePublication(encodedPaper) {
    try {
        const p = JSON.parse(decodeURIComponent(encodedPaper));
        const title = p.title || "Publication";
        const text = citationFromPaper(p);
        const url = p.doi || window.location.href;

        if (navigator.share) {
            await navigator.share({ title, text, url });
            return;
        }

        await navigator.clipboard.writeText(`${text}\n${url}`);
    } catch (err) {
        console.warn("Share publication failed:", err);
    }
}

function togglePubMeta(btn) {
    const targetId = btn.getAttribute("data-target");
    const meta = document.getElementById(targetId);
    if (!meta) return;
    meta.classList.toggle("open");
    btn.textContent = meta.classList.contains("open") ? "Hide metadata" : "View metadata";
}

function renderPubs(pubs) {
    const c = document.getElementById("pubs-container");
    if (!pubs || pubs.length === 0) {
        c.innerHTML = '<div style="text-align:center;color:var(--text-muted);">No publication records found. Try adjusting one or more filters.</div>';
        return;
    }

    c.innerHTML = pubs.map((p, idx) => {
        const doiLink = p.doi
            ? `<a href="${p.doi}" target="_blank" class="pub-title-link">${escapeHtml(p.title || "Untitled")}</a>`
            : `<span style="font-weight:700; color:var(--primary);">${escapeHtml(p.title || "Untitled")}</span>`;
        const volume = p.volume ? `<strong>${escapeHtml(String(p.volume))}</strong>` : "";
        const pages = p.pages ? `, ${escapeHtml(String(p.pages))}` : "";
        const idSuffix = `${extractYear(p.year)}-${idx}`;
        const metaId = `pub-meta-extra-${idSuffix}`;

        const payload = encodeURIComponent(JSON.stringify({
            title: p.title || "",
            authors: p.authors || "",
            year: p.year || "",
            journal: p.journal || "",
            volume: p.volume || "",
            pages: p.pages || "",
            doi: p.doi || ""
        }));

        const doiBtn = p.doi
            ? `<a class="mini-btn" href="${p.doi}" target="_blank">View DOI</a>`
            : "";

        return `
        <div class="pub-item">
            <div class="pub-year">${escapeHtml(String(p.year || ""))}</div>
            <div class="pub-content">
                ${doiLink}
                <div class="pub-tags">
                    <span class="pub-tag">${escapeHtml(String(p.journal || "Unknown journal"))}</span>
                    ${p.doi ? '<span class="pub-tag pub-tag-doi">DOI</span>' : ""}
                </div>
                <div class="pub-authors">${escapeHtml(String(p.authors || ""))}</div>
                <div class="pub-meta">
                    <span style="font-style:italic;">${escapeHtml(String(p.journal || ""))}</span> ${volume}${pages}
                </div>
                <div id="${metaId}" class="pub-meta-extra">Volume: ${escapeHtml(String(p.volume || "n/a"))} | Pages: ${escapeHtml(String(p.pages || "n/a"))} | DOI: ${escapeHtml(String(p.doi || "n/a"))}</div>
                <div class="pub-actions">
                    <button class="mini-btn" onclick="copyCitation('${payload}')">Copy Citation</button>
                    ${doiBtn ? doiBtn.replace('mini-btn', 'mini-btn mini-btn-primary') : ""}
                    <button class="mini-btn" onclick="sharePublication('${payload}')">Share</button>
                    <button class="mini-btn" data-target="${metaId}" onclick="togglePubMeta(this)">View metadata</button>
                </div>
                <button class="gemini-btn" data-title="${escapeHtml(String(p.title || "")).replace(/"/g, "&quot;")}" data-journal="${escapeHtml(String(p.journal || "")).replace(/"/g, "&quot;")}" data-year="${escapeHtml(String(p.year || "")).replace(/"/g, "&quot;")}" onclick="explain(this)">\u2728 Explain Scientific Impact</button>
                <div class="ai-result"></div>
            </div>
        </div>`;
    }).join("");
}

function toggleChat() {
    document.getElementById("chatWindow").classList.toggle("open");
}

function handleKey(e) {
    if (e.key === "Enter") sendMessage();
}

async function sendMessage() {
    const input = document.getElementById("chatInput");
    const txt = input.value.trim();
    if (!txt) return;
    addMsg(txt, "user");
    input.value = "";
    try {
        const res = await callAI(txt);
        addMsg(res, "bot");
    } catch (e) {
        addMsg("The assistant could not respond at this time. Please try again.", "bot");
    }
}

function escapeHtml(text) {
    return String(text || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function formatAIResponse(raw) {
    const safe = escapeHtml(raw).replace(/\r\n/g, "\n");
    const inline = text => text
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/__([^_]+)__/g, "<strong>$1</strong>")
        .replace(/\*([^*]+)\*/g, "<em>$1</em>")
        .replace(/`([^`]+)`/g, "<code>$1</code>");

    const lines = safe.split("\n");
    let html = "";
    let inList = false;
    let inOrderedList = false;

    const closeLists = () => {
        if (inList) {
            html += "</ul>";
            inList = false;
        }
        if (inOrderedList) {
            html += "</ol>";
            inOrderedList = false;
        }
    };

    lines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed) {
            closeLists();
            return;
        }

        const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
        if (headingMatch) {
            closeLists();
            const level = Math.min(6, headingMatch[1].length);
            html += `<h${level}>${inline(headingMatch[2])}</h${level}>`;
            return;
        }

        const orderedMatch = trimmed.match(/^\d+\.\s+(.+)$/);
        if (orderedMatch) {
            if (inList) {
                html += "</ul>";
                inList = false;
            }
            if (!inOrderedList) {
                html += "<ol>";
                inOrderedList = true;
            }
            html += `<li>${inline(orderedMatch[1])}</li>`;
            return;
        }

        if (/^[-*]\s+/.test(trimmed)) {
            if (inOrderedList) {
                html += "</ol>";
                inOrderedList = false;
            }
            if (!inList) {
                html += "<ul>";
                inList = true;
            }
            html += `<li>${inline(trimmed.replace(/^[-*]\s+/, ""))}</li>`;
            return;
        }

        closeLists();

        html += `<p>${inline(trimmed)}</p>`;
    });

    closeLists();
    return html || "<p>No response.</p>";
}

function addMsg(txt, type) {
    const div = document.createElement("div");
    div.className = `msg ${type}`;
    if (type === "bot") div.innerHTML = formatAIResponse(txt);
    else div.textContent = txt;

    const b = document.getElementById("chatBody");
    b.appendChild(div);
    b.scrollTop = b.scrollHeight;
}

async function copyTextToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return;
    }

    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.top = "-1000px";
    area.style.left = "-1000px";
    document.body.appendChild(area);
    area.focus();
    area.select();

    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    if (!ok) throw new Error("execCommand copy failed");
}

function showToast(message, variant = "success") {
    let wrap = document.getElementById("toastContainer");
    if (!wrap) {
        wrap = document.createElement("div");
        wrap.id = "toastContainer";
        wrap.className = "toast-container";
        wrap.setAttribute("aria-live", "polite");
        wrap.setAttribute("aria-atomic", "true");
        document.body.appendChild(wrap);
    }

    const toast = document.createElement("div");
    toast.className = `toast ${variant === "error" ? "toast-error" : "toast-success"}`;
    toast.textContent = message;
    wrap.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add("show"));
    setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => toast.remove(), 220);
    }, 1600);
}

async function explain(btn) {
    const title = btn.getAttribute("data-title");
    const journal = btn.getAttribute("data-journal") || "Unknown journal";
    const year = btn.getAttribute("data-year") || "Unknown year";
    const box = btn.nextElementSibling;

    if (box.style.display === "block") {
        box.style.display = "none";
        return;
    }

    btn.textContent = "Analyzing publication...";
    btn.disabled = true;

    try {
        const prompt = `Explain the impact of this publication for a broad audience.\nTitle: "${title}"\nJournal: ${journal}\nYear: ${year}\nProvide:\n- Why it matters\n- Practical applications\n- One limitation or open question`;
        const txt = await callAI(prompt);
        box.innerHTML = formatAIResponse(txt);
        box.style.display = "block";
        bindAiResultScrollHint(box);
        btn.textContent = "\u2728 Hide";
        showToast("Explanation ready");
    } catch (e) {
        box.innerHTML = formatAIResponse(buildLocalPaperFallback(title, journal, year));
        box.style.display = "block";
        bindAiResultScrollHint(box);
        btn.textContent = "Try Again";
        showToast("AI explanation failed", "error");
    } finally {
        btn.disabled = false;
    }
}

function buildLocalPaperFallback(title, journal, year) {
    return [
        "### Quick Impact Summary",
        `- **Topic:** ${title || "Publication details unavailable."}`,
        `- **Context:** Published in ${journal || "an indexed venue"} (${year || "year n/a"}).`,
        "- **Why it matters:** This work likely advances materials/devices performance, integration, or characterization in photonics/optoelectronics.",
        "- **Potential applications:** imaging, optical sensing, integrated photonics, or energy-related optoelectronic platforms.",
        "- **Open question:** transferability to scalable fabrication and long-term stability under real operating conditions.",
        "",
        "_AI service is temporarily unavailable; this is a local fallback summary._"
    ].join("\n");
}

function bindAiResultScrollHint(box) {
    if (!box) return;

    const update = () => {
        const scrollable = box.scrollHeight - box.clientHeight > 8;
        const atBottom = box.scrollTop + box.clientHeight >= box.scrollHeight - 6;
        box.classList.toggle("show-scroll-hint", scrollable);
        box.classList.toggle("scroll-end", atBottom);
    };

    if (box._hintHandler) box.removeEventListener("scroll", box._hintHandler);
    box._hintHandler = update;
    box.addEventListener("scroll", box._hintHandler, { passive: true });

    requestAnimationFrame(update);
}

function extractAIText(payload) {
    const parts = payload?.candidates?.[0]?.content?.parts;
    if (Array.isArray(parts) && parts.length) {
        const text = parts.map(p => p?.text || "").join("\n").trim();
        if (text) return text;
    }

    const blockReason = payload?.promptFeedback?.blockReason;
    if (blockReason) throw new Error(`Response blocked by API (${blockReason}).`);
    throw new Error("Empty AI response.");
}

async function callAI(prompt) {
    let lastError = null;

    for (const model of AI_MODELS) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        for (let attempt = 1; attempt <= 2; attempt++) {
            const pl = {
                contents: [{ parts: [{ text: prompt }] }],
                systemInstruction: { parts: [{ text: globalContext }] },
                generationConfig: { temperature: attempt === 1 ? 0.3 : 0.2, maxOutputTokens: attempt === 1 ? 700 : 520 }
            };

            try {
                const ctrl = new AbortController();
                const timer = setTimeout(() => ctrl.abort(), AI_REQUEST_TIMEOUT_MS);
                let r;
                try {
                    r = await fetch(url, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(pl),
                        signal: ctrl.signal
                    });
                } finally {
                    clearTimeout(timer);
                }

                if (!r.ok) throw new Error(`HTTP ${r.status} using ${model} (attempt ${attempt})`);
                const d = await r.json();
                return extractAIText(d);
            } catch (err) {
                lastError = err;
                console.warn("AI model failed:", model, "attempt", attempt, err);
                await new Promise(resolve => setTimeout(resolve, 300 * attempt));
            }
        }
    }

    throw lastError || new Error("No AI model available.");
}

document.addEventListener("DOMContentLoaded", loadData);
