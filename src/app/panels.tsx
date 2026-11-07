// Maps each panel id to the component that fills it. Dockview looks panels up here.

import type { IDockviewPanelProps } from "dockview-react";
import type { FunctionComponent } from "react";
import { DocumentsPanel } from "../features/documents/DocumentsPanel";
import { GraphPanel } from "../features/graph/GraphPanel";
import { OutputPanel } from "../features/output/OutputPanel";
import { RedlinePanel } from "../features/redline/RedlinePanel";
import { ChangesHost, ReviewerHost, WordCommentsHost } from "../features/review/ReviewHosts";
import { AiPanel } from "../features/ai/AiPanel";
import { AskPanel } from "../features/ai/AskPanel";
import { TerminalPanel } from "../features/terminal/TerminalPanel";
import { TextDiffPanel } from "../features/textdiff/TextDiffPanel";
import { SourceControlPanel } from "../features/sourcecontrol/SourceControlPanel";

export const panelComponents: Record<string, FunctionComponent<IDockviewPanelProps>> = {
  redline: () => <RedlinePanel />,
  documents: () => <DocumentsPanel />,
  sourceControl: () => <SourceControlPanel />,
  reviewer: () => <ReviewerHost />,
  changes: () => <ChangesHost />,
  wordComments: () => <WordCommentsHost />,
  graph: () => <GraphPanel />,
  output: () => <OutputPanel />,
  textDiff: () => <TextDiffPanel />,
  ai: () => <AiPanel />,
  ask: () => <AskPanel />,
  terminal: () => <TerminalPanel />,
};
