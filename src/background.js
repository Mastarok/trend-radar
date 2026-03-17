import { CACHE_TTL_MS } from "./config.mjs";
import { fetchHotList } from "./providers.mjs";

const boardCache = new Map();

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "hotlist:get-board") {
    return false;
  }

  handleBoardRequest(message)
    .then((payload) => sendResponse({ ok: true, ...payload }))
    .catch((error) =>
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "请求失败",
      }),
    );

  return true;
});

async function handleBoardRequest(message) {
  const sourceId = String(message?.sourceId ?? "");
  const categoryId = String(message?.categoryId ?? "");
  const force = Boolean(message?.force);
  const cacheKey = `${sourceId}:${categoryId}`;
  const cached = boardCache.get(cacheKey);

  if (!force && cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return {
      data: cached.data,
      fromCache: true,
      stale: false,
    };
  }

  try {
    const data = await fetchHotList(sourceId, categoryId);
    boardCache.set(cacheKey, {
      cachedAt: Date.now(),
      data,
    });

    return {
      data,
      fromCache: false,
      stale: false,
    };
  } catch (error) {
    if (cached?.data) {
      return {
        data: cached.data,
        fromCache: true,
        stale: true,
        error: error instanceof Error ? error.message : "请求失败",
      };
    }

    throw error;
  }
}
