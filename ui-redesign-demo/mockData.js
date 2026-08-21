/**
 * UI Redesign Demo 核心模拟数据 (Mock Data 深度扩充版)
 */

window.MOCK_DATA = {
  // 当前播放
  currentSong: {
    id: "s1",
    title: "晴天 (Sunny Day)",
    artist: "周杰伦",
    album: "叶惠美",
    duration: 269,
    cover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&q=80",
    lyrics: [
      { time: 0, text: "晴天 - 周杰伦", trans: "Sunny Day - Jay Chou" },
      { time: 5, text: "词 / 曲：周杰伦", trans: "Lyrics & Composed by Jay Chou" },
      { time: 15, text: "故事的小黄花 从出生那年就飘着", trans: "The little yellow flower in the story has drifted since the year I was born" },
      { time: 28, text: "童年的荡秋千 随记忆一直晃到现在", trans: "The swing of childhood swings with memory until now" },
      { time: 42, text: "Re So So Si Do Si La", trans: "Re So So Si Do Si La" },
      { time: 48, text: "So La Si Si Si Si La Si Re", trans: "So La Si Si Si Si La Si Re" },
      { time: 55, text: "吹着前奏望着天空 我想起花瓣试着掉落", trans: "Playing the prelude looking at the sky, I remember petals trying to fall" },
      { time: 69, text: "为你翘课的那一天 花落的那一天", trans: "The day I skipped class for you, the day flowers fell" },
      { time: 76, text: "教室的那一间 我怎么看不见", trans: "Inside that classroom, why couldn't I see?" },
      { time: 82, text: "消失的下雨天 我好想再淋一遍", trans: "The lost rainy day, I really want to be drenched once more" },
      { time: 90, text: "没想到失去的勇气我还留着", trans: "Never thought I still kept the courage I had lost" },
      { time: 98, text: "好想再问一遍 你会等待还是离开", trans: "I want to ask again, will you wait or leave?" },
      { time: 108, text: "刮风这天 我试过握着你手", trans: "On this windy day, I tried holding your hand" },
      { time: 114, text: "但偏偏 雨渐渐 大到我看你不见", trans: "But unfortunately, the rain became so heavy that I couldn't see you" },
      { time: 125, text: "还要多久 我才能在你身边", trans: "How much longer until I can be by your side?" },
      { time: 138, text: "等到放晴的那天 也许我会比较好一点", trans: "Waiting for the sunny day, maybe I will feel a bit better" },
      { time: 150, text: "从前从前 有个人爱你很久", trans: "Once upon a time, someone loved you for a very long time" },
      { time: 165, text: "但偏偏 风渐渐 把距离吹得好远", trans: "Yet the wind gradually blew the distance so far away" },
      { time: 180, text: "好不容易 又能再多爱一天", trans: "Finally able to love for just one more day" },
      { time: 195, text: "但故事的最后 你好像还是说了拜拜", trans: "But at the end of the story, you still said goodbye" }
    ]
  },

  // 首页推荐歌单
  homePlaylists: [
    { id: "pl_1", title: "华语流行经典回忆录：那些刻进青春的旋律", category: "华语", author: "网易云音乐官方", playCount: "128.4万", cover: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&q=80" },
    { id: "pl_2", title: "午夜微醺 Lo-Fi HipHop：灵感与治愈电波", category: "流行", author: "Chill Beats", playCount: "89.2万", cover: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&q=80" },
    { id: "pl_3", title: "R&B 柔情特辑：夜色蔓延时的浪漫私语", category: "欧美", author: "Soul Groove", playCount: "45.7万", cover: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&q=80" },
    { id: "pl_4", title: "电影原声大碟集锦：声临其境的视听史诗", category: "轻音乐", author: "OST Collector", playCount: "66.1万", cover: "https://images.unsplash.com/photo-1445985543470-41fdd6ce388d?w=400&q=80" },
    { id: "pl_5", title: "晨间活力咖啡馆：清新不甜腻的自留地", category: "爵士", author: "Morning Vibes", playCount: "32.0万", cover: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=400&q=80" },
    { id: "pl_6", title: "赛博霓虹 Synthwave：开往 80 年代未来的跑车", category: "电子", author: "Retro Wave", playCount: "19.8万", cover: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=400&q=80" },
    { id: "pl_7", title: "民谣吉他弹唱：风吹过的稻田与远方", category: "民谣", author: "Acoustic Life", playCount: "54.2万", cover: "https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=400&q=80" },
    { id: "pl_8", title: "硬核摇滚重金属：肾上腺素狂飙之夜", category: "摇滚", author: "Rock Spirit", playCount: "73.1万", cover: "https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?w=400&q=80" }
  ],

  // 歌手详情体系
  artists: [
    {
      id: "art_1",
      name: "周杰伦",
      alias: "Jay Chou",
      songsCount: 320,
      albumsCount: 15,
      avatar: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&q=80",
      banner: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=1200&q=80",
      desc: "华语流行音乐领军人物、音乐制作人、词曲创作者。开辟了华语乐坛的新时代。",
      hotSongs: [
        { id: "s1", title: "晴天", artist: "周杰伦", album: "叶惠美", duration: "04:29", cover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=100&q=80" },
        { id: "s2", title: "七里香", artist: "周杰伦", album: "七里香", duration: "04:59", cover: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=100&q=80" },
        { id: "s7", title: "夜曲", artist: "周杰伦", album: "十一月的萧邦", duration: "03:46", cover: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=100&q=80" },
        { id: "s9", title: "青花瓷", artist: "周杰伦", album: "我很忙", duration: "03:59", cover: "https://images.unsplash.com/photo-1445985543470-41fdd6ce388d?w=100&q=80" },
        { id: "s10", title: "简单爱", artist: "周杰伦", album: "范特西", duration: "04:30", cover: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=100&q=80" }
      ],
      albums: [
        { id: "alb_1", title: "叶惠美", year: "2003", songCount: 11, cover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&q=80" },
        { id: "alb_2", title: "七里香", year: "2004", songCount: 10, cover: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&q=80" },
        { id: "alb_3", title: "范特西", year: "2001", songCount: 10, cover: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=300&q=80" },
        { id: "alb_5", title: "十一月的萧邦", year: "2005", songCount: 12, cover: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&q=80" }
      ]
    },
    {
      id: "art_2",
      name: "王菲",
      alias: "Faye Wong",
      songsCount: 180,
      albumsCount: 12,
      avatar: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&q=80",
      banner: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=1200&q=80",
      desc: "华语乐坛传奇天后，声音空灵婉转，具有极高的艺术独特性与辨识度。",
      hotSongs: [
        { id: "s3", title: "如愿", artist: "王菲", album: "我和我的父辈 电影主题曲", duration: "04:18", cover: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100&q=80" },
        { id: "s11", title: "红豆", artist: "王菲", album: "唱游", duration: "04:15", cover: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=100&q=80" },
        { id: "s12", title: "传奇", artist: "王菲", album: "传奇单曲", duration: "04:58", cover: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=100&q=80" }
      ],
      albums: [
        { id: "alb_6", title: "唱游", year: "1998", songCount: 10, cover: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&q=80" },
        { id: "alb_7", title: "寓言", year: "2000", songCount: 12, cover: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&q=80" }
      ]
    },
    {
      id: "art_3",
      name: "陈奕迅",
      alias: "Eason Chan",
      songsCount: 290,
      albumsCount: 18,
      avatar: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=400&q=80",
      banner: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=1200&q=80",
      desc: "香港主流乐坛代表人物之一，被誉为新一代歌神，其抒情作品风靡华语世界。",
      hotSongs: [
        { id: "s13", title: "富士山下", artist: "陈奕迅", album: "What's Going On...?", duration: "04:19", cover: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=100&q=80" },
        { id: "s14", title: "十年", artist: "陈奕迅", album: "黑·白·灰", duration: "03:24", cover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=100&q=80" }
      ],
      albums: [
        { id: "alb_8", title: "黑·白·灰", year: "2003", songCount: 10, cover: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=300&q=80" }
      ]
    }
  ],

  // 专辑列表
  albums: [
    { id: "alb_1", title: "叶惠美", artist: "周杰伦", year: "2003", songCount: 11, desc: "周杰伦第四张国语专辑，融合古典与现代流行，斩获多项金曲大奖。", cover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&q=80" },
    { id: "alb_2", title: "七里香", artist: "周杰伦", year: "2004", songCount: 10, desc: "充满夏日微风与浪漫情怀的经典概念专辑。", cover: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&q=80" },
    { id: "alb_3", title: "范特西", artist: "周杰伦", year: "2001", songCount: 10, desc: "奠定周氏天王地位的划时代神作。", cover: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&q=80" },
    { id: "alb_4", title: "After Hours", artist: "The Weeknd", year: "2020", songCount: 14, desc: "引领 80 年代 Synthwave 潮流复兴的全球顶级大碟。", cover: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=400&q=80" }
  ],

  // 歌曲库
  songs: [
    { id: "s1", title: "晴天", artist: "周杰伦", album: "叶惠美", duration: "04:29", cover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=100&q=80" },
    { id: "s2", title: "七里香", artist: "周杰伦", album: "七里香", duration: "04:59", cover: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=100&q=80" },
    { id: "s3", title: "如愿", artist: "王菲", album: "我和我的父辈 电影主题曲", duration: "04:18", cover: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100&q=80" },
    { id: "s4", title: "Blinding Lights", artist: "The Weeknd", album: "After Hours", duration: "03:20", cover: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=100&q=80" },
    { id: "s5", title: "City of Stars", artist: "Ryan Gosling / Emma Stone", album: "La La Land Soundtrack", duration: "02:29", cover: "https://images.unsplash.com/photo-1445985543470-41fdd6ce388d?w=100&q=80" },
    { id: "s6", title: "Lemon", artist: "米津玄師", album: "Lemon", duration: "04:15", cover: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=100&q=80" },
    { id: "s7", title: "夜曲", artist: "周杰伦", album: "十一月的萧邦", duration: "03:46", cover: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=100&q=80" },
    { id: "s8", title: "Stay With Me", artist: "松原みき", album: "Pocket Park", duration: "04:35", cover: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=100&q=80" }
  ],

  // 排行榜列表
  charts: [
    { id: "c1", title: "飙升榜", update: "每天更新", desc: "云音乐用户近期收听涨幅最高歌曲", cover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&q=80" },
    { id: "c2", title: "热歌榜", update: "每周四更新", desc: "综合播放量排名前 100 首热门歌曲", cover: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&q=80" },
    { id: "c3", title: "新歌榜", update: "每天更新", desc: "最前沿最具热度的新发单曲榜", cover: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&q=80" },
    { id: "c4", title: "原创榜", update: "每周四更新", desc: "聚焦独立音乐人优秀原创声音", cover: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=300&q=80" }
  ],

  // 歌单广场分类
  categories: ["全部", "华语", "欧美", "流行", "摇滚", "电子", "民谣", "说唱", "轻音乐", "ACG", "爵士", "粤语"]
};
