export const zhCN = {
  common: {
    brand: {
      home: "逐拍首页",
      name: "逐拍",
    },
    navigation: {
      primary: "主要页面",
      library: "曲谱库",
      viewer: "查看器",
      studio: "和弦工作室",
    },
    theme: {
      light: "浅色",
      dark: "深色",
      switchToLight: "切换至浅色主题",
      switchToDark: "切换至深色主题",
    },
    locale: {
      trigger: "语言",
      dialogLabel: "选择界面语言",
      system: "跟随系统",
      zhCN: "简体中文",
      enUS: "English",
      saving: "正在保存语言设置",
    },
  },
  library: {
    scoreCount_one: "{{count}} 份曲谱",
    scoreCount_other: "{{count}} 份曲谱",
  },
  viewer: {},
  studio: {},
  errors: {
    generic: "操作失败，请重试",
    localePreferenceWriteFailed: "无法保存语言设置，已保留当前语言",
  },
  desktop: {},
  meta: {
    title: "逐拍｜乐谱练习与和声分析",
    description: "用于乐谱阅读、播放练习与和声分析的本地优先工作台。",
    keywords: "逐拍,乐谱,练习,和声分析",
    openGraphLocale: "zh_CN",
  },
} as const;
