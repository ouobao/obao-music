// 临时诊断脚本:直接调用 provider 的发现音乐能力,输出真实错误
const { app } = require('electron');
const path = require('node:path');

const distDir = path.join(__dirname, '..', 'dist-electron');

app.whenReady().then(async () => {
  try {
    const { createFileCacheStore } = require(path.join(distDir, 'storage', 'cacheStore.cjs'));
    const { createNeteaseProvider } = require(path.join(distDir, 'providers', 'neteaseProvider.cjs'));
    const { createQQProvider } = require(path.join(distDir, 'providers', 'qqProvider.cjs'));
    const cache = createFileCacheStore(path.join(__dirname, '..', '.runtime', 'data', 'data', 'diag-cache.json'));
    const netease = createNeteaseProvider(undefined, cache);
    const qq = createQQProvider(undefined, cache);

    for (const [name, provider] of [['netease', netease], ['qq', qq]]) {
      try {
        const login = await provider.getLoginStatus();
        console.log(`[${name}] loginStatus:`, JSON.stringify(login));
      } catch (e) {
        console.log(`[${name}] loginStatus ERROR:`, e && e.message, e && e.stack && e.stack.split('\n')[1]);
      }
      try {
        const home = await provider.capabilities.recommendations.getRecommendationHome({ forceRefresh: true });
        console.log(`[${name}] home: daily=${home.dailySongs.length} new=${home.newSongs.length}`);
      } catch (e) {
        console.log(`[${name}] home ERROR:`, e && e.message, e && e.stack && e.stack.split('\n')[1]);
      }
      try {
        const albums = await provider.capabilities.releaseCatalog.getNewAlbums({ forceRefresh: true });
        console.log(`[${name}] newAlbums: ${albums.length}`);
      } catch (e) {
        console.log(`[${name}] newAlbums ERROR:`, e && e.message, e && e.stack && e.stack.split('\n')[1]);
      }
    }
  } catch (e) {
    console.log('HARNESS ERROR:', e && e.stack);
  } finally {
    app.quit();
  }
});
