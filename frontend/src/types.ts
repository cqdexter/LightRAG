export interface Conversation {
  id: string;
  title: string;
  updatedAt: number;
}

export interface Reference {
  reference_id: string;
  file_path: string;
  content?: string[];
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  references?: Reference[];
  isError?: boolean;
  feedback?: 'useful' | 'useless';
}

export interface StreamCallbacks {
  onReferences: (refs: Reference[]) => void;
  onChunk: (text: string) => void;
  onError: (error: string) => void;
}

export interface ChatSettings {
  baseUrl: string;
  apiKey: string;
  mode: string;
  topK: number;
}
