-- Rename gdrive_file_id to gdrive_file_name in inputs table
ALTER TABLE public.inputs 
RENAME COLUMN gdrive_file_id TO gdrive_file_name;

-- Rename gdrive_file_id to gdrive_file_name in artifacts table
ALTER TABLE public.artifacts 
RENAME COLUMN gdrive_file_id TO gdrive_file_name;