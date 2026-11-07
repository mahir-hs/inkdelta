// The sample manuscript used by every demonstration on the page. Four versions, as if from Git history.
// (Made up for the demo: it is not a real study.)

export const VERSIONS = [
  { id: "3d7e1a9", short: "Baseline", label: "Baseline: paper v1 as submitted" },
  { id: "e2c07aa", short: "Draft 2", label: "Draft 2: answer reviewer 2" },
  { id: "8b3a1d2", short: "Revision", label: "Revision: add limitations" },
  { id: "a91c4e0", short: "Submitted", label: "Submitted: merge reviewer-2" },
];

/** The abstract's first paragraph in each version. */
export const ABSTRACT = [
  "We present a method for forecasting coastal flooding from sparse tide gauges. The model is trained on ten years of hourly data and performs well at most stations. Results suggest it may generalise to new regions.",
  "We present a method for forecasting coastal flooding from sparse tide gauges. The model is trained on ten years of hourly data and reduces forecast error by 18% at 31 of 36 stations. Results suggest it may generalise to new regions.",
  "We present a graph-based method for forecasting coastal flooding from sparse tide gauges. The model is trained on ten years of hourly data and reduces forecast error by 18% at 31 of 36 stations. Results suggest it may generalise to new regions, though we only tested the North Sea.",
  "We present a graph-based method for forecasting coastal flooding from sparse tide gauges. The model is trained on ten years of hourly data and reduces forecast error by 18% at 31 of 36 stations. Results are limited to the North Sea until more regions are tested.",
];

/** The whole page of the redline window. A null text means the paragraph does not exist in that version. */
export const PAGE = [
  { kind: "h", texts: ["Abstract", "Abstract", "Abstract", "Abstract"] },
  { kind: "p", texts: ABSTRACT },
  { kind: "h", texts: ["Methods", "Methods", "Methods", "Methods"] },
  {
    kind: "p",
    texts: [
      "Gauges report every hour. Missing readings are filled with the nearest value.",
      "Gauges report every hour. Missing readings are filled by linear interpolation.",
      "Gauges report every hour. Gaps shorter than six hours are filled by linear interpolation; longer gaps are dropped.",
      "Gauges report every hour. Gaps shorter than six hours are filled by linear interpolation; longer gaps are dropped.",
    ],
  },
  {
    kind: "p",
    texts: [
      null,
      null,
      "The model needs at least five years of history per gauge.",
      "The model needs at least five years of hourly history per gauge, and has not been tested outside the North Sea.",
    ],
  },
  { kind: "p", texts: ["Acknowledgements to be added.", "Acknowledgements to be added.", null, null] },
];

/** The app's own eight themes (window, panel, text) and six accents, copied from its source. */
export const THEMES = [
  { id: "graphite", label: "Graphite", mode: "dark", c: ["#0a0b0e", "#121318", "#ededf0"] },
  { id: "midnight", label: "Midnight", mode: "dark", c: ["#070914", "#0d1020", "#e8ecff"] },
  { id: "nord", label: "Nord", mode: "dark", c: ["#232831", "#2b303b", "#e5e9f0"] },
  { id: "forest", label: "Forest", mode: "dark", c: ["#0b100d", "#121915", "#e6efe8"] },
  { id: "dusk", label: "Dusk", mode: "dark", c: ["#0f0b14", "#171120", "#efe9f5"] },
  { id: "paper", label: "Paper", mode: "light", c: ["#e7e9ef", "#fbfbfd", "#16181f"] },
  { id: "sepia", label: "Sepia", mode: "light", c: ["#e9dfcf", "#f6efe2", "#3b2f22"] },
  { id: "mist", label: "Mist", mode: "light", c: ["#dfe6ee", "#f3f6fa", "#14202e"] },
];
export const ACCENTS = [
  { id: "default", label: "Indigo", color: "#5b69f0" },
  { id: "blue", label: "Blue", color: "#2d7ff0" },
  { id: "teal", label: "Teal", color: "#0e9f8e" },
  { id: "green", label: "Green", color: "#2f9e5f" },
  { id: "orange", label: "Orange", color: "#e0622c" },
  { id: "rose", label: "Rose", color: "#e0457b" },
];
