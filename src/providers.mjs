import { getCategory, getSource } from "./config.mjs";

const REQUEST_TIMEOUT_MS = 10_000;

export async function fetchHotList(sourceId, categoryId, options = {}) {
  const source = getSource(sourceId);
  if (!source) {
    throw new Error(`不支持的数据源: ${sourceId}`);
  }

  const finalCategoryId = categoryId || source.defaultCategory;
  const category = getCategory(sourceId, finalCategoryId);
  if (!category) {
    throw new Error(`不支持的分类: ${sourceId}/${finalCategoryId}`);
  }

  switch (sourceId) {
    case "baidu":
      return fetchBaiduBoard(finalCategoryId, options);
    case "bilibili":
      return fetchBilibiliBoard(finalCategoryId, options);
    case "tieba":
      return fetchTiebaBoard(finalCategoryId, options);
    case "weibo":
      return fetchWeiboBoard(finalCategoryId, options);
    case "toutiao":
      return fetchToutiaoBoard(finalCategoryId, options);
    case "zhihu":
      return fetchZhihuBoard(finalCategoryId, options);
    default:
      throw new Error(`未实现的数据源: ${sourceId}`);
  }
}

async function fetchBilibiliBoard(categoryId, options) {
  const url = "https://api.bilibili.com/x/web-interface/search/square?limit=50";
  const data = await fetchJson(
    url,
    {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
    },
    options,
  );
  const list = Array.isArray(data?.data?.trending?.list) ? data.data.trending.list : [];

  const items = list.map((item, index) => mapBilibiliItem(item, index)).filter((item) => item.title);

  return buildBoardResponse({
    sourceId: "bilibili",
    categoryId,
    boardUrl: "https://search.bilibili.com/all?keyword=",
    items,
  });
}

async function fetchTiebaBoard(categoryId, options) {
  const url = "https://tieba.baidu.com/hottopic/browse/topicList";
  const data = await fetchJson(url, {}, options);
  const list = Array.isArray(data?.data?.bang_topic?.topic_list) ? data.data.bang_topic.topic_list : [];

  const items = list.map((item, index) => mapTiebaItem(item, index)).filter((item) => item.title);

  return buildBoardResponse({
    sourceId: "tieba",
    categoryId,
    boardUrl: url,
    items,
  });
}

async function fetchBaiduBoard(categoryId, options) {
  const url = `https://top.baidu.com/board?tab=${encodeURIComponent(categoryId)}`;
  const html = await fetchText(url, {}, options);
  const payload = extractBaiduPayload(html);

  const items = payload
    .map((item, index) => mapBaiduItem(item, index))
    .filter((item) => item.title);

  return buildBoardResponse({
    sourceId: "baidu",
    categoryId,
    boardUrl: url,
    items,
  });
}

async function fetchWeiboBoard(categoryId, options) {
  const url = "https://weibo.com/ajax/side/hotSearch";
  const headers = options.forceNodeHeaders
    ? {
        Referer: "https://weibo.com/",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      }
    : {};

  const data = await fetchJson(url, { headers }, options);
  const pinnedRaw = data?.data?.hotgov ?? data?.data?.hotgovs?.[0] ?? null;
  const list = Array.isArray(data?.data?.realtime) ? data.data.realtime : [];
  const pinnedItem = pinnedRaw ? mapWeiboPinnedItem(pinnedRaw) : null;
  const seenTitles = new Set(pinnedItem?.title ? [pinnedItem.title] : []);

  const items = [
    ...(pinnedItem ? [pinnedItem] : []),
    ...list
      .filter((item) => !item?.is_ad)
      .map((item, index) => mapWeiboItem(item, index))
      .filter((item) => {
        if (!item.title || seenTitles.has(item.title)) {
          return false;
        }

        seenTitles.add(item.title);
        return true;
      }),
  ]
    .filter((item) => item.title);

  return buildBoardResponse({
    sourceId: "weibo",
    categoryId,
    boardUrl: "https://s.weibo.com/top/summary?cate=realtimehot",
    items,
  });
}

async function fetchZhihuBoard(categoryId, options) {
  const url = "https://api.zhihu.com/topstory/hot-lists/total?limit=50";
  const data = await fetchJson(url, {}, options);
  const list = Array.isArray(data?.data) ? data.data : [];

  const items = list.map((item, index) => mapZhihuItem(item, index)).filter((item) => item.title);

  return buildBoardResponse({
    sourceId: "zhihu",
    categoryId,
    boardUrl: "https://www.zhihu.com/hot",
    items,
  });
}

async function fetchToutiaoBoard(categoryId, options) {
  const url = "https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc";
  const data = await fetchJson(url, {}, options);
  const pinnedRaw = Array.isArray(data?.fixed_top_data) ? data.fixed_top_data[0] : null;
  const list = Array.isArray(data?.data) ? data.data : [];
  const pinnedItem = pinnedRaw ? mapToutiaoPinnedItem(pinnedRaw) : null;
  const seenTitles = new Set(pinnedItem?.title ? [pinnedItem.title] : []);

  const items = [
    ...(pinnedItem ? [pinnedItem] : []),
    ...list
      .map((item, index) => mapToutiaoItem(item, index))
      .filter((item) => {
        if (!item.title || seenTitles.has(item.title)) {
          return false;
        }

        seenTitles.add(item.title);
        return true;
      }),
  ];

  return buildBoardResponse({
    sourceId: "toutiao",
    categoryId,
    boardUrl: url,
    items,
  });
}

async function fetchText(url, init = {}, options = {}) {
  const response = await request(url, init, options);
  return response.text();
}

async function fetchJson(url, init = {}, options = {}) {
  const response = await request(url, init, options);
  return response.json();
}

async function request(url, init = {}, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetchImpl(url, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`请求失败: ${response.status}`);
    }

    return response;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("请求超时");
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function buildBoardResponse({ sourceId, categoryId, boardUrl, items }) {
  return {
    sourceId,
    categoryId,
    boardUrl,
    fetchedAt: new Date().toISOString(),
    items: items.map((item, index) => ({
      ...item,
      rank: item.rank || index + 1,
    })),
  };
}

function extractBaiduPayload(html) {
  const match = html.match(/<!--s-data:(.*?)-->/s);
  if (!match?.[1]) {
    throw new Error("百度榜单数据解析失败");
  }

  const parsed = JSON.parse(match[1]);
  const cards = parsed?.data?.cards ?? parsed?.cards ?? [];
  const firstCardContent = Array.isArray(cards?.[0]?.content) ? cards[0].content : [];
  const payload =
    Array.isArray(firstCardContent?.[0]?.content) && firstCardContent[0].content.length
      ? firstCardContent[0].content
      : firstCardContent;

  return Array.isArray(payload) ? payload : [];
}

function mapBaiduItem(item, index) {
  const title = normalizeText(item?.word ?? item?.title ?? item?.query ?? "");
  const hotValue = toNumber(item?.hotScore ?? item?.hotTag);

  return {
    id: `baidu-${index + 1}-${title}`,
    rank: index + 1,
    title,
    desc: normalizeText(item?.desc ?? ""),
    hotValue,
    hotText: hotValue ? `${formatCompactNumber(hotValue)} 热搜指数` : "百度热榜",
    badge: "",
    url: normalizeUrl(item?.rawUrl ?? item?.url) || `https://www.baidu.com/s?wd=${encodeURIComponent(item?.query ?? title)}`,
  };
}

function mapBilibiliItem(item, index) {
  const title = normalizeText(item?.show_name ?? item?.keyword ?? "");
  const hotValue = toNumber(item?.heat_score);

  return {
    id: `bilibili-${index + 1}-${title}`,
    rank: index + 1,
    title,
    desc: "",
    hotValue,
    hotText: hotValue ? `${formatCompactNumber(hotValue)} 热度` : "B站热搜",
    badge: "",
    url: `https://search.bilibili.com/all?keyword=${encodeURIComponent(title)}`,
  };
}

function mapTiebaItem(item, index) {
  const title = normalizeText(item?.topic_name ?? "");
  const hotValue = toNumber(item?.discuss_num);
  const badge = mapTopicTag(item?.tag);
  const rawUrl = String(item?.topic_url ?? "").replaceAll("&amp;", "&");

  return {
    id: `tieba-${item?.topic_id ?? index + 1}`,
    rank: toNumber(item?.idx_num) || index + 1,
    title,
    desc: "",
    hotValue,
    hotText: hotValue ? `${formatCompactNumber(hotValue)} 讨论` : "贴吧热议",
    badge,
    url: normalizeUrl(rawUrl) || `https://tieba.baidu.com/hottopic/browse/hottopic?topic_name=${encodeURIComponent(title)}`,
  };
}

function mapWeiboItem(item, index) {
  const title = normalizeText(
    item?.note ?? item?.word ?? stripHashWrap(item?.word_scheme ?? ""),
  );
  const hotValue = toNumber(item?.num);
  const badge = normalizeText(item?.label_name ?? item?.icon_desc ?? item?.flag_desc ?? "");
  const detailBits = [normalizeText(item?.flag_desc ?? "")]
    .filter(Boolean)
    .filter((value, currentIndex, array) => array.indexOf(value) === currentIndex);

  return {
    id: `${item?.mid ?? item?.word_scheme ?? title}-${index + 1}`,
    rank: toNumber(item?.realpos) || index + 1,
    title,
    desc: detailBits.join(" · "),
    hotValue,
    hotText: hotValue ? `${formatCompactNumber(hotValue)} 热度` : "微博热搜",
    badge,
    url: `https://s.weibo.com/weibo?q=${encodeURIComponent(title)}`,
  };
}

function mapWeiboPinnedItem(item) {
  const title = normalizeText(item?.note ?? item?.word ?? item?.name ?? "");

  return {
    id: `weibo-pinned-${title}`,
    rank: 0,
    displayRank: "置顶",
    pinned: true,
    title,
    desc: "微博置顶热搜",
    hotValue: 0,
    hotText: "微博置顶热搜",
    badge: "置顶",
    url: normalizeUrl(item?.url) || `https://s.weibo.com/weibo?q=${encodeURIComponent(title)}`,
  };
}

function mapToutiaoItem(item, index) {
  const title = normalizeText(item?.Title ?? item?.QueryWord ?? "");
  const hotValue = toNumber(item?.HotValue);
  const badge = normalizeToutiaoLabel(item?.Label ?? item?.LabelDesc ?? "");

  return {
    id: `toutiao-${item?.ClusterIdStr ?? item?.ClusterId ?? index + 1}`,
    rank: index + 1,
    title,
    desc: "",
    hotValue,
    hotText: hotValue ? `${formatCompactNumber(hotValue)} 热度` : "头条热榜",
    badge,
    url: normalizeUrl(item?.Url) || `https://www.toutiao.com/search/?keyword=${encodeURIComponent(title)}`,
  };
}

function mapToutiaoPinnedItem(item) {
  const title = normalizeText(item?.Title ?? "");

  return {
    id: `toutiao-pinned-${item?.Id ?? title}`,
    rank: 0,
    displayRank: "置顶",
    pinned: true,
    title,
    desc: "",
    hotValue: 0,
    hotText: "头条置顶",
    badge: "置顶",
    url: normalizeUrl(item?.Url) || `https://www.toutiao.com/search/?keyword=${encodeURIComponent(title)}`,
  };
}

function mapZhihuItem(item, index) {
  const target = item?.target ?? {};
  const title = normalizeText(target?.title_area?.text ?? target?.title ?? "");
  const desc = normalizeText(target?.excerpt_area?.text ?? target?.excerpt ?? "");
  const hotText = normalizeText(target?.metrics_area?.text ?? item?.detail_text ?? "");
  const url = normalizeZhihuUrl(target?.link?.url ?? target?.url ?? "");

  return {
    id: `${target?.id ?? title}-${index + 1}`,
    rank: index + 1,
    title,
    desc,
    hotValue: parseZhihuHot(hotText),
    hotText: hotText || "知乎热榜",
    badge: "",
    url,
  };
}

function parseZhihuHot(text) {
  const normalized = normalizeText(text);
  if (!normalized) {
    return 0;
  }

  const wanMatch = normalized.match(/([\d.]+)\s*万/);
  if (wanMatch) {
    return Math.round(Number(wanMatch[1]) * 10_000);
  }

  const yiMatch = normalized.match(/([\d.]+)\s*亿/);
  if (yiMatch) {
    return Math.round(Number(yiMatch[1]) * 100_000_000);
  }

  return toNumber(normalized);
}

function normalizeZhihuUrl(url) {
  const normalized = normalizeUrl(url);
  if (!normalized) {
    return "";
  }

  if (normalized.startsWith("https://www.zhihu.com/question/")) {
    return normalized;
  }

  const questionMatch = normalized.match(/questions?\/(\d+)/);
  if (questionMatch?.[1]) {
    return `https://www.zhihu.com/question/${questionMatch[1]}`;
  }

  return normalized;
}

function normalizeUrl(url) {
  if (!url) {
    return "";
  }

  try {
    return new URL(url).toString();
  } catch {
    return "";
  }
}

function mapTopicTag(tag) {
  if (tag === 1) {
    return "新";
  }

  if (tag === 2) {
    return "热";
  }

  return "";
}

function normalizeToutiaoLabel(label) {
  const normalized = normalizeText(label);
  if (normalized === "new") {
    return "新";
  }

  if (normalized === "hot") {
    return "热";
  }

  return normalized;
}

function stripHashWrap(text) {
  const normalized = normalizeText(text);
  return normalized.replace(/^#/, "").replace(/#$/, "");
}

function normalizeText(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function toNumber(value) {
  const digits = String(value ?? "")
    .replace(/[^\d.]/g, "")
    .trim();

  if (!digits) {
    return 0;
  }

  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCompactNumber(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0";
  }

  if (value >= 100_000_000) {
    return `${(value / 100_000_000).toFixed(1).replace(/\.0$/, "")} 亿`;
  }

  if (value >= 10_000) {
    return `${(value / 10_000).toFixed(1).replace(/\.0$/, "")} 万`;
  }

  return value.toLocaleString("zh-CN");
}
