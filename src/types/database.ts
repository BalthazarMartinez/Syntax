export type UserProfile = {
  id: string;
  full_name: string;
  email: string;
  role: 'admin' | 'member';
  created_at: string;
  updated_at: string;
};

export type Client = {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
};

export type Opportunity = {
  id: number;
  name: string;
  client_id: number;
  responsible_user_id?: string | null;
  responsible_name?: string | null;
  creation_date: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  client?: { name: string };
  responsible?: { full_name: string };
};

export type InputFile = {
  id: number;
  opportunity_id: number;
  file_name: string;
  gdrive_file_id: string;
  gdrive_web_url: string;
  uploaded_by: string;
  uploaded_at: string;
};

export type ArtifactDoc = {
  id: number;
  opportunity_id: number;
  file_name: string;
  gdrive_file_id: string;
  gdrive_web_url: string;
  generated_by: string;
  generated_at: string;
};
