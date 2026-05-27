export interface Session {
  session_id: number;
  label: string;
  started_at: string;   // ISO 8601 UTC
  ended_at: string | null;
  sample_count: number;
  dtc_count: number | null; // null = not yet loaded
}
