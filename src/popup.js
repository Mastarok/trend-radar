import {
  AUTO_REFRESH_MS,
  SOURCES,
  STORAGE_KEY,
  getCategory,
  getSource,
} from "./config.mjs";

const app = document.querySelector("#app");

const state = {
  activeSourceId: SOURCES[0].id,
  refreshingAll: false,
  nextRefreshAt: Date.now() + AUTO_REFRESH_MS,
  lastSyncedAt: "",
  sections: Object.fromEntries(
    SOURCES.map((source) => [
      source.id,
      {
        categoryId: source.defaultCategory,
        items: [],
        loading: true,
        error: "",
        stale: false,
        fromCache: false,
        updateTime: "",
        boardUrl: source.boardUrl,
      },
    ]),
  ),
};

let tickerId = 0;
let boardScrollTop = 0;

await initialize();

async function initialize() {
  await restorePreferences();
  render();
  app.addEventListener("click", handleClick);
  await refreshAll({ force: true });
  tickerId = window.setInterval(onTick, 1_000);
}

function onTick() {
  if (!state.refreshingAll && Date.now() >= state.nextRefreshAt) {
    void refreshAll({ force: true });
    return;
  }

  updateLiveBits();
}

async function refreshAll({ force = false } = {}) {
  if (state.refreshingAll) {
    return;
  }

  state.refreshingAll = true;
  render();

  await Promise.all(SOURCES.map((source) => loadSource(source.id, { force })));

  state.refreshingAll = false;
  state.lastSyncedAt = new Date().toISOString();
  state.nextRefreshAt = Date.now() + AUTO_REFRESH_MS;
  render();
}

async function loadSource(sourceId, { force = false } = {}) {
  const section = state.sections[sourceId];
  section.loading = true;
  section.error = "";
  render();

  try {
    const response = await chrome.runtime.sendMessage({
      type: "hotlist:get-board",
      sourceId,
      categoryId: section.categoryId,
      force,
    });

    if (!response?.ok) {
      throw new Error(response?.error || "抓取失败");
    }

    section.items = Array.isArray(response?.data?.items) ? response.data.items : [];
    section.error = response?.error || "";
    section.stale = Boolean(response?.stale);
    section.fromCache = Boolean(response?.fromCache);
    section.updateTime = response?.data?.fetchedAt || new Date().toISOString();
    section.boardUrl = response?.data?.boardUrl || section.boardUrl;
  } catch (error) {
    section.error = normalizeText(error?.message || "抓取失败");
  } finally {
    section.loading = false;
    render();
  }
}

async function handleClick(event) {
  const linkTarget = event.target.closest("a[data-action='open-url']");
  if (linkTarget) {
    event.preventDefault();
    const url = sanitizeUrl(linkTarget.dataset.url || linkTarget.getAttribute("href") || "");
    if (url !== "about:blank") {
      await chrome.tabs.create({ url });
    }
    return;
  }

  const target = event.target.closest("button[data-action]");
  if (!target) {
    return;
  }

  const action = target.dataset.action;

  if (action === "refresh-all") {
    await refreshAll({ force: true });
    return;
  }

  if (action === "switch-source") {
    const sourceId = target.dataset.sourceId;
    if (!sourceId || !state.sections[sourceId] || state.activeSourceId === sourceId) {
      return;
    }

    state.activeSourceId = sourceId;
    await persistPreferences();

    const section = state.sections[sourceId];
    if (!section.items.length && !section.loading) {
      await loadSource(sourceId, { force: true });
      return;
    }

    render();
    return;
  }

  if (action === "switch-category") {
    const sourceId = target.dataset.sourceId;
    const categoryId = target.dataset.categoryId;
    if (!sourceId || !categoryId || !state.sections[sourceId]) {
      return;
    }

    if (state.sections[sourceId].categoryId === categoryId) {
      return;
    }

    state.sections[sourceId].categoryId = categoryId;
    await persistPreferences();
    await loadSource(sourceId, { force: true });
  }
}

async function restorePreferences() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const preferences = stored?.[STORAGE_KEY];
  if (!preferences || typeof preferences !== "object") {
    return;
  }

  if (preferences.activeSourceId && getSource(preferences.activeSourceId)) {
    state.activeSourceId = preferences.activeSourceId;
  }

  const savedSources = preferences.sources;
  if (!savedSources || typeof savedSources !== "object") {
    return;
  }

  for (const source of SOURCES) {
    const saved = savedSources[source.id];
    if (!saved || typeof saved !== "object") {
      continue;
    }

    const savedCategoryId = String(saved.categoryId || "");
    if (getCategory(source.id, savedCategoryId)) {
      state.sections[source.id].categoryId = savedCategoryId;
    }
  }
}

async function persistPreferences() {
  const payload = {
    activeSourceId: state.activeSourceId,
    sources: Object.fromEntries(
      SOURCES.map((source) => [
        source.id,
        {
          categoryId: state.sections[source.id].categoryId,
        },
      ]),
    ),
  };

  await chrome.storage.local.set({ [STORAGE_KEY]: payload });
}

function render() {
  const previousBoardList = document.querySelector(".board-list");
  if (previousBoardList) {
    boardScrollTop = previousBoardList.scrollTop;
  }

  const activeSource = getSource(state.activeSourceId) ?? SOURCES[0];
  const section = state.sections[activeSource.id];
  const activeCategory =
    getCategory(activeSource.id, section.categoryId) ?? activeSource.categories[0];
  const statusText = section.stale
    ? "网络波动，当前展示最近一次成功抓取"
    : section.loading && !section.items.length
      ? "正在抓取官方榜单"
      : `更新于 ${formatDateTime(section.updateTime)}`;

  const boardBody = section.loading && !section.items.length
    ? renderSkeleton()
    : section.error && !section.items.length
      ? `<div class="error-card"><strong>抓取失败</strong><br />${escapeHtml(section.error)}</div>`
      : section.items.length
        ? `<div class="items">${section.items.map((item) => renderItem(item)).join("")}</div>`
        : '<div class="empty-card">当前分类暂时没有可展示的内容。</div>';

  app.innerHTML = `
    <div class="popup-shell">
      <header class="topbar">
        <div class="source-tabs">
          ${SOURCES.map(
            (source) => `
              <button
                class="source-tab"
                data-action="switch-source"
                data-source-id="${escapeAttribute(source.id)}"
                aria-pressed="${source.id === activeSource.id ? "true" : "false"}"
              >
                ${escapeHtml(source.label)}
              </button>
            `,
          ).join("")}
        </div>
        <div class="header-actions">
          <button class="refresh-button" data-action="refresh-all" ${
            state.refreshingAll ? "disabled" : ""
          }>
            ${state.refreshingAll ? "刷新中..." : "刷新"}
          </button>
        </div>
      </header>

      <section class="board-panel">
        <div class="board-head">
          <div class="board-title-wrap">
            <h2 class="board-title">${escapeHtml(activeCategory.label)}</h2>
          </div>
          <a
            class="board-link"
            data-action="open-url"
            data-url="${escapeAttribute(sanitizeUrl(section.boardUrl || activeSource.boardUrl))}"
            href="${escapeAttribute(sanitizeUrl(section.boardUrl || activeSource.boardUrl))}"
            target="_blank"
            rel="noreferrer noopener"
          >
            原榜
          </a>
        </div>

        ${
          activeSource.categories.length > 1
            ? `<div class="category-row">
                ${activeSource.categories
                  .map(
                    (category) => `
                      <button
                        class="category-button"
                        data-action="switch-category"
                        data-source-id="${escapeAttribute(activeSource.id)}"
                        data-category-id="${escapeAttribute(category.id)}"
                        aria-pressed="${category.id === activeCategory.id ? "true" : "false"}"
                      >
                        ${escapeHtml(category.label)}
                      </button>
                    `,
                  )
                  .join("")}
              </div>`
            : ""
        }

        <div class="board-status">
          <span class="status-pill">${escapeHtml(`${section.items.length} 条`)}</span>
          <span class="status-pill ${section.stale ? "is-warning" : ""}">${escapeHtml(
            statusText,
          )}</span>
          <span class="status-pill" data-role="countdown">${escapeHtml(
            `下次刷新 ${formatCountdown(state.nextRefreshAt - Date.now())}`,
          )}</span>
        </div>

        ${
          section.error && section.items.length
            ? `<div class="inline-notice">${escapeHtml(`最新请求失败: ${section.error}`)}</div>`
            : ""
        }

        <div class="board-list">
          ${boardBody}
        </div>
      </section>
    </div>
  `;

  const nextBoardList = document.querySelector(".board-list");
  if (nextBoardList) {
    nextBoardList.scrollTop = boardScrollTop;
  }
}

function updateLiveBits() {
  const countdownNode = document.querySelector('[data-role="countdown"]');
  if (countdownNode) {
    countdownNode.textContent = `下次刷新 ${formatCountdown(state.nextRefreshAt - Date.now())}`;
  }
}

function renderItem(item) {
  const rankLabel = item.displayRank || String(item.rank || "");

  return `
    <a
      class="item-card ${item.pinned ? "is-pinned" : ""}"
      data-action="open-url"
      data-url="${escapeAttribute(sanitizeUrl(item.url))}"
      href="${escapeAttribute(sanitizeUrl(item.url))}"
      target="_blank"
      rel="noreferrer noopener"
    >
      <div class="rank-badge ${item.pinned ? "is-pinned" : ""}">
        ${escapeHtml(rankLabel)}
      </div>
      <div class="item-content">
        <div class="item-title-row">
          <h3 class="item-title">${escapeHtml(item.title || "未命名内容")}</h3>
          ${item.badge ? `<span class="item-badge">${escapeHtml(item.badge)}</span>` : ""}
        </div>
        <div class="item-foot">
          <span class="item-hot">${escapeHtml(item.hotText || "实时榜单")}</span>
        </div>
      </div>
    </a>
  `;
}

function renderSkeleton() {
  return `
    <div class="skeleton-list">
      ${Array.from({ length: 6 })
        .map(() => '<div class="skeleton-item"></div>')
        .join("")}
    </div>
  `;
}

function formatDateTime(isoString) {
  if (!isoString) {
    return "等待首次同步";
  }

  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return "等待首次同步";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    month: "numeric",
    day: "numeric",
  }).format(date);
}

function formatCountdown(deltaMs) {
  if (!Number.isFinite(deltaMs) || deltaMs <= 0) {
    return "即将刷新";
  }

  const totalSeconds = Math.max(0, Math.ceil(deltaMs / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function sanitizeUrl(url) {
  try {
    return new URL(url).toString();
  } catch {
    return "about:blank";
  }
}

function normalizeText(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#96;");
}

window.addEventListener("beforeunload", () => {
  if (tickerId) {
    window.clearInterval(tickerId);
  }
});
