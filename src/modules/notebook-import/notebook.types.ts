export type NotebookStatus =
  | 'QUEUED'
  | 'EXTRACTING'
  | 'ANALYZING'
  | 'PUBLISHING'
  | 'COMPLETED'
  | 'REQUIRES_REVIEW'
  | 'FAILED';

export type ActivityBounds = { x: number; y: number; width: number; height: number };

export type AudioHotspot = ActivityBounds & { audioUrl: string; label: string };

export type PageInteraction = ActivityBounds & {
  id: string;
  type: 'navigate' | 'play-audio';
  label: string;
  targetPageId?: string;
  audioUrl?: string;
};

export type ParsedActivity = {
  sourcePath: string;
  sourceHash: string;
  candidateType: string | null;
  confidence: number;
  bounds: ActivityBounds;
  swfVersion: number;
};

export type ParsedPage = {
  sourcePageId: string;
  sortOrder: number;
  width: number;
  height: number;
  contentUrl: string;
  navigation: { targetPageId: string; label: string }[];
  audioHotspots: AudioHotspot[];
  interactions: PageInteraction[];
  activities: ParsedActivity[];
};

export type CourseOutline = {
  rootPageId: string;
  lessons: { pageId: string; label: string; children: string[] }[];
};

export type MatchingConfig = {
  pairs: { id: string; left: string; right: string; audioUrl?: string; imageUrl?: string }[];
};
