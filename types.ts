
export interface CardOutline {
  title: string;
  points: string[];
}

export interface DesignBlueprint {
  style: 'Academic' | 'Modern' | 'Tech' | 'Handwritten' | 'Business';
  themeColor: string;
  secondaryColor: string;
  fontPairing: {
    heading: string;
    body: string;
  };
  cardOutlines: CardOutline[];
  description: string;
}

export type WorkflowState = 'IDLE' | 'ANALYZING' | 'BLUEPRINT_READY' | 'GENERATING_CARD' | 'CARD_READY' | 'ERROR';

export interface GeneratedCard {
  index: number;
  html: string;
  title: string;
}
