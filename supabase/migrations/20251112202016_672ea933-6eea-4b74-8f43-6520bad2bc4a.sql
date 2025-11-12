-- Add file metadata columns to inputs table
ALTER TABLE inputs
ADD COLUMN IF NOT EXISTS file_size BIGINT,
ADD COLUMN IF NOT EXISTS mime_type TEXT,
ADD COLUMN IF NOT EXISTS upload_status TEXT DEFAULT 'completed',
ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Add index for faster queries on upload status
CREATE INDEX IF NOT EXISTS idx_inputs_upload_status ON inputs(upload_status);