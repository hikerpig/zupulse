import type { TranslationShape } from "../catalog-types";
import type { zhCN } from "./zh-CN";

export const enUS = {
  common: {
    brand: {
      home: "Zupulse home",
      name: "Zupulse",
    },
    navigation: {
      primary: "Primary navigation",
      library: "Library",
      viewer: "Viewer",
      studio: "Harmony Studio",
    },
    theme: {
      light: "Light",
      dark: "Dark",
      switchToLight: "Switch to light theme",
      switchToDark: "Switch to dark theme",
    },
    locale: {
      trigger: "Language",
      dialogLabel: "Choose interface language",
      system: "Follow system",
      zhCN: "简体中文",
      enUS: "English",
      saving: "Saving language preference",
    },
  },
  library: {
    scoreCount_one: "{{count}} score",
    scoreCount_other: "{{count}} scores",
  },
  viewer: {},
  studio: {},
  errors: {
    generic: "Something went wrong. Try again.",
    localePreferenceWriteFailed: "Could not save the language preference. The current language was kept.",
    import: {
      generic: "The score could not be imported.",
      unsupportedFormat: "This score format is not supported.",
      malformedScore: "The score file is damaged or has an invalid structure.",
      resourceLimitExceeded: "The score exceeds the safe resource limits.",
      mxlContainerMissing: "The MXL container is missing its descriptor.",
      mxlRootfileMissing: "The score referenced by the MXL container is missing.",
      emptyScore: "The score has no displayable musical structure.",
      noPlayableTimeline: "The score can be viewed, but it cannot be played.",
      coreStructureMismatch: "The imported musical structure does not match the source file.",
    },
  },
  desktop: {},
  meta: {
    title: "Zupulse | Score Practice and Harmony Analysis",
    description: "A local-first workbench for score reading, playback practice, and harmony analysis.",
    keywords: "Zupulse,score,practice,harmony analysis",
    openGraphLocale: "en_US",
  },
} as const satisfies TranslationShape<typeof zhCN>;
