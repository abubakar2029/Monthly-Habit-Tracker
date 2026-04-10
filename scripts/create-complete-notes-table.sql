-- Create notes table if it doesn't exist
CREATE TABLE IF NOT EXISTS notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  color TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_notes_user_id ON notes(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_date ON notes(date);

-- Enable RLS
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

-- Create RLS policy to allow users to see their own notes
CREATE POLICY "Users can view their own notes" ON notes
  FOR SELECT USING (auth.uid() = user_id);

-- Create RLS policy to allow users to insert their own notes
CREATE POLICY "Users can insert their own notes" ON notes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Create RLS policy to allow users to delete their own notes
CREATE POLICY "Users can delete their own notes" ON notes
  FOR DELETE USING (auth.uid() = user_id);
