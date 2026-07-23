import type { UiReferenceItem } from '../../shared/musicTypes';

export const uiReferenceItems: UiReferenceItem[] = [
  {
    area: '左侧导航',
    sourceLabel: 'Microsoft Store 公开截图',
    implementationNote: '固定宽度、分组导航、当前项使用红色强调和浅底反馈。'
  },
  {
    area: '顶部栏',
    sourceLabel: '公开视频与公开评测截图',
    implementationNote: '搜索框位于顶部中左区域，右侧保留登录、设置和窗口操作入口。'
  },
  {
    area: '底部播放栏',
    sourceLabel: '桌面端公开界面资料',
    implementationNote: '常驻底栏，中心控制、左侧歌曲信息、右侧队列和音量入口。'
  },
  {
    area: '歌词页',
    sourceLabel: '公开演示视频截图',
    implementationNote: '以大封面、柔和背景和居中歌词滚动形成播放详情层。'
  }
];
