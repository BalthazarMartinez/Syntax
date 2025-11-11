-- Add responsible_name column to opportunities table
ALTER TABLE public.opportunities 
ADD COLUMN responsible_name TEXT;

-- Make responsible_user_id nullable since we'll use responsible_name instead
ALTER TABLE public.opportunities 
ALTER COLUMN responsible_user_id DROP NOT NULL;

-- Update existing records to copy user names to responsible_name
UPDATE public.opportunities 
SET responsible_name = profiles.full_name
FROM public.profiles
WHERE opportunities.responsible_user_id = profiles.id;

-- Add a check constraint to ensure at least one is provided
ALTER TABLE public.opportunities
ADD CONSTRAINT check_responsible_provided 
CHECK (responsible_name IS NOT NULL OR responsible_user_id IS NOT NULL);