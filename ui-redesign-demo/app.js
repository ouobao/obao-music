/**
 * Aether Flow 交互驱动核心 (App Controller)
 * 针对 Electron 桌面端特化：自适应响应式、全面板遮罩点击退出、全精简静默操作与舒缓慢速过渡
 */

class MusicPlayerDemo {
  constructor() {
    this.currentView = 'home';
    this.currentProvider = 'netease';
    this.currentTheme = 'dark';
    this.isPlaying = false;
    this.currentTime = 68;
    this.duration = 269;
    this.isLyricsOpen = false;
    this.isQueueOpen = false;
    this.isSimilarOpen = false;
    this.isSidebarCollapsed = false;
    this.playMode = 'list'; // list, random, single
    this.audioQuality = 'hires'; // standard, hq, lossless, hires
    this.activeCategory = '全部';
    this.activeSearchTab = '单曲';

    this.init();
  }

  init() {
    this.bindEvents();
    this.renderView('home');
    this.startProgressTicker();
  }

  bindEvents() {
    // 侧边栏导航点击
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const view = item.getAttribute('data-view');
        if (view) {
          this.navigateTo(view);
        }
      });
    });

    // 播放/暂停
    const playBtn = document.getElementById('main-play-btn');
    if (playBtn) {
      playBtn.addEventListener('click', () => this.togglePlay());
    }

    // 歌词页全新舒缓展开/收起过渡动画 (Slide Overlay)
    const coverWrapper = document.getElementById('player-cover-trigger');
    const closeLyricsBtn = document.getElementById('close-lyrics-btn');
    if (coverWrapper) {
      coverWrapper.addEventListener('click', () => this.toggleLyrics(true));
    }
    if (closeLyricsBtn) {
      closeLyricsBtn.addEventListener('click', () => this.toggleLyrics(false));
    }

    // 播放模式选择器弹层
    const modeBtn = document.getElementById('mode-toggle-btn');
    const modeMenu = document.getElementById('playmode-popover');
    if (modeBtn && modeMenu) {
      modeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = modeMenu.classList.contains('open');
        this.closeAllPopovers();
        if (!isOpen) modeMenu.classList.add('open');
      });
    }

    // 音质选择器弹层
    const qualityBtn = document.getElementById('quality-toggle-btn');
    const qualityMenu = document.getElementById('quality-popover');
    if (qualityBtn && qualityMenu) {
      qualityBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = qualityMenu.classList.contains('open');
        this.closeAllPopovers();
        if (!isOpen) qualityMenu.classList.add('open');
      });
    }

    // 全局右键上下文菜单控制 (Context Menu)
    const ctxMenu = document.getElementById('app-context-menu');
    document.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (ctxMenu) {
        ctxMenu.style.left = `${Math.min(e.clientX, window.innerWidth - 180)}px`;
        ctxMenu.style.top = `${Math.min(e.clientY, window.innerHeight - 160)}px`;
        ctxMenu.classList.add('active');
      }
    });

    document.addEventListener('click', () => {
      ctxMenu?.classList.remove('active');
    });

    // 播放模式切换事件 (静默精准切换)
    document.querySelectorAll('#playmode-popover .popover-menu-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const mode = item.getAttribute('data-mode');
        this.setPlayMode(mode);
        this.closeAllPopovers();
      });
    });

    // 音质切换事件 (静默精准切换)
    document.querySelectorAll('#quality-popover .popover-menu-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const quality = item.getAttribute('data-quality');
        this.setAudioQuality(quality);
        this.closeAllPopovers();
      });
    });

    // 队列面板切换
    const queueBtn = document.getElementById('queue-toggle-btn');
    if (queueBtn) {
      queueBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleQueue();
      });
    }

    // 相似歌曲抽屉
    const similarBtn = document.getElementById('similar-toggle-btn');
    if (similarBtn) {
      similarBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleSimilar();
      });
    }

    // 主题切换器
    const themeBtn = document.getElementById('theme-toggle-btn');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => this.cycleTheme());
    }

    // 侧边栏折叠/展开按钮绑定（包含主按钮与Logo恢复按钮）
    const sidebarBtn = document.getElementById('sidebar-toggle-btn');
    const logoBadge = document.getElementById('logo-badge-trigger');
    if (sidebarBtn) {
      sidebarBtn.addEventListener('click', () => this.toggleSidebar());
    }
    if (logoBadge) {
      logoBadge.addEventListener('click', () => {
        if (this.isSidebarCollapsed) this.toggleSidebar();
      });
    }

    // 搜索输入回车
    const searchInput = document.getElementById('topbar-search-input');
    const searchDropdown = document.getElementById('search-dropdown');
    if (searchInput) {
      searchInput.addEventListener('focus', () => searchDropdown?.classList.add('active'));
      searchInput.addEventListener('blur', () => setTimeout(() => searchDropdown?.classList.remove('active'), 220));
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && searchInput.value.trim()) {
          this.navigateTo('search', { keyword: searchInput.value.trim() });
          searchDropdown?.classList.remove('active');
        }
      });
    }

    // 平台切换 (网易云 / QQ)
    document.querySelectorAll('.provider-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.provider-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentProvider = btn.getAttribute('data-provider') || 'netease';
        this.renderView(this.currentView);
      });
    });

    // 登录弹窗
    const loginBtn = document.getElementById('user-login-btn');
    const loginModal = document.getElementById('login-modal');
    const closeLogin = document.getElementById('close-login-btn');
    if (loginBtn && loginModal) {
      loginBtn.addEventListener('click', () => loginModal.classList.add('open'));
    }
    if (closeLogin && loginModal) {
      closeLogin.addEventListener('click', () => loginModal.classList.remove('open'));
    }
    if (loginModal) {
      loginModal.addEventListener('click', (e) => {
        if (e.target === loginModal) loginModal.classList.remove('open');
      });
    }
  }

  closeAllPopovers() {
    document.querySelectorAll('.popover-menu').forEach(m => m.classList.remove('open'));
  }

  closeAllDrawers() {
    this.isQueueOpen = false;
    this.isSimilarOpen = false;
    document.getElementById('queue-drawer')?.classList.remove('open');
    document.getElementById('similar-drawer')?.classList.remove('open');
    document.getElementById('drawer-overlay')?.classList.remove('active');
  }

  setPlayMode(mode) {
    this.playMode = mode;
    const modeIcons = {
      list: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`,
      random: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>`,
      single: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/><text x="10.5" y="15" font-size="7.5" font-weight="700" fill="currentColor" stroke="none">1</text></svg>`
    };

    const btn = document.getElementById('mode-toggle-btn');
    if (btn) btn.innerHTML = modeIcons[mode];

    document.querySelectorAll('#playmode-popover .popover-menu-item').forEach(item => {
      if (item.getAttribute('data-mode') === mode) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  }

  setAudioQuality(quality) {
    this.audioQuality = quality;
    const badges = { standard: '标准', hq: 'HQ', lossless: 'SQ 无损', hires: 'Hi-Res' };

    const btn = document.getElementById('quality-toggle-btn');
    if (btn) btn.innerText = badges[quality];

    document.querySelectorAll('#quality-popover .popover-menu-item').forEach(item => {
      if (item.getAttribute('data-quality') === quality) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  }

  // 全新轻量沉浸全屏歌词页开关 (带歌词实时渲染与音律)
  toggleLyrics(open) {
    this.isLyricsOpen = open;
    const overlay = document.getElementById('lyrics-overlay');
    if (overlay) {
      if (open) {
        overlay.classList.add('active');
        if (this.isPlaying) overlay.classList.add('playing');
        this.renderLyricsContent();
      } else {
        overlay.classList.remove('active');
      }
    }
  }

  // 🎤 歌词智能高亮、点击行精准跳转定位与居中平滑滚动
  renderLyricsContent() {
    const song = window.MOCK_DATA.currentSong;
    const lyrics = song.lyrics || [];
    const container = document.getElementById('lyrics-scroll-container');
    if (!container) return;

    let activeIndex = 0;
    for (let i = 0; i < lyrics.length; i++) {
      if (this.currentTime >= lyrics[i].time) {
        activeIndex = i;
      }
    }

    container.innerHTML = lyrics.map((line, idx) => {
      let activeClass = '';
      if (idx === activeIndex) activeClass = 'active';
      else if (Math.abs(idx - activeIndex) === 1) activeClass = 'near-1';
      else if (Math.abs(idx - activeIndex) === 2) activeClass = 'near-2';

      return `
        <div class="lyric-line ${activeClass}" data-time="${line.time}" onclick="app.seekToLyric(${line.time})">
          <div class="lyric-hover-play-btn" title="跳转至此处播放">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          </div>
          <div class="lyric-text-content">
            ${line.text}
            ${line.trans ? `<div class="lyric-translation">${line.trans}</div>` : ''}
          </div>
        </div>
      `;
    }).join('');

    const activeEl = container.querySelector('.lyric-line.active');
    if (activeEl && !this.isUserScrollingLyrics) {
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  seekToLyric(time) {
    this.currentTime = time;
    this.renderLyricsContent();
    const progress = (this.currentTime / this.duration) * 100;
    const progressBar = document.getElementById('audio-progress');
    const timeCurrent = document.getElementById('time-current');
    if (progressBar) progressBar.style.width = `${progress}%`;
    if (timeCurrent) {
      const mins = Math.floor(this.currentTime / 60);
      const secs = String(this.currentTime % 60).padStart(2, '0');
      timeCurrent.innerText = `0${mins}:${secs}`;
    }
  }
  renderLyricsContent() {
    const song = window.MOCK_DATA.currentSong;
    const lyrics = song.lyrics || [];
    const container = document.getElementById('lyrics-scroll-container');
    if (!container) return;

    // 计算当前正处于第几行
    let activeIndex = 0;
    for (let i = 0; i < lyrics.length; i++) {
      if (this.currentTime >= lyrics[i].time) {
        activeIndex = i;
      }
    }

    container.innerHTML = lyrics.map((line, idx) => {
      let activeClass = '';
      if (idx === activeIndex) activeClass = 'active';
      else if (Math.abs(idx - activeIndex) === 1) activeClass = 'near-1';
      else if (Math.abs(idx - activeIndex) === 2) activeClass = 'near-2';

      return `
        <div class="lyric-line ${activeClass}" data-time="${line.time}" onclick="app.seekToLyric(${line.time})">
          ${line.text}
          ${line.trans ? `<div class="lyric-translation">${line.trans}</div>` : ''}
        </div>
      `;
    }).join('');

    // 自动缓动居中滚动到当前激活行
    const activeEl = container.querySelector('.lyric-line.active');
    if (activeEl && !this.isUserScrollingLyrics) {
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  seekToLyric(time) {
    this.currentTime = time;
    this.renderLyricsContent();
    const progress = (this.currentTime / this.duration) * 100;
    const progressBar = document.getElementById('audio-progress');
    const timeCurrent = document.getElementById('time-current');
    if (progressBar) progressBar.style.width = `${progress}%`;
    if (timeCurrent) {
      const mins = Math.floor(this.currentTime / 60);
      const secs = String(this.currentTime % 60).padStart(2, '0');
      timeCurrent.innerText = `0${mins}:${secs}`;
    }
  }

  // 🎯 局部精准更新，避免整个页面触发转场动画
  updateSubView(htmlContent) {
    const container = document.querySelector('.sub-view-container');
    if (container) {
      container.innerHTML = htmlContent;
    } else {
      this.renderView(this.currentView);
    }
  }

  // 🎯 修复：真正全覆盖替换 HTML 视图，避免重复复制 Dom 节点
  navigateTo(view, params = {}) {
    this.currentView = view;
    document.querySelectorAll('.nav-item').forEach(item => {
      if (item.getAttribute('data-view') === view) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    const stage = document.getElementById('main-content-area');
    if (!stage) return;

    const newHtml = this.getViewHtml(view, params);

    stage.innerHTML = `
      <div class="main-content-transition-stage">
        <div class="main-content-view">
          ${newHtml}
        </div>
      </div>
    `;

    stage.scrollTop = 0;
    this.bindDynamicViewEvents();
  }

  renderView(view, params = {}) {
    this.navigateTo(view, params);
  }

  getViewHtml(view, params = {}) {
    switch (view) {
      case 'home':
        return this.renderHomeView();
      case 'search':
        return this.renderSearchView(params.keyword || '周杰伦');
      case 'charts':
        return this.renderChartsView();
      case 'discovery':
        return this.renderPlaylistDiscoveryView();
      case 'detail':
        return this.renderDetailView(params.type || 'playlist', params.id);
      case 'history':
        return this.renderHistoryView();
      default:
        return this.renderHomeView();
    }
  }

  getSubViewHtml(view, params = {}) {
    return this.getViewHtml(view, params);
  }

  // 1. 首页渲染
  renderHomeView() {
    const playlists = window.MOCK_DATA.homePlaylists;
    const songs = window.MOCK_DATA.songs.slice(0, 6);

    return `
      <div class="home-banner-grid">
        <div class="banner-card" style="background-image: url('https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&q=80')" onclick="app.navigateTo('detail', { type: 'recommendationCollection', id: 'rec_1' })">
          <span class="banner-tag">精选企划</span>
          <div class="banner-title">2024 华语黄金时代重温专栏</div>
          <div class="banner-subtitle">品味岁月沉淀的旋律之美 · 点击浏览</div>
        </div>
        <div class="banner-card" style="background-image: url('https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=800&q=80')" onclick="app.navigateTo('detail', { type: 'album', id: 'alb_1' })">
          <span class="banner-tag">新碟首发</span>
          <div class="banner-title">电子未来主义：新浪潮集结</div>
          <div class="banner-subtitle">带上耳机，即刻进入赛博空间 · 点击试听</div>
        </div>
      </div>

      <div class="section-header">
        <div class="section-title-group">
          <h2 class="section-main-title">推荐歌单</h2>
          <span class="section-sub-title">根据您的收听偏好定制</span>
        </div>
        <button class="section-action-btn" onclick="app.navigateTo('discovery')">
          查看全部
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      </div>

      <div class="media-grid">
        ${playlists.map(pl => `
          <div class="media-card" onclick="app.navigateTo('detail', { type: 'playlist', id: '${pl.id}' })">
            <div class="media-cover-container">
              <img class="media-cover-img" src="${pl.cover}" alt="${pl.title}" />
              <div class="media-play-count">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                ${pl.playCount}
              </div>
              <div class="media-play-badge" onclick="event.stopPropagation(); app.playAll('${pl.title}')">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              </div>
            </div>
            <div class="media-title">${pl.title}</div>
            <div class="media-author">${pl.author}</div>
          </div>
        `).join('')}
      </div>

      <div class="section-header">
        <div class="section-title-group">
          <h2 class="section-main-title">新歌速递</h2>
          <span class="section-sub-title">今日最新上线</span>
        </div>
        <button class="section-action-btn" onclick="app.playAll('新歌速递')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          播放全部
        </button>
      </div>

      ${this.renderSongTable(songs)}
    `;
  }

  // 2. 搜索视图 (带局部容器包覆)
  renderSearchView(keyword) {
    const songs = window.MOCK_DATA.songs;
    const artists = window.MOCK_DATA.artists;
    const albums = window.MOCK_DATA.albums;
    const playlists = window.MOCK_DATA.homePlaylists;

    let contentHtml = '';
    if (this.activeSearchTab === '单曲') {
      contentHtml = this.renderSongTable(songs);
    } else if (this.activeSearchTab === '歌手') {
      contentHtml = `
        <div class="artist-card-grid">
          ${artists.map(art => `
            <div class="artist-card" onclick="app.navigateTo('detail', { type: 'artist', id: '${art.id}' })">
              <img class="artist-avatar" src="${art.avatar}" alt="${art.name}" />
              <span class="artist-name">${art.name}</span>
              <span class="artist-desc">${art.desc}</span>
            </div>
          `).join('')}
        </div>
      `;
    } else if (this.activeSearchTab === '专辑') {
      contentHtml = `
        <div class="media-grid">
          ${albums.map(alb => `
            <div class="media-card" onclick="app.navigateTo('detail', { type: 'album', id: '${alb.id}' })">
              <div class="media-cover-container">
                <img class="media-cover-img" src="${alb.cover}" alt="${alb.title}" />
              </div>
              <div class="media-title">${alb.title}</div>
              <div class="media-author">${alb.artist} · ${alb.year}</div>
            </div>
          `).join('')}
        </div>
      `;
    } else if (this.activeSearchTab === '歌单') {
      contentHtml = `
        <div class="media-grid">
          ${playlists.map(pl => `
            <div class="media-card" onclick="app.navigateTo('detail', { type: 'playlist', id: '${pl.id}' })">
              <div class="media-cover-container">
                <img class="media-cover-img" src="${pl.cover}" alt="${pl.title}" />
                <div class="media-play-count">${pl.playCount}</div>
              </div>
              <div class="media-title">${pl.title}</div>
              <div class="media-author">${pl.author}</div>
            </div>
          `).join('')}
        </div>
      `;
    }

    return `
      <div class="section-header" style="margin-bottom: 24px;">
        <div class="section-title-group">
          <h1 class="detail-title">"${keyword}" 的搜索结果</h1>
        </div>
      </div>

      <div class="filter-pills-bar">
        <div class="pill-item search-tab-pill ${this.activeSearchTab === '单曲' ? 'active' : ''}" data-tab="单曲">单曲 (128)</div>
        <div class="pill-item search-tab-pill ${this.activeSearchTab === '歌手' ? 'active' : ''}" data-tab="歌手">歌手 (${artists.length})</div>
        <div class="pill-item search-tab-pill ${this.activeSearchTab === '专辑' ? 'active' : ''}" data-tab="专辑">专辑 (${albums.length})</div>
        <div class="pill-item search-tab-pill ${this.activeSearchTab === '歌单' ? 'active' : ''}" data-tab="歌单">歌单 (${playlists.length})</div>
      </div>

      <div class="sub-view-container">
        ${contentHtml}
      </div>
    `;
  }

  // 3. 排行榜视图
  renderChartsView() {
    const charts = window.MOCK_DATA.charts;
    return `
      <div class="section-header" style="margin-bottom: 24px;">
        <div class="section-title-group">
          <h1 class="detail-title">官方排行榜</h1>
          <span class="section-sub-title">权威呈现平台热度趋势</span>
        </div>
      </div>

      <div class="media-grid" style="grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));">
        ${charts.map(c => `
          <div class="media-card" onclick="app.navigateTo('detail', { type: 'chart', id: '${c.id}' })">
            <div class="media-cover-container">
              <img class="media-cover-img" src="${c.cover}" alt="${c.title}" />
              <div class="media-play-count">${c.update}</div>
              <div class="media-play-badge" onclick="event.stopPropagation(); app.playAll('${c.title}')">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              </div>
            </div>
            <div class="media-title" style="font-size: 16px;">${c.title}</div>
            <div class="media-author">${c.desc}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  // 4. 歌单广场视图 (带局部容器包覆)
  renderPlaylistDiscoveryView() {
    const categories = window.MOCK_DATA.categories;
    const allPlaylists = window.MOCK_DATA.homePlaylists;
    
    // 分类过滤
    const filteredPlaylists = this.activeCategory === '全部'
      ? allPlaylists
      : allPlaylists.filter(pl => pl.category === this.activeCategory);
    
    const displayList = filteredPlaylists.length > 0 ? filteredPlaylists : allPlaylists;

    return `
      <div class="section-header" style="margin-bottom: 20px;">
        <div class="section-title-group">
          <h1 class="detail-title">歌单广场</h1>
          <span class="section-sub-title">浏览发现海量优质歌单</span>
        </div>
      </div>

      <div class="filter-pills-bar">
        ${categories.map(cat => `
          <div class="pill-item category-pill ${this.activeCategory === cat ? 'active' : ''}" data-cat="${cat}">${cat}</div>
        `).join('')}
      </div>

      <div class="sub-view-container">
        <div class="media-grid">
          ${displayList.map(pl => `
            <div class="media-card" onclick="app.navigateTo('detail', { type: 'playlist', id: '${pl.id}' })">
              <div class="media-cover-container">
                <img class="media-cover-img" src="${pl.cover}" alt="${pl.title}" />
                <div class="media-play-count">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                  ${pl.playCount}
                </div>
                <div class="media-play-badge" onclick="event.stopPropagation(); app.playAll('${pl.title}')">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                </div>
              </div>
              <div class="media-title">${pl.title}</div>
              <div class="media-author">${pl.author}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // 5. 5合1 多维详情页 (包含歌手主页、专辑、歌单)
  renderDetailView(type = 'playlist', id) {
    const songs = window.MOCK_DATA.songs;
    const artists = window.MOCK_DATA.artists;
    const albums = window.MOCK_DATA.albums;

    // 🌟 5.1 歌手详情主页 (Artist Page with Tabs)
    if (type === 'artist') {
      const artist = artists.find(a => a.id === id) || artists[0];
      return `
        <div class="artist-detail-header">
          <div class="artist-detail-meta">
            <img class="artist-detail-avatar" src="${artist.avatar}" />
            <div class="artist-detail-info">
              <span class="detail-type-badge">华语男歌手</span>
              <h1 class="artist-detail-title">${artist.name}</h1>
              <p class="artist-detail-sub">${artist.alias} · ${artist.songsCount} 首单曲 · ${artist.albumsCount} 张专辑</p>
              <p class="detail-desc" style="margin-top: 8px;">${artist.desc}</p>
              <div class="detail-actions-row">
                <button class="btn-primary-play" onclick="app.playAll('${artist.name} 热门作品')">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                  播放热门歌曲
                </button>
                <button class="btn-secondary-action">关注</button>
              </div>
            </div>
          </div>
        </div>

        <div class="filter-pills-bar" style="margin-top: 24px;">
          <div class="pill-item active">热门单曲</div>
          <div class="pill-item">所有专辑</div>
          <div class="pill-item">艺人MV</div>
          <div class="pill-item">相似歌手</div>
        </div>

        ${this.renderSongTable(artist.hotSongs || songs)}
      `;
    }

    // 🌟 5.2 专辑详情主页 (Album Page)
    if (type === 'album') {
      const album = albums.find(a => a.id === id) || albums[0];
      return `
        <div class="detail-header">
          <img class="detail-cover" src="${album.cover}" alt="${album.title}" />
          <div class="detail-meta">
            <span class="detail-type-badge">专辑大碟 · ${album.year}</span>
            <h1 class="detail-title">${album.title}</h1>
            <p class="detail-desc">${album.desc || '华语乐坛划时代经典概念大碟。'}</p>
            <div class="detail-actions-row">
              <button class="btn-primary-play" onclick="app.playAll('${album.title}')">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                播放全部 (${album.songCount || 10} 首)
              </button>
              <button class="btn-secondary-action">收藏专辑</button>
            </div>
          </div>
        </div>

        ${this.renderSongTable(songs)}
      `;
    }

    // 🌟 5.3 常规歌单与排行榜
    const typeNames = {
      playlist: '精品歌单',
      chart: '官方榜单',
      recommendationCollection: '个性推荐集'
    };

    return `
      <div class="detail-header">
        <img class="detail-cover" src="https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&q=80" alt="Detail Cover" />
        <div class="detail-meta">
          <span class="detail-type-badge">${typeNames[type] || '歌单'}</span>
          <h1 class="detail-title">华语经典回忆录 · 黄金年代精选辑</h1>
          <p class="detail-desc">
            收录华语乐坛最脍炙人口的传世佳作，用熟悉的旋律唤醒青春记忆。包含周杰伦、王菲、张学友、陈奕迅等一众传奇歌手的巅峰之作。
          </p>
          <div class="detail-actions-row">
            <button class="btn-primary-play" onclick="app.playAll('黄金年代精选辑')">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              播放全部 (8 首)
            </button>
            <button class="btn-secondary-action">收藏</button>
            <button class="btn-secondary-action">分享</button>
          </div>
        </div>
      </div>

      ${this.renderSongTable(songs)}
    `;
  }

  // 6. 最近播放视图
  renderHistoryView() {
    const songs = window.MOCK_DATA.songs;
    return `
      <div class="section-header" style="margin-bottom: 24px;">
        <div class="section-title-group">
          <h1 class="detail-title">最近播放记录</h1>
          <span class="section-sub-title">共收听 128 首歌曲</span>
        </div>
        <button class="section-action-btn">清空历史</button>
      </div>

      ${this.renderSongTable(songs)}
    `;
  }

  renderSongTable(songs) {
    return `
      <div class="song-table">
        <div class="song-table-header">
          <div>#</div>
          <div>标题</div>
          <div>歌手</div>
          <div>专辑</div>
          <div>时长</div>
          <div></div>
        </div>
        ${songs.map((song, idx) => {
          const isCurrent = this.isPlaying && (this.currentSongId ? this.currentSongId === song.id : idx === 0);
          return `
            <div class="song-row ${isCurrent ? 'playing' : ''}" data-song-id="${song.id}" onclick="app.playSong('${song.id}', '${song.title}', '${song.artist}', '${song.cover}')">
              <div class="song-index-col">
                ${isCurrent ? `
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                ` : String(idx + 1).padStart(2, '0')}
              </div>
              <div class="song-title-col">
                <img class="song-row-cover" src="${song.cover}" alt="${song.title}" />
                <div class="song-row-meta">
                  <span class="song-row-title">${song.title}</span>
                  <span class="song-row-artist">${song.artist}</span>
                </div>
              </div>
              <div class="song-album-col" onclick="event.stopPropagation(); app.navigateTo('detail', { type: 'artist', id: 'art_1' })" style="cursor: pointer;">${song.artist}</div>
              <div class="song-album-col" onclick="event.stopPropagation(); app.navigateTo('detail', { type: 'album', id: 'alb_1' })" style="cursor: pointer;">${song.album}</div>
              <div class="song-duration-col">${song.duration}</div>
              <div class="song-actions-col">
                <button class="song-action-like" onclick="event.stopPropagation(); this.classList.toggle('liked');">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                </button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  bindDynamicViewEvents() {
    // 歌单广场分类胶囊点击过滤
    document.querySelectorAll('.category-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        const cat = pill.getAttribute('data-cat') || '全部';
        this.activeCategory = cat;
        this.renderView('discovery');
      });
    });

    // 搜索 Tab 胶囊切换
    document.querySelectorAll('.search-tab-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        const tab = pill.getAttribute('data-tab') || '单曲';
        this.activeSearchTab = tab;
        this.renderView('search');
      });
    });
  }

  togglePlay() {
    this.isPlaying = !this.isPlaying;
    const playBtn = document.getElementById('main-play-btn');
    const lyricsOverlay = document.getElementById('lyrics-overlay');

    if (playBtn) {
      playBtn.innerHTML = this.isPlaying ? `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
      ` : `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
      `;
    }

    if (lyricsOverlay) {
      if (this.isPlaying) {
        lyricsOverlay.classList.add('playing');
      } else {
        lyricsOverlay.classList.remove('playing');
      }
    }
  }

  playAll(title = '') {
    this.isPlaying = true;
    const playBtn = document.getElementById('main-play-btn');
    if (playBtn) {
      playBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
    }
  }

  playSong(songId, title, artist, cover) {
    this.isPlaying = true;
    this.currentSongId = songId;
    const playBtn = document.getElementById('main-play-btn');
    if (playBtn) {
      playBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
    }
    if (title) {
      const titleEl = document.getElementById('current-title');
      const artistEl = document.getElementById('current-artist');
      const coverEl = document.getElementById('current-cover');
      if (titleEl) titleEl.innerText = title;
      if (artistEl) artistEl.innerText = `${artist} · 精选专辑`;
      if (coverEl && cover) coverEl.src = cover;
    }

    // 局部同步行高亮与波形，静默播放不触发整页刷新动画
    document.querySelectorAll('.song-row').forEach(row => {
      row.classList.remove('playing');
    });
    const activeRow = document.querySelector(`.song-row[data-song-id="${songId}"]`);
    if (activeRow) activeRow.classList.add('playing');
  }

  toggleQueue() {
    this.isQueueOpen = !this.isQueueOpen;
    const drawer = document.getElementById('queue-drawer');
    const similarDrawer = document.getElementById('similar-drawer');
    const overlay = document.getElementById('drawer-overlay');

    if (similarDrawer) similarDrawer.classList.remove('open');
    if (drawer) {
      drawer.classList.toggle('open', this.isQueueOpen);
    }
    if (overlay) {
      overlay.classList.toggle('active', this.isQueueOpen);
    }
  }

  toggleSimilar() {
    this.isSimilarOpen = !this.isSimilarOpen;
    const drawer = document.getElementById('similar-drawer');
    const queueDrawer = document.getElementById('queue-drawer');
    const overlay = document.getElementById('drawer-overlay');

    if (queueDrawer) queueDrawer.classList.remove('open');
    if (drawer) {
      drawer.classList.toggle('open', this.isSimilarOpen);
    }
    if (overlay) {
      overlay.classList.toggle('active', this.isSimilarOpen);
    }
  }

  toggleSidebar() {
    this.isSidebarCollapsed = !this.isSidebarCollapsed;
    const layout = document.getElementById('app-layout');
    if (layout) {
      layout.classList.toggle('sidebar-collapsed', this.isSidebarCollapsed);
    }
  }

  cycleTheme() {
    const themes = ['dark', 'light', 'midnight', 'mint'];
    const currentIndex = themes.indexOf(this.currentTheme);
    const nextTheme = themes[(currentIndex + 1) % themes.length];
    this.currentTheme = nextTheme;
    document.documentElement.setAttribute('data-theme', nextTheme);
  }

  startProgressTicker() {
    setInterval(() => {
      if (!this.isPlaying) return;
      this.currentTime += 1;
      if (this.currentTime > this.duration) this.currentTime = 0;

      const progress = (this.currentTime / this.duration) * 100;
      const progressBar = document.getElementById('audio-progress');
      const timeCurrent = document.getElementById('time-current');
      if (progressBar) progressBar.style.width = `${progress}%`;
      if (timeCurrent) {
        const mins = Math.floor(this.currentTime / 60);
        const secs = String(this.currentTime % 60).padStart(2, '0');
        timeCurrent.innerText = `0${mins}:${secs}`;
      }

      if (this.isLyricsOpen) {
        this.renderLyricsContent();
      }
    }, 1000);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.app = new MusicPlayerDemo();
});
