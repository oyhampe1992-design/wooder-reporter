export interface SessionMetadata {
  titre: string;
  participants: string;
  date: string;
}

export interface ActionItem {
  action: string;
  responsable: string;
  echeance: string;
}

export interface Report {
  resume_executif: string;
  points_cles: string[];
  decisions_prises: string[];
  actions_a_faire: ActionItem[];
  sujets_abordes: string[];
  verbatim_importants: string[];
  prochaines_etapes: string;
  conclusion: string;
}

export interface Session {
  id?: string;
  titre: string;
  participants: string;
  date_seance: string;
  duration_seconds: number;
  audio_url: string | null;
  transcript: string;
  report: Report | null;
  created_at?: string;
}
