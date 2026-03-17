export const AUTO_REFRESH_MS = 60_000;
export const CACHE_TTL_MS = 55_000;
export const DEFAULT_VISIBLE_COUNT = 10;
export const STORAGE_KEY = "trend-radar-preferences";

export const SOURCES = Object.freeze([
  {
    id: "baidu",
    label: "百度",
    description: "百度官方热榜页内嵌榜单数据",
    boardUrl: "https://top.baidu.com/board",
    defaultCategory: "realtime",
    visibleCount: 10,
    categories: [
      { id: "realtime", label: "热搜" },
      { id: "novel", label: "小说" },
      { id: "movie", label: "电影" },
      { id: "teleplay", label: "电视剧" },
      { id: "car", label: "汽车" },
      { id: "game", label: "游戏" }
    ]
  },
  {
    id: "weibo",
    label: "微博",
    description: "微博官方热搜接口",
    boardUrl: "https://s.weibo.com/top/summary?cate=realtimehot",
    defaultCategory: "realtime",
    visibleCount: 10,
    categories: [{ id: "realtime", label: "实时热搜" }]
  },
  {
    id: "zhihu",
    label: "知乎",
    description: "知乎官方热榜接口",
    boardUrl: "https://www.zhihu.com/hot",
    defaultCategory: "total",
    visibleCount: 10,
    categories: [{ id: "total", label: "热榜" }]
  },
  {
    id: "bilibili",
    label: "B站",
    description: "哔哩哔哩热搜",
    boardUrl: "https://search.bilibili.com/all?keyword=",
    defaultCategory: "trending",
    visibleCount: 10,
    categories: [{ id: "trending", label: "热搜" }]
  },
  {
    id: "tieba",
    label: "贴吧",
    description: "百度贴吧热议话题",
    boardUrl: "https://tieba.baidu.com/hottopic/browse/topicList",
    defaultCategory: "topic",
    visibleCount: 10,
    categories: [{ id: "topic", label: "热议" }]
  },
  {
    id: "toutiao",
    label: "头条",
    description: "今日头条热榜",
    boardUrl: "https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc",
    defaultCategory: "hot",
    visibleCount: 10,
    categories: [{ id: "hot", label: "热榜" }]
  }
]);

export const SOURCE_MAP = Object.freeze(
  Object.fromEntries(SOURCES.map((source) => [source.id, source])),
);

export function getSource(sourceId) {
  return SOURCE_MAP[sourceId] ?? null;
}

export function getCategory(sourceId, categoryId) {
  const source = getSource(sourceId);
  if (!source) {
    return null;
  }

  return source.categories.find((category) => category.id === categoryId) ?? null;
}
