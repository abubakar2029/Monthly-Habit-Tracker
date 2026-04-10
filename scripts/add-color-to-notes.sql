-- Add color column to notes table
ALTER TABLE notes 
ADD COLUMN IF NOT EXISTS color TEXT;

-- Set default value for existing notes
UPDATE notes 
SET color = NULL 
WHERE color IS NULL;
