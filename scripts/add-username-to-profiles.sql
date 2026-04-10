-- Add username column to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username TEXT;

-- Update existing profiles that might not have a username
UPDATE profiles SET username = split_part(email, '@', 1) WHERE username IS NULL;
