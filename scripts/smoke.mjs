import { fetchHotList } from "../src/providers.mjs";

const targets = [
  ["baidu", "realtime"],
  ["bilibili", "trending"],
  ["tieba", "topic"],
  ["weibo", "realtime"],
  ["toutiao", "hot"],
  ["zhihu", "total"],
];

let hasFailure = false;

for (const [sourceId, categoryId] of targets) {
  try {
    const result = await fetchHotList(sourceId, categoryId, { forceNodeHeaders: true });
    const topItem = result.items[0];
    console.log(
      `${sourceId}/${categoryId}: ${result.items.length} items, top -> ${topItem?.title || "N/A"}`,
    );
  } catch (error) {
    hasFailure = true;
    console.error(`${sourceId}/${categoryId}: ${error instanceof Error ? error.message : error}`);
  }
}

if (hasFailure) {
  process.exitCode = 1;
}
