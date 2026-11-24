import type { Doc } from "../model/types";

export interface SharedOption {
  id: string;
  name: string;
  doc: Doc;
  votes: number;
}

export interface SharedComment {
  id: string;
  name: string;
  optionId: string | null;
  text: string;
  createdAt: string;
}

export interface SharedLayout {
  id: string;
  title: string;
  createdAt: string;
  expiresAt: string;
  options: SharedOption[];
  comments: SharedComment[];
  viewerVote: string | null;
}

export interface CreatedShare {
  id: string;
  ownerKey: string;
  expiresAt: string;
}

export interface Participant {
  id: string;
  participantKey: string;
  name: string;
}
